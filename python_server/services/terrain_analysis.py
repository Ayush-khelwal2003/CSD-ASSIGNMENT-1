"""
Terrain Analysis Service
Builds a DEM (Digital Elevation Model) from contour line features.

Steps:
  1. Sample points from contour lines
  2. Interpolate elevation grid using scipy LinearNDInterpolator (fast, vectorised)
  3. Fill NoData cells with nearest-neighbour
  4. Compute D8 flow direction
  5. Compute flow accumulation (topological sort)

D8 direction encoding (same as Node.js version):
  Index: 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE
"""

import math
import numpy as np
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from typing import Any

# D8 neighbour offsets — row, col
DR = np.array([0, -1, -1, -1,  0,  1,  1,  1], dtype=np.int8)
DC = np.array([1,  1,  0, -1, -1, -1,  0,  1], dtype=np.int8)

EARTH_RADIUS_M = 6_371_000.0


def build_terrain_model(features: list, metadata: dict, target_cell_count: int = 50) -> dict[str, Any]:
    """
    Build terrain model from contour features.

    Args:
        features: list of GeoJSON-like contour features with elevation
        metadata: contour metadata (bounds, elevations)
        target_cell_count: approximate grid size per axis (higher = more detail, slower)
    Returns:
        dict with elevation_grid, flow_direction, flow_accumulation and grid geometry
    """
    bounds = metadata['bounds']
    lng_range = bounds['maxLng'] - bounds['minLng']
    lat_range = bounds['maxLat'] - bounds['minLat']

    max_range = max(lng_range, lat_range)
    cell_size = max_range / target_cell_count

    n_cols = max(5, math.ceil(lng_range / cell_size))
    n_rows = max(5, math.ceil(lat_range / cell_size))

    cell_size_lng = lng_range / n_cols
    cell_size_lat = lat_range / n_rows

    center_lat = (bounds['minLat'] + bounds['maxLat']) / 2
    cell_size_meters = _haversine(center_lat, bounds['minLng'], center_lat, bounds['minLng'] + cell_size_lng)

    print(f"  Grid: {n_rows}×{n_cols}, cell ~{cell_size_meters:.1f}m")

    # ── Step 1: Sample points ──────────────────────────────────────────────
    points, values = _sample_contour_points(features, n_cols)
    print(f"  Sampled {len(points)} points from {len(features)} contour lines")

    # ── Step 2: Interpolate grid (vectorised scipy) ────────────────────────
    elevation_grid = _interpolate_grid(points, values, n_rows, n_cols, bounds, cell_size_lng, cell_size_lat)

    # ── Step 3: D8 flow direction ──────────────────────────────────────────
    flow_direction = _calc_flow_direction(elevation_grid, n_rows, n_cols)

    # ── Step 4: Flow accumulation ──────────────────────────────────────────
    flow_accumulation = _calc_flow_accumulation(elevation_grid, flow_direction, n_rows, n_cols)

    return {
        'elevation_grid':   elevation_grid,
        'flow_direction':   flow_direction,
        'flow_accumulation': flow_accumulation,
        'nRows':            n_rows,
        'nCols':            n_cols,
        'bounds':           bounds,
        'cellSizeLng':      cell_size_lng,
        'cellSizeLat':      cell_size_lat,
        'cellSizeMeters':   cell_size_meters,
    }


# ─── Grid helpers ────────────────────────────────────────────────────────────

def grid_to_coords(row: int, col: int, bounds: dict, cell_size_lng: float, cell_size_lat: float):
    """Convert grid (row, col) → (lng, lat) centre coordinates."""
    lng = bounds['minLng'] + (col + 0.5) * cell_size_lng
    lat = bounds['minLat'] + (row + 0.5) * cell_size_lat
    return lng, lat


def coords_to_grid(lng: float, lat: float, bounds: dict, cell_size_lng: float, cell_size_lat: float):
    """Convert (lng, lat) → nearest grid (row, col)."""
    col = int((lng - bounds['minLng']) / cell_size_lng)
    row = int((lat - bounds['minLat']) / cell_size_lat)
    return row, col


def _haversine(lat1, lng1, lat2, lng2) -> float:
    """Haversine distance in metres."""
    r = EARTH_RADIUS_M
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ─── Sampling ────────────────────────────────────────────────────────────────

def _sample_contour_points(features: list, grid_size: int):
    """Sample (lng, lat) points and their elevations from contour lines."""
    max_per_line = max(5, grid_size // 2)
    pts, vals = [], []

    for feature in features:
        elev = feature['properties']['elevation']
        coords = feature['geometry']['coordinates']
        n = len(coords)
        if n == 0:
            continue

        if n <= max_per_line:
            sampled = coords
        else:
            # Evenly spaced indices
            indices = [round(i * (n - 1) / (max_per_line - 1)) for i in range(max_per_line)]
            sampled = [coords[i] for i in indices]

        for lng, lat in sampled:
            pts.append([lng, lat])
            vals.append(elev)

    return np.array(pts, dtype=np.float64), np.array(vals, dtype=np.float64)


# ─── Interpolation ───────────────────────────────────────────────────────────

def _interpolate_grid(points, values, n_rows, n_cols, bounds, cell_size_lng, cell_size_lat) -> np.ndarray:
    """
    Interpolate elevation for every grid cell using scipy LinearNDInterpolator.
    This is O(n log n) and vectorised — orders of magnitude faster than the
    per-triangle loop used in the Node.js implementation.
    """
    # Build grid of all cell-centre coordinates
    cols_arr = np.arange(n_cols)
    rows_arr = np.arange(n_rows)
    lngs = bounds['minLng'] + (cols_arr + 0.5) * cell_size_lng
    lats = bounds['minLat'] + (rows_arr + 0.5) * cell_size_lat
    grid_lngs, grid_lats = np.meshgrid(lngs, lats)  # shape: (n_rows, n_cols)
    grid_pts = np.column_stack([grid_lngs.ravel(), grid_lats.ravel()])

    # Linear (TIN-equivalent) interpolation
    lin_interp = LinearNDInterpolator(points, values)
    elev_flat = lin_interp(grid_pts)

    # Fill any NaN (outside convex hull) with nearest-neighbour
    nan_mask = np.isnan(elev_flat)
    if nan_mask.any():
        nn_interp = NearestNDInterpolator(points, values)
        elev_flat[nan_mask] = nn_interp(grid_pts[nan_mask])

    return elev_flat.reshape(n_rows, n_cols)


# ─── D8 Flow direction ───────────────────────────────────────────────────────

def _calc_flow_direction(elev: np.ndarray, n_rows: int, n_cols: int) -> np.ndarray:
    """
    D8 flow direction: each cell flows to its steepest downhill neighbour.
    Returns int8 array, -1 = no downhill neighbour (pit/boundary).
    """
    flow_dir = np.full((n_rows, n_cols), -1, dtype=np.int8)

    for d in range(8):
        dr, dc = int(DR[d]), int(DC[d])
        dist = 1.414 if d % 2 == 1 else 1.0

        # Shift elevation grid in direction d
        src = elev
        shifted = np.roll(np.roll(elev, -dr, axis=0), -dc, axis=1)

        # Boundary cells that rolled to the other side are invalid
        row_mask = np.ones(n_rows, dtype=bool)
        col_mask = np.ones(n_cols, dtype=bool)
        if dr > 0:
            row_mask[-dr:] = False
        elif dr < 0:
            row_mask[:-dr] = False
        if dc > 0:
            col_mask[-dc:] = False
        elif dc < 0:
            col_mask[:-dc] = False

        valid = np.outer(row_mask, col_mask)
        drop = (src - shifted) / dist

        # Update flow_dir where this direction gives a steeper drop
        improve = valid & (drop > 0)
        if d == 0:
            best_drop = np.where(improve, drop, -np.inf)
            flow_dir = np.where(improve, d, flow_dir)
        else:
            better = improve & (drop > best_drop)
            best_drop = np.where(better, drop, best_drop)
            flow_dir = np.where(better, d, flow_dir)

    return flow_dir.astype(np.int8)


# ─── Flow accumulation ───────────────────────────────────────────────────────

def _calc_flow_accumulation(elev: np.ndarray, flow_dir: np.ndarray,
                             n_rows: int, n_cols: int) -> np.ndarray:
    """
    Flow accumulation via topological sort (highest → lowest elevation).
    Each cell starts with 1 (itself) and passes its count to its downstream neighbour.
    """
    accum = np.ones((n_rows, n_cols), dtype=np.float64)

    # Sort cells from highest to lowest
    flat_idx = np.argsort(elev.ravel())[::-1]

    for idx in flat_idx:
        row, col = divmod(int(idx), n_cols)
        d = int(flow_dir[row, col])
        if d < 0:
            continue
        nr = row + int(DR[d])
        nc = col + int(DC[d])
        if 0 <= nr < n_rows and 0 <= nc < n_cols:
            accum[nr, nc] += accum[row, col]

    return accum
