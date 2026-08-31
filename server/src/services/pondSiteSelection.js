/**
 * Pond Site Selection Service
 * 
 * Identifies suitable LAND locations for village pond construction based on
 * multi-factor terrain suitability analysis.
 * 
 * Key design principle: The pond should be on land ADJACENT to the drainage
 * system, NOT directly on the strongest drainage channel/stream/river.
 * 
 * Selection criteria:
 * - Local depression (terrain dips below surroundings)
 * - Low relative elevation (lower portions of terrain)
 * - Low/moderate slope (flat enough for pond construction)
 * - Meaningful upstream catchment (enough water will reach the pond)
 * - Terrain convergence (surrounded by higher ground)
 * - Offset from the main drainage channel (NOT on the river/stream itself)
 * 
 * The scoring weights are configurable constants so the system can be tuned
 * for different contour maps without hard-coding sample-specific values.
 * 
 * Returns ranked candidates with composite scores and detailed breakdowns.
 */

const { gridToCoords, haversineDistance } = require('../utils/geometry');
const { DR, DC } = require('./terrainAnalysis');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURABLE SCORING WEIGHTS
// Adjust these to change the relative importance of each suitability factor.
// All weights should sum to 1.0.
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  elevation:     0.10,  // Prefer lower relative elevation
  slope:         0.15,  // Prefer flat/low-slope areas
  depression:    0.20,  // Prefer local depressions (terrain bowls)
  convergence:   0.10,  // Prefer areas surrounded by higher terrain
  catchment:     0.20,  // Prefer areas with meaningful upstream catchment
  channelOffset: 0.25,  // Penalize cells on or very near drainage channels
};

// Percentile threshold for identifying "drainage channel" cells.
// Cells with flow accumulation in the top CHANNEL_PERCENTILE fraction
// are classified as channel/stream cells.
const CHANNEL_PERCENTILE = 0.02; // top 2% of accumulation values

// Minimum flow accumulation fraction required for a candidate.
// Cells below this fraction of the max accumulation are skipped.
const MIN_ACCUMULATION_FRACTION = 0.005; // 0.5% of max

// Maximum relative elevation for candidates (0 = lowest, 1 = highest).
const MAX_RELATIVE_ELEVATION = 0.65;

// Neighborhood radius for depression detection (in grid cells).
// A 5×5 window uses radius=2, 7×7 uses radius=3, etc.
const DEPRESSION_RADIUS = 3;

// Minimum channel offset distance in grid cells for ideal score.
// Cells this far or farther from the drainage channel get full offset score.
const IDEAL_CHANNEL_OFFSET = 5;

// Maximum number of candidates to return (including selected).
const MAX_CANDIDATES = 5;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select candidate pond locations from terrain model.
 * @param {Object} terrainModel - Output from buildTerrainModel
 * @param {Object} metadata - Contour metadata
 * @returns {Object} Selected pond site and candidates with score breakdowns
 */
function selectPondSite(terrainModel, metadata) {
  const {
    elevationGrid, flowAccumulation, flowDirection,
    nRows, nCols, bounds, cellSizeLng, cellSizeLat, cellSizeMeters
  } = terrainModel;

  const elevMin = metadata.minElevation;
  const elevMax = metadata.maxElevation;
  const elevRange = elevMax - elevMin || 1;

  // ── Step 1: Compute global flow accumulation statistics ──────────────
  const accumValues = [];
  let maxAccum = 0;
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      const a = flowAccumulation[row][col];
      accumValues.push(a);
      if (a > maxAccum) maxAccum = a;
    }
  }

  // Sort to find the channel threshold at the given percentile
  accumValues.sort((a, b) => a - b);
  const channelThresholdIndex = Math.floor(accumValues.length * (1 - CHANNEL_PERCENTILE));
  const channelThreshold = accumValues[Math.min(channelThresholdIndex, accumValues.length - 1)];

  console.log(`  Flow accumulation: max=${maxAccum.toFixed(0)}, channel threshold (top ${CHANNEL_PERCENTILE * 100}%)=${channelThreshold.toFixed(0)}`);

  // ── Step 2: Build drainage channel mask ──────────────────────────────
  // A cell is classified as "channel" if its accumulation >= channelThreshold
  const isChannel = Array.from({ length: nRows }, () => new Uint8Array(nCols));
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      if (flowAccumulation[row][col] >= channelThreshold) {
        isChannel[row][col] = 1;
      }
    }
  }

  // ── Step 3: Compute distance-to-nearest-channel for every cell ──────
  // BFS from all channel cells simultaneously
  const channelDist = Array.from({ length: nRows }, () =>
    new Float32Array(nCols).fill(Infinity)
  );
  const bfsQueue = [];
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      if (isChannel[row][col]) {
        channelDist[row][col] = 0;
        bfsQueue.push(row * nCols + col);
      }
    }
  }
  let head = 0;
  while (head < bfsQueue.length) {
    const idx = bfsQueue[head++];
    const r = Math.floor(idx / nCols);
    const c = idx % nCols;
    const currentDist = channelDist[r][c];
    for (let d = 0; d < 8; d++) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= nRows || nc < 0 || nc >= nCols) continue;
      const stepDist = (d % 2 === 0) ? 1.0 : 1.414; // diagonal is √2
      const newDist = currentDist + stepDist;
      if (newDist < channelDist[nr][nc]) {
        channelDist[nr][nc] = newDist;
        bfsQueue.push(nr * nCols + nc);
      }
    }
  }

  // ── Step 4: Compute slope grid ──────────────────────────────────────
  // Slope = max elevation drop per unit distance across 8-neighbors
  const slopeGrid = Array.from({ length: nRows }, () => new Float64Array(nCols));
  let maxSlope = 0;
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      const elev = elevationGrid[row][col];
      let maxGradient = 0;
      for (let d = 0; d < 8; d++) {
        const nr = row + DR[d];
        const nc = col + DC[d];
        if (nr < 0 || nr >= nRows || nc < 0 || nc >= nCols) continue;
        const dist = (d % 2 === 0) ? 1.0 : 1.414;
        const gradient = Math.abs(elev - elevationGrid[nr][nc]) / dist;
        if (gradient > maxGradient) maxGradient = gradient;
      }
      slopeGrid[row][col] = maxGradient;
      if (maxGradient > maxSlope) maxSlope = maxGradient;
    }
  }

  // ── Step 5: Score every candidate cell ──────────────────────────────
  const margin = Math.max(DEPRESSION_RADIUS + 1, Math.floor(Math.min(nRows, nCols) * 0.05));
  const minAccum = maxAccum * MIN_ACCUMULATION_FRACTION;
  const logMaxAccum = Math.log(maxAccum + 1);
  const cellScores = [];

  for (let row = margin; row < nRows - margin; row++) {
    for (let col = margin; col < nCols - margin; col++) {
      const elev = elevationGrid[row][col];
      const accum = flowAccumulation[row][col];
      const slope = slopeGrid[row][col];
      const distToChannel = channelDist[row][col];

      // ─ Filter: skip cells at high elevations
      const relativeElev = (elev - elevMin) / elevRange;
      if (relativeElev > MAX_RELATIVE_ELEVATION) continue;

      // ─ Filter: skip cells with negligible flow (dry ridges)
      if (accum < minAccum) continue;

      // ─ Filter: skip cells that ARE on the drainage channel
      if (isChannel[row][col]) continue;

      // ─ Depression detection: wider neighborhood ─
      let surroundingSum = 0;
      let surroundingCount = 0;
      let surroundingMin = Infinity;
      for (let dr = -DEPRESSION_RADIUS; dr <= DEPRESSION_RADIUS; dr++) {
        for (let dc = -DEPRESSION_RADIUS; dc <= DEPRESSION_RADIUS; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= nRows || nc < 0 || nc >= nCols) continue;
          const nElev = elevationGrid[nr][nc];
          surroundingSum += nElev;
          surroundingCount++;
          if (nElev < surroundingMin) surroundingMin = nElev;
        }
      }
      const avgSurrounding = surroundingSum / Math.max(1, surroundingCount);
      const depressionDepth = avgSurrounding - elev; // positive = cell is lower than surroundings

      // ─ Convergence: fraction of immediate 8-neighbors that are higher ─
      let higherNeighbors = 0;
      let neighborCount = 0;
      for (let d = 0; d < 8; d++) {
        const nr = row + DR[d];
        const nc = col + DC[d];
        if (nr < 0 || nr >= nRows || nc < 0 || nc >= nCols) continue;
        neighborCount++;
        if (elevationGrid[nr][nc] > elev) higherNeighbors++;
      }
      const convergence = higherNeighbors / Math.max(1, neighborCount);

      // ─ Compute individual factor scores (all normalized 0–1, higher is better) ─

      // 1. Elevation score: lower is better
      const elevationScore = 1 - relativeElev;

      // 2. Slope score: flatter is better
      const slopeScore = maxSlope > 0 ? 1 - Math.min(1, slope / maxSlope) : 1;

      // 3. Depression score: deeper depression is better
      //    Normalize by elevation range; clamp to [0, 1]
      const rawDepressionScore = depressionDepth / elevRange;
      const depressionScore = Math.max(0, Math.min(1, rawDepressionScore * 10));

      // 4. Convergence score: more neighbors higher = better (already 0–1)
      const convergenceScore = convergence;

      // 5. Catchment score: moderate-to-high accumulation (log-scaled)
      //    We want meaningful catchment but NOT the absolute maximum
      const catchmentScore = Math.log(accum + 1) / logMaxAccum;

      // 6. Channel offset score: farther from drainage channel = better
      //    Ramps linearly from 0 (on channel) to 1 (at IDEAL_CHANNEL_OFFSET)
      const channelOffsetScore = Math.min(1, distToChannel / IDEAL_CHANNEL_OFFSET);

      // ─ Composite score ─
      const score = (elevationScore     * WEIGHTS.elevation) +
                    (slopeScore          * WEIGHTS.slope) +
                    (depressionScore     * WEIGHTS.depression) +
                    (convergenceScore    * WEIGHTS.convergence) +
                    (catchmentScore      * WEIGHTS.catchment) +
                    (channelOffsetScore  * WEIGHTS.channelOffset);

      cellScores.push({
        row, col, elev, accum, slope, distToChannel,
        convergence, depressionDepth, relativeElev,
        scores: {
          elevation: round4(elevationScore),
          slope: round4(slopeScore),
          depression: round4(depressionScore),
          convergence: round4(convergenceScore),
          catchment: round4(catchmentScore),
          channelOffset: round4(channelOffsetScore),
        },
        score
      });
    }
  }

  // ── Fallback if no candidates survived the filters ──────────────────
  if (cellScores.length === 0) {
    return buildFallback(terrainModel, elevationGrid, flowAccumulation, channelDist,
                          isChannel, nRows, nCols, bounds, cellSizeLng, cellSizeLat);
  }

  // ── Step 6: Rank and select spatially-separated candidates ──────────
  cellScores.sort((a, b) => b.score - a.score);

  const minSeparation = Math.max(3, Math.floor(Math.min(nRows, nCols) * 0.08));
  const candidates = [];

  for (const cell of cellScores) {
    const tooClose = candidates.some(c => {
      const dr = Math.abs(cell.row - c.row);
      const dc = Math.abs(cell.col - c.col);
      return Math.max(dr, dc) < minSeparation;
    });

    if (!tooClose) {
      const [lng, lat] = gridToCoords(cell.row, cell.col, bounds, cellSizeLng, cellSizeLat);
      candidates.push({
        latitude: lat,
        longitude: lng,
        elevation: round2(cell.elev),
        row: cell.row,
        col: cell.col,
        suitabilityScore: round4(cell.score),
        score: round4(cell.score), // keep backward-compatible field
        flowAccumulation: Math.round(cell.accum),
        convergence: round2(cell.convergence),
        localRelief: round2(cell.depressionDepth),
        relativeElevation: round2(cell.relativeElev),
        slopeValue: round4(cell.slope),
        distanceToChannel: round2(cell.distToChannel),
        distanceToChannelMeters: round2(cell.distToChannel * cellSizeMeters),
        scoreBreakdown: cell.scores,
        reason: buildReason(cell, cellSizeMeters)
      });

      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }

  // Ensure at least one candidate
  if (candidates.length === 0 && cellScores.length > 0) {
    const cell = cellScores[0];
    const [lng, lat] = gridToCoords(cell.row, cell.col, bounds, cellSizeLng, cellSizeLat);
    candidates.push({
      latitude: lat,
      longitude: lng,
      elevation: round2(cell.elev),
      row: cell.row,
      col: cell.col,
      suitabilityScore: round4(cell.score),
      score: round4(cell.score),
      flowAccumulation: Math.round(cell.accum),
      convergence: round2(cell.convergence),
      localRelief: round2(cell.depressionDepth),
      relativeElevation: round2(cell.relativeElev),
      slopeValue: round4(cell.slope),
      distanceToChannel: round2(cell.distToChannel),
      distanceToChannelMeters: round2(cell.distToChannel * cellSizeMeters),
      scoreBreakdown: cell.scores,
      reason: buildReason(cell, cellSizeMeters)
    });
  }

  return {
    selected: candidates[0],
    candidates: candidates.slice(1)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a fallback selection when no candidates pass the filters.
 * Finds the best non-channel cell with highest accumulation.
 */
function buildFallback(terrainModel, elevationGrid, flowAccumulation, channelDist,
                        isChannel, nRows, nCols, bounds, cellSizeLng, cellSizeLat) {
  let bestRow = Math.floor(nRows / 2);
  let bestCol = Math.floor(nCols / 2);
  let bestScore = -Infinity;

  for (let row = 1; row < nRows - 1; row++) {
    for (let col = 1; col < nCols - 1; col++) {
      // Prefer non-channel cells with decent accumulation
      const accum = flowAccumulation[row][col];
      const onChannel = isChannel[row][col];
      const dist = channelDist[row][col];
      // Score: accumulation benefit minus channel penalty
      const s = Math.log(accum + 1) + (onChannel ? -100 : dist * 0.5);
      if (s > bestScore) {
        bestScore = s;
        bestRow = row;
        bestCol = col;
      }
    }
  }

  const [lng, lat] = gridToCoords(bestRow, bestCol, bounds, cellSizeLng, cellSizeLat);
  return {
    selected: {
      latitude: lat,
      longitude: lng,
      elevation: round2(elevationGrid[bestRow][bestCol]),
      row: bestRow,
      col: bestCol,
      suitabilityScore: 0,
      score: 0,
      flowAccumulation: Math.round(flowAccumulation[bestRow][bestCol]),
      distanceToChannel: round2(channelDist[bestRow][bestCol]),
      distanceToChannelMeters: round2(channelDist[bestRow][bestCol] * terrainModel.cellSizeMeters),
      scoreBreakdown: {},
      reason: 'Selected as best available land cell near drainage (fallback — terrain had limited valid candidates)'
    },
    candidates: []
  };
}

/**
 * Build a human-readable reason string explaining why this site was selected.
 */
function buildReason(cell, cellSizeMeters) {
  const parts = [];

  // Channel offset — the most important differentiator
  const offsetMeters = cell.distToChannel * cellSizeMeters;
  if (offsetMeters > 0) {
    parts.push(`~${Math.round(offsetMeters)}m offset from the main drainage channel (avoids stream/river)`);
  }

  // Depression
  if (cell.depressionDepth > 0) {
    parts.push(`natural depression (${cell.depressionDepth.toFixed(2)}m below surrounding terrain)`);
  }

  // Slope
  if (cell.scores.slope > 0.7) {
    parts.push('low slope (suitable for pond construction)');
  } else if (cell.scores.slope > 0.4) {
    parts.push('moderate slope');
  }

  // Convergence
  if (cell.convergence > 0.6) {
    parts.push(`terrain convergence (${Math.round(cell.convergence * 100)}% of neighbors higher)`);
  }

  // Catchment
  if (cell.accum > 10) {
    parts.push(`upstream catchment contributing area (flow accumulation: ${Math.round(cell.accum)})`);
  }

  // Elevation
  if (cell.relativeElev < 0.3) {
    parts.push('located in lower portion of terrain');
  } else if (cell.relativeElev < 0.5) {
    parts.push('moderate relative elevation');
  }

  if (parts.length === 0) {
    parts.push('best composite terrain suitability score for land-based pond construction');
  }

  return 'Land site selected: ' + parts.join('; ') + `.`;
}

function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

module.exports = { selectPondSite, WEIGHTS };
