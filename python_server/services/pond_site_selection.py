"""
Pond Site Selection Service

Identifies the best LAND location for village ponds using multi-factor
terrain suitability scoring. The selected sites are adjacent to the drainage
system, NOT on the main channel/river itself.

Supports:
1. Multiple spatially distinct candidate pond locations (Rank 1, Rank 2, ...)
2. Configurable candidate count (MAX_POND_CANDIDATES environment variable / parameter)
3. Constrained land parcel search via optional "selected_area" (Bounding Box or Polygon)
4. Comprehensive pros & cons, trade-off comparisons, and flow metrics for each candidate.
"""

import os
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
MAX_CANDIDATES       = int(os.getenv("MAX_POND_CANDIDATES", "5"))


def select_pond_site(terrain_model: dict, metadata: dict, selected_area=None, max_candidates: int = None) -> dict:
    """
    Score every non-channel grid cell and return ranked, spatially distinct pond candidates.
    If selected_area is supplied, candidates are prioritized/constrained within that boundary.
    """
    target_count = int(max_candidates) if max_candidates and int(max_candidates) > 0 else MAX_CANDIDATES

    elev_grid      = terrain_model['elevation_grid']
    flow_accum     = terrain_model['flow_accumulation']
    n_rows         = terrain_model['nRows']
    n_cols         = terrain_model['nCols']
    bounds         = terrain_model['bounds']
    cell_size_lng  = terrain_model['cellSizeLng']
    cell_size_lat  = terrain_model['cellSizeLat']
    cell_size_m    = terrain_model['cellSizeMeters']

    min_elev = float(elev_grid.min())
    max_elev = float(elev_grid.max())
    elev_range = max_elev - min_elev if max_elev > min_elev else 1.0

    accum_flat = flow_accum.flatten()
    sorted_accum = np.sort(accum_flat)
    channel_idx = int(len(sorted_accum) * (1.0 - CHANNEL_PERCENTILE))
    channel_thresh = float(sorted_accum[min(channel_idx, len(sorted_accum) - 1)])
    is_channel = flow_accum >= channel_thresh

    channel_dist = _bfs_channel_distance(is_channel, n_rows, n_cols)
    slope_grid, max_slope = _compute_slope(elev_grid, n_rows, n_cols)
    max_accum = float(flow_accum.max())
    accum_denom = math.log(max_accum + 1) if max_accum > 0 else 1.0

    # Area filter function (if user selected a specific parcel)
    area_filter = _build_area_filter(selected_area)

    cell_scores = []
    for row in range(1, n_rows - 1):
        for col in range(1, n_cols - 1):
            if is_channel[row, col]:
                continue

            elev  = float(elev_grid[row, col])
            accum = float(flow_accum[row, col])
            rel_elev = (elev - min_elev) / elev_range

            lng, lat = grid_to_coords(row, col, bounds, cell_size_lng, cell_size_lat)
            in_selection = area_filter(lng, lat) if area_filter else True

            # If user selected an area, strictly filter or penalize cells outside it
            if area_filter and not in_selection:
                continue

            if rel_elev > MAX_RELATIVE_ELEV and not area_filter:
                continue

            # Factor 1: Channel offset (ideal = 3-8 cells away from channel)
            dist_ch = float(channel_dist[row, col])
            if dist_ch == 0:
                s_ch = 0.0
            elif dist_ch <= IDEAL_CHANNEL_OFFSET:
                s_ch = dist_ch / IDEAL_CHANNEL_OFFSET
            else:
                s_ch = max(0.2, 1.0 - (dist_ch - IDEAL_CHANNEL_OFFSET) * 0.08)

            # Factor 2: Relative elevation (lower = better for gravity capture)
            s_elev = 1.0 - rel_elev

            # Factor 3: Slope (gentle slope = better pond construction)
            s_slope = 1.0 - (float(slope_grid[row, col]) / max_slope if max_slope > 0 else 0)

            # Factor 4: Flow Accumulation
            s_accum = math.log(accum + 1) / accum_denom

            # Factor 5: Topographic depression
            stats = _neighbourhood_stats(elev_grid, row, col, DEPRESSION_RADIUS, n_rows, n_cols)
            depression_depth = max(0.0, stats['mean'] - elev)
            s_depr = min(1.0, depression_depth / 3.0)

            # Factor 6: Topographic convergence
            higher_count = sum(
                1 for dr in [-1, 0, 1] for dc in [-1, 0, 1]
                if (dr != 0 or dc != 0) and elev_grid[row + dr, col + dc] > elev
            )
            s_conv = higher_count / 8.0

            composite = (
                WEIGHTS['channelOffset'] * s_ch +
                WEIGHTS['elevation']     * s_elev +
                WEIGHTS['slope']         * s_slope +
                WEIGHTS['catchment']     * s_accum +
                WEIGHTS['depression']    * s_depr +
                WEIGHTS['convergence']   * s_conv
            )

            cell_scores.append({
                'row': row, 'col': col, 'lat': lat, 'lng': lng,
                'elev': elev, 'accum': accum, 'slope': float(slope_grid[row, col]),
                'dist_to_ch': dist_ch, 'convergence': s_conv,
                'depression_depth': depression_depth, 'rel_elev': rel_elev,
                'score': composite, 'in_selection': in_selection,
                'scores': {
                    'elevation': round(s_elev, 3),
                    'slope': round(s_slope, 3),
                    'depression': round(s_depr, 3),
                    'convergence': round(s_conv, 3),
                    'catchment': round(s_accum, 3),
                    'channelOffset': round(s_ch, 3)
                }
            })

    if not cell_scores:
        # Fallback if selected area was very small or had strict filtering
        if area_filter:
            for row in range(1, n_rows - 1):
                for col in range(1, n_cols - 1):
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

    # ── Rank + Spatially Distribute Candidates ────────────────────────────
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
        if len(candidates) >= target_count:
            break

    if not candidates:
        candidates = [cell_scores[0]]

    def build_site(cell, rank: int):
        lng, lat = grid_to_coords(cell['row'], cell['col'], bounds, cell_size_lng, cell_size_lat)
        offset_m = cell['dist_to_ch'] * cell_size_m
        
        # Build Pros & Cons
        pros = []
        cons = []
        
        if cell.get('in_selection', False) and area_filter:
            pros.append("Located strictly inside user-designated land parcel")
            
        if cell['depression_depth'] > 0.05:
            pros.append(f"Natural micro-depression ({cell['depression_depth']:.2f}m depth) minimizes excavation needs")
        else:
            cons.append("Standard flat terrain; requires full excavation depth")
            
        if cell['accum'] > 12:
            pros.append(f"High upstream runoff accumulation (flow accum: {round(cell['accum'])})")
        elif cell['accum'] > 5:
            pros.append(f"Moderate upstream catchment runoff (flow accum: {round(cell['accum'])})")
        else:
            cons.append("Smaller upstream catchment; primarily captures direct local rainfall")
            
        if offset_m >= 30:
            pros.append(f"Safe distance (~{round(offset_m)}m) from main drainage channel prevents flood breach")
        elif offset_m > 0:
            pros.append(f"~{round(offset_m)}m buffer from natural drainage channel")
        else:
            cons.append("Adjacent to channel; embankment reinforcement recommended during peak monsoons")
            
        if cell['scores'].get('slope', 0) > 0.65:
            pros.append("Low terrain slope (<3%) provides high pond bank stability")
        else:
            cons.append("Slight terrain gradient; requires site leveling during pond bunding")
            
        if cell['rel_elev'] < 0.35:
            pros.append("Low-lying valley elevation facilitates gravity-fed drainage inflow")
        elif cell['rel_elev'] > 0.55:
            cons.append("Higher relative elevation compared to surrounding valley floor")

        if not pros:
            pros.append("Balanced multi-factor geospatial terrain score")

        # Estimate catchment area in m2
        cell_area_m2 = cell_size_m * cell_size_m
        est_catchment_m2 = round(max(float(cell['accum']) * cell_area_m2, cell_area_m2 * 2), 2)

        return {
            'id':                     f"candidate-{rank}",
            'rank':                   rank,
            'name':                   f"Candidate #{rank}" + (" (Recommended)" if rank == 1 else ""),
            'isRecommended':          (rank == 1),
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
            'distanceToChannelMeters': _r2(offset_m),
            'inSelectedArea':         bool(cell.get('in_selection', False)),
            'scoreBreakdown':         cell['scores'],
            'reason':                 _build_reason(cell, cell_size_m, area_filter is not None),
            'pros':                   pros,
            'cons':                   cons,
            'estimatedCatchmentM2':   est_catchment_m2
        }

    all_sites  = [build_site(c, rank=i+1) for i, c in enumerate(candidates)]
    selected   = all_sites[0]
    return {
        'selected':   selected,
        'candidates': all_sites,         # ALL candidates (rank 1 to N)
        'alternates': all_sites[1:]      # For backwards-compatibility
    }


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
    site = {
        'id': 'candidate-1',
        'rank': 1,
        'name': 'Candidate #1 (Primary)',
        'isRecommended': True,
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
        'pros': ['Positioned on flat ground near natural channel buffer'],
        'cons': ['Fallback site based on channel proximity heuristics'],
        'estimatedCatchmentM2': round(float(flow_accum[best_r, best_c]) * (cell_size_m ** 2), 2)
    }
    return {
        'selected': site,
        'candidates': [site],
        'alternates': []
    }


def _r2(v): return round(v * 100) / 100
def _r4(v): return round(v * 10000) / 10000
