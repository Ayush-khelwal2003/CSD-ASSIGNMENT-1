"""
Catchment Analysis Service

Delineates the contributing catchment area upstream of the selected pond site.

Method:
  - Reverse BFS on the D8 flow direction grid from the pour point
  - Collect all cells whose flow path eventually reaches the pond
  - Build a GeoJSON polygon by unioning cell bounding boxes (via shapely)
  - Calculate geodesic area using the spherical excess formula

Identical algorithm to catchmentAnalysis.js.
"""

import math
from collections import deque
import numpy as np
from shapely.geometry import box, mapping
from shapely.ops import unary_union
from .terrain_analysis import DR, DC

EARTH_RADIUS_M = 6_371_000.0


def delineate_catchment(terrain_model: dict, pond_site: dict) -> dict:
    """
    Trace upstream catchment from pond_site and return polygon + area.
    """
    flow_dir = terrain_model['flow_direction']
    n_rows   = terrain_model['nRows']
    n_cols   = terrain_model['nCols']
    bounds   = terrain_model['bounds']
    csl      = terrain_model['cellSizeLng']
    cslat    = terrain_model['cellSizeLat']
    csm      = terrain_model['cellSizeMeters']

    pour_row = pond_site['row']
    pour_col = pond_site['col']

    # ── Trace upstream ─────────────────────────────────────────────────────
    catchment_cells = _trace_upstream(flow_dir, n_rows, n_cols, pour_row, pour_col)
    print(f"  Catchment cells: {len(catchment_cells)}")

    if not catchment_cells:
        return {'polygon': None, 'areaSquareMeters': 0.0, 'areaHectares': 0.0, 'areaSquareKilometers': 0.0}

    # ── Build polygon ──────────────────────────────────────────────────────
    polygon_geojson, area_m2 = _cells_to_polygon(catchment_cells, bounds, csl, cslat, csm)

    ha   = area_m2 / 10_000
    km2  = area_m2 / 1_000_000

    return {
        'polygon':           polygon_geojson,
        'areaSquareMeters':  round(area_m2 * 100) / 100,
        'areaHectares':      round(ha * 10_000) / 10_000,
        'areaSquareKilometers': round(km2 * 10_000) / 10_000,
    }


def _trace_upstream(flow_dir: np.ndarray, n_rows: int, n_cols: int,
                    pour_row: int, pour_col: int) -> set:
    """BFS reverse-trace: collect all cells that drain into (pour_row, pour_col)."""
    catchment = set()
    catchment.add((pour_row, pour_col))
    q = deque([(pour_row, pour_col)])

    while q:
        row, col = q.popleft()
        for d in range(8):
            nr = row + int(DR[d])
            nc = col + int(DC[d])
            if not (0 <= nr < n_rows and 0 <= nc < n_cols):
                continue
            if (nr, nc) in catchment:
                continue
            # Neighbour at direction d flows into (row,col) if its direction
            # points back (opposite = (d+4) % 8)
            opposite = (d + 4) % 8
            if int(flow_dir[nr, nc]) == opposite:
                catchment.add((nr, nc))
                q.append((nr, nc))

    return catchment


def _cells_to_polygon(cells: set, bounds: dict, csl: float, cslat: float, csm: float):
    """Union individual cell boxes into a single shapely polygon, compute area."""
    polys = []
    for (row, col) in cells:
        min_lng = bounds['minLng'] + col * csl
        max_lng = min_lng + csl
        min_lat = bounds['minLat'] + row * cslat
        max_lat = min_lat + cslat
        polys.append(box(min_lng, min_lat, max_lng, max_lat))

    try:
        merged = unary_union(polys)
    except Exception:
        # Fallback: convex hull
        from shapely.geometry import MultiPolygon
        merged = unary_union(polys).convex_hull

    area_m2 = _geodesic_area_m2(merged)
    return mapping(merged), area_m2


def _geodesic_area_m2(geom) -> float:
    """
    Approximate geodesic area using the spherical excess formula.
    Works on shapely Polygon or MultiPolygon.
    Falls back to cell-count estimate if geometry is unusual.
    """
    try:
        if geom.geom_type == 'MultiPolygon':
            return sum(_poly_area(p) for p in geom.geoms)
        return _poly_area(geom)
    except Exception:
        return 0.0


def _poly_area(poly) -> float:
    coords = list(poly.exterior.coords)
    area = 0.0
    for i in range(len(coords) - 1):
        lng1, lat1 = coords[i]
        lng2, lat2 = coords[i + 1]
        area += math.radians(lng2 - lng1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(area) * EARTH_RADIUS_M ** 2 / 2
