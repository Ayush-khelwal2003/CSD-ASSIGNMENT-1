"""
Pond Site Selection Service

Identifies the best LAND location for a village pond using multi-factor
terrain suitability scoring. The selected site is adjacent to the drainage
system, NOT on the main channel/river itself.

Scoring factors (weights sum to 1.0):
  - channelOffset  0.25  Penalise cells on or near drainage channels
  - depression     0.20  Prefer natural terrain bowls
  - catchment      0.20  Prefer meaningful upstream flow
  - slope          0.15  Prefer flat / low-gradient areas
  - elevation      0.10  Prefer lower relative terrain
  - convergence    0.10  Prefer areas surrounded by higher ground

Identical algorithm to pondSiteSelection.js — only Python syntax differs.
"""

import math
import numpy as np
from collections import deque
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
IDEAL_CHANNEL_OFFSET = 5      # cells this far from channel → full offset score
MAX_CANDIDATES       = 5


def select_pond_site(terrain_model: dict, metadata: dict) -> dict:
    """
    Score every non-channel grid cell and return the best pond site + candidates.
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

    # ── 1. Channel mask ───────────────────────────────────────────────────
    accum_flat = flow_accum.ravel()
    sorted_accum = np.sort(accum_flat)
    threshold_idx = int(len(sorted_accum) * (1 - CHANNEL_PERCENTILE))
    channel_threshold = sorted_accum[min(threshold_idx, len(sorted_accum) - 1)]
    max_accum = float(sorted_accum[-1])

    is_channel = flow_accum >= channel_threshold
    print(f"  Accum max={max_accum:.0f}, channel threshold={channel_threshold:.0f}")

    # ── 2. BFS distance-to-nearest-channel ───────────────────────────────
    channel_dist = _bfs_channel_distance(is_channel, n_rows, n_cols)

    # ── 3. Slope grid ─────────────────────────────────────────────────────
    slope_grid, max_slope = _compute_slope(elev_grid, n_rows, n_cols)

    # ── 4. Score every candidate cell ─────────────────────────────────────
    log_max_accum = math.log(max_accum + 1)
    min_accum     = max_accum * MIN_ACCUM_FRACTION
    margin        = max(DEPRESSION_RADIUS + 1, int(min(n_rows, n_cols) * 0.05))

    cell_scores = []
    for row in range(margin, n_rows - margin):
        for col in range(margin, n_cols - margin):
            elev  = float(elev_grid[row, col])
            accum = float(flow_accum[row, col])

            rel_elev = (elev - elev_min) / elev_range
            if rel_elev > MAX_RELATIVE_ELEV:
                continue
            if accum < min_accum:
                continue
            if is_channel[row, col]:
                continue

            # Depression (wider neighbourhood)
            surr = _neighbourhood_stats(elev_grid, row, col, DEPRESSION_RADIUS, n_rows, n_cols)
            depression_depth = surr['mean'] - elev  # positive → cell is below surroundings

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
            s_elev     = 1.0 - rel_elev
            s_slope    = (1.0 - min(1.0, slope / max_slope)) if max_slope > 0 else 1.0
            s_depr     = min(1.0, max(0.0, (depression_depth / elev_range) * 10))
            s_conv     = convergence
            s_catch    = math.log(accum + 1) / log_max_accum
            s_offset   = min(1.0, dist_to_ch / IDEAL_CHANNEL_OFFSET)

            score = (s_elev   * WEIGHTS['elevation']     +
                     s_slope  * WEIGHTS['slope']         +
                     s_depr   * WEIGHTS['depression']    +
                     s_conv   * WEIGHTS['convergence']   +
                     s_catch  * WEIGHTS['catchment']     +
                     s_offset * WEIGHTS['channelOffset'])

            cell_scores.append({
                'row': row, 'col': col,
                'elev': elev, 'accum': accum,
                'slope': slope, 'dist_to_ch': dist_to_ch,
                'convergence': convergence,
                'depression_depth': depression_depth,
                'rel_elev': rel_elev,
                'score': score,
                'scores': {
                    'elevation':     _r4(s_elev),
                    'slope':         _r4(s_slope),
                    'depression':    _r4(s_depr),
                    'convergence':   _r4(s_conv),
                    'catchment':     _r4(s_catch),
                    'channelOffset': _r4(s_offset),
                }
            })

    # ── 5. Fallback ───────────────────────────────────────────────────────
    if not cell_scores:
        return _fallback(terrain_model, is_channel, channel_dist, n_rows, n_cols,
                         bounds, cell_size_lng, cell_size_lat, cell_size_m)

    # ── 6. Rank + spatially separate candidates ───────────────────────────
    cell_scores.sort(key=lambda x: x['score'], reverse=True)
    min_sep = max(3, int(min(n_rows, n_cols) * 0.08))

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
            'scoreBreakdown':         cell['scores'],
            'reason':                 _build_reason(cell, cell_size_m),
        }

    selected   = build_site(candidates[0])
    alternates = [build_site(c) for c in candidates[1:]]
    return {'selected': selected, 'candidates': alternates}


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
    max_slope = float(slope.max())
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


def _build_reason(cell: dict, cell_size_m: float) -> str:
    parts = []
    offset_m = cell['dist_to_ch'] * cell_size_m
    if offset_m > 0:
        parts.append(f"~{round(offset_m)}m offset from the main drainage channel (avoids stream/river)")
    if cell['depression_depth'] > 0:
        parts.append(f"natural depression ({cell['depression_depth']:.2f}m below surrounding terrain)")
    if cell['scores']['slope'] > 0.7:
        parts.append("low slope (suitable for pond construction)")
    elif cell['scores']['slope'] > 0.4:
        parts.append("moderate slope")
    if cell['convergence'] > 0.6:
        parts.append(f"terrain convergence ({round(cell['convergence'] * 100)}% of neighbors higher)")
    if cell['accum'] > 10:
        parts.append(f"upstream catchment contributing area (flow accumulation: {round(cell['accum'])})")
    if cell['rel_elev'] < 0.3:
        parts.append("located in lower portion of terrain")
    elif cell['rel_elev'] < 0.5:
        parts.append("moderate relative elevation")
    if not parts:
        parts.append("best composite terrain suitability score for land-based pond construction")
    return "Land site selected: " + "; ".join(parts) + "."


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
            'suitabilityScore': 0, 'score': 0,
            'flowAccumulation': round(float(flow_accum[best_r, best_c])),
            'distanceToChannelMeters': _r2(float(channel_dist[best_r, best_c]) * cell_size_m),
            'scoreBreakdown': {},
            'reason': 'Selected as best available land cell near drainage (fallback — limited valid candidates)',
        },
        'candidates': []
    }


def _r2(v): return round(v * 100) / 100
def _r4(v): return round(v * 10000) / 10000
