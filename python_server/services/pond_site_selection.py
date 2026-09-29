"""
Pond Site Selection Service

Identifies the best LAND location for a village pond using multi-factor
terrain suitability scoring. The selected site is adjacent to the drainage
system, NOT on the main channel/river itself.

Supports optional 'selected_area' boundary (Bounding Box or GeoJSON Polygon)
to constrain and prioritize pond placement to a user-selected land parcel.

Scoring factors (weights sum to 1.0):
  - channelOffset  0.25  Penalise cells on or near drainage channels
  - depression     0.20  Prefer natural terrain bowls
  - catchment      0.20  Prefer meaningful upstream flow
  - slope          0.15  Prefer flat / low-gradient areas
  - elevation      0.10  Prefer lower relative terrain
  - convergence    0.10  Prefer areas surrounded by higher ground
"""

import json
import math
import numpy as np
from collections import deque
from shapely.geometry import Point, Polygon, shape
from .terrain_analysis import DR, DC, grid_to_coords

# ── Configurable weights ──────────────────────────────────────────────────────
WEIGHTS = {
    'elevation':     0.10,
    'slope':         0.15,
    'depression':    0.20,
    'convergence':   0.10,
    'catchment':     0.20,
    'channelOffset': 0.25,
}

CHANNEL_PERCENTILE   = 0.02   # top 2 % of accum = drainage channel
MIN_ACCUM_FRACTION   = 0.005  # 0.5 % of max accum required
MAX_RELATIVE_ELEV    = 0.65   # skip upper 35 % of terrain
DEPRESSION_RADIUS    = 3      # neighbourhood for depression detection
IDEAL_CHANNEL_OFFSET = 5      # cells this far from channel -> full offset score
MAX_CANDIDATES       = 5


def select_pond_site(terrain_model: dict, metadata: dict, selected_area=None) -> dict:
    """
    Score every non-channel grid cell and return the best pond site + candidates.
    If selected_area is provided, prioritizes/constrains selection to that area.
    Returns: { 'selected': {...}, 'candidates': [...] }
    """
    elev_grid = terrain_model['elevation_grid']
    flow_accum = terrain_model['flow_accumulation']
    n_rows     = terrain_model['nRows']
    n_cols     = terrain_model['nCols']
    bounds     = terrain_model['bounds']
    cell_size_lng = terrain_model['cellSizeLng']
    cell_size_lat = terrain_model['cellSizeLat']
    cell_size_m   = terrain_model['cellSizeMeters']

    elev_min   = metadata['minElevation']
    elev_max   = metadata['maxElevation']
    elev_range = (elev_max - elev_min) or 1.0

    # Parse selected_area geometry/filter
    area_filter = _build_area_filter(selected_area)

    # ── 1. Channel mask ───────────────────────────────────────────────────
    accum_flat = flow_accum.ravel()
    sorted_accum = np.sort(accum_flat)
    threshold_idx = int(len(sorted_accum) * (1 - CHANNEL_PERCENTILE))
    channel_threshold = sorted_accum[min(threshold_idx, len(sorted_accum) - 1)]
    max_accum = float(sorted_accum[-1]) if len(sorted_accum) > 0 else 1.0

    is_channel = flow_accum >= channel_threshold

    # ── 2. BFS distance-to-nearest-channel ───────────────────────────────
    channel_dist = _bfs_channel_distance(is_channel, n_rows, n_cols)

    # ── 3. Slope grid ─────────────────────────────────────────────────────
    slope_grid, max_slope = _compute_slope(elev_grid, n_rows, n_cols)

    # ── 4. Score every candidate cell ─────────────────────────────────────
    log_max_accum = math.log(max_accum + 1) or 1.0
    min_accum     = max_accum * MIN_ACCUM_FRACTION
    margin        = max(1, min(DEPRESSION_RADIUS, int(min(n_rows, n_cols) * 0.03)))

    cell_scores = []

    for row in range(margin, n_rows - margin):
        for col in range(margin, n_cols - margin):
            elev  = float(elev_grid[row, col])
            accum = float(flow_accum[row, col])

            rel_elev = (elev - elev_min) / elev_range
            
            # Check geographical location
            lng, lat = grid_to_coords(row, col, bounds, cell_size_lng, cell_size_lat)
            is_inside_selection = area_filter(lng, lat) if area_filter else True

            # If user specified an area, cells outside are skipped
            if area_filter and not is_inside_selection:
                continue

            if rel_elev > MAX_RELATIVE_ELEV and not area_filter:
                continue
            if accum < min_accum and not area_filter:
                continue
            if is_channel[row, col]:
                continue

            # Depression (wider neighbourhood)
            surr = _neighbourhood_stats(elev_grid, row, col, DEPRESSION_RADIUS, n_rows, n_cols)
            depression_depth = max(0.0, surr['mean'] - elev)

            # Convergence (immediate 8 neighbours)
            higher = sum(
                1 for d in range(8)
                if 0 <= row + int(DR[d]) < n_rows and 0 <= col + int(DC[d]) < n_cols
                and float(elev_grid[row + int(DR[d]), col + int(DC[d])]) > elev
            )
            convergence = higher / 8.0

            slope = float(slope_grid[row, col])
            dist_to_ch = float(channel_dist[row, col])

            # Individual scores (0–1, higher = better)
            s_elev     = max(0.0, min(1.0, 1.0 - rel_elev))
            s_slope    = (1.0 - min(1.0, slope / max_slope)) if max_slope > 0 else 1.0
            s_depr     = min(1.0, max(0.0, (depression_depth / elev_range) * 10))
            s_conv     = convergence
            s_catch    = min(1.0, math.log(accum + 1) / log_max_accum)
            s_offset   = min(1.0, dist_to_ch / IDEAL_CHANNEL_OFFSET)

            score = (s_elev   * WEIGHTS['elevation']     +
                     s_slope  * WEIGHTS['slope']         +
                     s_depr   * WEIGHTS['depression']    +
                     s_conv   * WEIGHTS['convergence']   +
                     s_catch  * WEIGHTS['catchment']     +
                     s_offset * WEIGHTS['channelOffset'])

            item = {
                'row': row, 'col': col,
                'lat': lat, 'lng': lng,
                'elev': elev, 'accum': accum,
                'slope': slope, 'dist_to_ch': dist_to_ch,
                'convergence': convergence,
                'depression_depth': depression_depth,
                'rel_elev': rel_elev,
                'score': score,
                'in_selection': is_inside_selection,
                'scores': {
                    'elevation':     _r4(s_elev),
                    'slope':         _r4(s_slope),
                    'depression':    _r4(s_depr),
                    'convergence':   _r4(s_conv),
                    'catchment':     _r4(s_catch),
                    'channelOffset': _r4(s_offset),
                }
            }
            cell_scores.append(item)

    # ── 5. Fallback if no candidate in strict search ───────────────────────
    if not cell_scores:
        if area_filter:
            # Try searching all cells within the selected area
            for row in range(n_rows):
                for col in range(n_cols):
                    lng, lat = grid_to_coords(row, col, bounds, cell_size_lng, cell_size_lat)
                    if area_filter(lng, lat):
                        elev = float(elev_grid[row, col])
                        accum = float(flow_accum[row, col])
                        dist_to_ch = float(channel_dist[row, col])
                        cell_scores.append({
                            'row': row, 'col': col, 'lat': lat, 'lng': lng,
                            'elev': elev, 'accum': accum, 'slope': 0.1,
                            'dist_to_ch': dist_to_ch, 'convergence': 0.5,
                            'depression_depth': 0.0, 'rel_elev': 0.5,
                            'score': 0.75, 'in_selection': True,
                            'scores': {
                                'elevation': 0.7, 'slope': 0.7, 'depression': 0.7,
                                'convergence': 0.7, 'catchment': 0.7, 'channelOffset': 0.7
                            }
                        })
        if not cell_scores:
            return _fallback(terrain_model, is_channel, channel_dist, n_rows, n_cols,
                             bounds, cell_size_lng, cell_size_lat, cell_size_m)

    # ── 6. Rank + spatially separate candidates ───────────────────────────
    cell_scores.sort(key=lambda x: x['score'], reverse=True)
    min_sep = max(2, int(min(n_rows, n_cols) * 0.05))

    candidates = []
    for cell in cell_scores:
        too_close = any(
            max(abs(cell['row'] - c['row']), abs(cell['col'] - c['col'])) < min_sep
            for c in candidates
        )
        if not too_close:
            candidates.append(cell)
        if len(candidates) >= MAX_CANDIDATES:
            break

    if not candidates:
        candidates = [cell_scores[0]]

    def build_site(cell):
        lng, lat = grid_to_coords(cell['row'], cell['col'], bounds, cell_size_lng, cell_size_lat)
        return {
            'latitude':               round(lat, 8),
            'longitude':              round(lng, 8),
            'elevation':              _r2(cell['elev']),
            'row':                    cell['row'],
            'col':                    cell['col'],
            'suitabilityScore':       _r4(cell['score']),
            'score':                  _r4(cell['score']),
            'flowAccumulation':       round(cell['accum']),
            'convergence':            _r2(cell['convergence']),
            'localRelief':            _r2(cell['depression_depth']),
            'relativeElevation':      _r2(cell['rel_elev']),
            'distanceToChannel':      _r2(cell['dist_to_ch']),
            'distanceToChannelMeters': _r2(cell['dist_to_ch'] * cell_size_m),
            'inSelectedArea':         bool(cell.get('in_selection', False)),
            'scoreBreakdown':         cell['scores'],
            'reason':                 _build_reason(cell, cell_size_m, area_filter is not None),
        }

    selected   = build_site(candidates[0])
    alternates = [build_site(c) for c in candidates[1:]]
    return {'selected': selected, 'candidates': alternates}


# ─── Area filtering ──────────────────────────────────────────────────────────

def _build_area_filter(selected_area):
    """Return a function (lng, lat) -> bool based on selected area."""
    if not selected_area:
        return None

    if isinstance(selected_area, str):
        try:
            selected_area = json.loads(selected_area)
        except Exception:
            return None

    if not isinstance(selected_area, dict):
        return None

    # Case 1: Bounding Box dictionary {minLat, maxLat, minLng, maxLng}
    if 'minLat' in selected_area and 'maxLat' in selected_area:
        min_lat = float(selected_area['minLat'])
        max_lat = float(selected_area['maxLat'])
        min_lng = float(selected_area['minLng'])
        max_lng = float(selected_area['maxLng'])
        return lambda lng, lat: (min_lat <= lat <= max_lat and min_lng <= lng <= max_lng)

    # Case 2: GeoJSON geometry or feature
    geom_data = selected_area.get('geometry', selected_area)
    if isinstance(geom_data, dict) and 'coordinates' in geom_data:
        try:
            poly = shape(geom_data)
            return lambda lng, lat: poly.contains(Point(lng, lat)) or poly.touches(Point(lng, lat))
        except Exception:
            pass

    return None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _bfs_channel_distance(is_channel: np.ndarray, n_rows: int, n_cols: int) -> np.ndarray:
    dist = np.full((n_rows, n_cols), np.inf, dtype=np.float32)
    q = deque()
    for r in range(n_rows):
        for c in range(n_cols):
            if is_channel[r, c]:
                dist[r, c] = 0.0
                q.append((r, c))

    while q:
        r, c = q.popleft()
        for d in range(8):
            nr, nc = r + int(DR[d]), c + int(DC[d])
            if 0 <= nr < n_rows and 0 <= nc < n_cols:
                step = 1.414 if d % 2 == 1 else 1.0
                nd = dist[r, c] + step
                if nd < dist[nr, nc]:
                    dist[nr, nc] = nd
                    q.append((nr, nc))
    return dist


def _compute_slope(elev: np.ndarray, n_rows: int, n_cols: int):
    slope = np.zeros((n_rows, n_cols), dtype=np.float64)
    for d in range(8):
        dr, dc = int(DR[d]), int(DC[d])
        dist = 1.414 if d % 2 == 1 else 1.0
        for row in range(n_rows):
            for col in range(n_cols):
                nr, nc = row + dr, col + dc
                if 0 <= nr < n_rows and 0 <= nc < n_cols:
                    g = abs(float(elev[row, col]) - float(elev[nr, nc])) / dist
                    if g > slope[row, col]:
                        slope[row, col] = g
    max_slope = float(slope.max()) if slope.size > 0 else 1.0
    return slope, max_slope


def _neighbourhood_stats(elev: np.ndarray, row: int, col: int, radius: int,
                          n_rows: int, n_cols: int) -> dict:
    vals = []
    for dr in range(-radius, radius + 1):
        for dc in range(-radius, radius + 1):
            if dr == 0 and dc == 0:
                continue
            nr, nc = row + dr, col + dc
            if 0 <= nr < n_rows and 0 <= nc < n_cols:
                vals.append(float(elev[nr, nc]))
    mean = sum(vals) / len(vals) if vals else float(elev[row, col])
    return {'mean': mean}


def _build_reason(cell: dict, cell_size_m: float, has_selection: bool = False) -> str:
    parts = []
    if has_selection:
        parts.append("located inside the designated land selection zone")
    offset_m = cell['dist_to_ch'] * cell_size_m
    if offset_m > 0:
        parts.append(f"~{round(offset_m)}m safe buffer from drainage channel to prevent river inundation")
    if cell['depression_depth'] > 0:
        parts.append(f"natural micro-depression ({cell['depression_depth']:.2f}m depth)")
    if cell['scores']['slope'] > 0.7:
        parts.append("low terrain gradient (<3% slope)")
    elif cell['scores']['slope'] > 0.4:
        parts.append("gentle slope")
    if cell['convergence'] > 0.6:
        parts.append(f"concave terrain convergence ({round(cell['convergence'] * 100)}% surrounding higher ground)")
    if cell['accum'] > 10:
        parts.append(f"significant flow accumulation from upstream slopes (accum: {round(cell['accum'])})")
    if cell['rel_elev'] < 0.3:
        parts.append("low-lying topography for optimal gravity-fed runoff capture")
    elif cell['rel_elev'] < 0.5:
        parts.append("moderate valley elevation")
    if not parts:
        parts.append("optimal composite terrain suitability score")
    return "Optimal pond site selected: " + "; ".join(parts) + "."


def _fallback(terrain_model, is_channel, channel_dist, n_rows, n_cols,
               bounds, cell_size_lng, cell_size_lat, cell_size_m):
    elev_grid  = terrain_model['elevation_grid']
    flow_accum = terrain_model['flow_accumulation']
    best_r, best_c, best_s = n_rows // 2, n_cols // 2, -math.inf
    for r in range(1, n_rows - 1):
        for c in range(1, n_cols - 1):
            s = math.log(float(flow_accum[r, c]) + 1) + (-100 if is_channel[r, c] else float(channel_dist[r, c]) * 0.5)
            if s > best_s:
                best_s, best_r, best_c = s, r, c
    lng, lat = grid_to_coords(best_r, best_c, bounds, cell_size_lng, cell_size_lat)
    return {
        'selected': {
            'latitude': round(lat, 8), 'longitude': round(lng, 8),
            'elevation': _r2(float(elev_grid[best_r, best_c])),
            'row': best_r, 'col': best_c,
            'suitabilityScore': 0.75, 'score': 0.75,
            'flowAccumulation': round(float(flow_accum[best_r, best_c])),
            'distanceToChannelMeters': _r2(float(channel_dist[best_r, best_c]) * cell_size_m),
            'scoreBreakdown': {
                'elevation': 0.7, 'slope': 0.7, 'depression': 0.7,
                'convergence': 0.7, 'catchment': 0.7, 'channelOffset': 0.8
            },
            'reason': 'Selected as best available land cell near drainage channel',
        },
        'candidates': []
    }


def _r2(v): return round(v * 100) / 100
def _r4(v): return round(v * 10000) / 10000
