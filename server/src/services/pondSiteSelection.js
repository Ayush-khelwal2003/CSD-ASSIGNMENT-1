/**
 * Pond Site Selection Service
 * 
 * Identifies suitable pond locations based on terrain characteristics.
 * 
 * Selection criteria (NOT simply lowest point):
 * - High flow accumulation (drainage convergence)
 * - Low relative elevation
 * - Surrounded by higher terrain
 * - Sufficient contributing area
 * - Not on data boundary
 * - Terrain convergence (concave area)
 * 
 * Returns ranked candidates with reasoning.
 */

const { gridToCoords, haversineDistance } = require('../utils/geometry');
const { DR, DC } = require('./terrainAnalysis');

/**
 * Select candidate pond locations from terrain model.
 * @param {Object} terrainModel - Output from buildTerrainModel
 * @param {Object} metadata - Contour metadata
 * @returns {Object} Selected pond site and candidates
 */
function selectPondSite(terrainModel, metadata) {
  const {
    elevationGrid, flowAccumulation, flowDirection,
    nRows, nCols, bounds, cellSizeLng, cellSizeLat, cellSizeMeters
  } = terrainModel;

  // Step 1: Calculate terrain statistics for each cell
  const cellScores = [];
  const elevMin = metadata.minElevation;
  const elevMax = metadata.maxElevation;
  const elevRange = elevMax - elevMin || 1;

  // Calculate overall accumulation statistics
  let maxAccum = 0;
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      if (flowAccumulation[row][col] > maxAccum) {
        maxAccum = flowAccumulation[row][col];
      }
    }
  }

  // Margin: avoid cells too close to the boundary
  const margin = Math.max(2, Math.floor(Math.min(nRows, nCols) * 0.05));

  for (let row = margin; row < nRows - margin; row++) {
    for (let col = margin; col < nCols - margin; col++) {
      const elev = elevationGrid[row][col];
      const accum = flowAccumulation[row][col];

      // Terrain convergence: how many neighbors are higher
      let higherNeighbors = 0;
      let neighborElevSum = 0;
      let neighborCount = 0;
      for (let d = 0; d < 8; d++) {
        const nr = row + DR[d];
        const nc = col + DC[d];
        if (nr >= 0 && nr < nRows && nc >= 0 && nc < nCols) {
          if (elevationGrid[nr][nc] > elev) higherNeighbors++;
          neighborElevSum += elevationGrid[nr][nc];
          neighborCount++;
        }
      }

      // Convergence factor: fraction of neighbors that are higher
      const convergence = higherNeighbors / Math.max(1, neighborCount);

      // Relief: average neighbor elevation minus cell elevation
      const avgNeighborElev = neighborElevSum / Math.max(1, neighborCount);
      const localRelief = avgNeighborElev - elev;

      // Relative elevation (0 = lowest, 1 = highest)
      const relativeElev = (elev - elevMin) / elevRange;

      // Skip cells that are at the highest elevations
      if (relativeElev > 0.7) continue;

      // Skip cells with very low accumulation
      if (accum < maxAccum * 0.05) continue;

      // Composite score:
      // Higher accumulation = better (drainage convergence)
      // Higher convergence = better (surrounded by higher ground)
      // Higher local relief = better (depression)
      // Lower relative elevation = better
      const accumScore = Math.log(accum + 1) / Math.log(maxAccum + 1);
      const elevScore = 1 - relativeElev;
      const reliefScore = Math.max(0, localRelief) / elevRange;

      const score = (accumScore * 0.5) +
                    (convergence * 0.2) +
                    (elevScore * 0.15) +
                    (reliefScore * 0.15);

      cellScores.push({
        row, col, elev, accum,
        convergence, localRelief, relativeElev,
        score
      });
    }
  }

  if (cellScores.length === 0) {
    // Fallback: find the cell with highest flow accumulation
    let bestRow = Math.floor(nRows / 2);
    let bestCol = Math.floor(nCols / 2);
    let bestAccum = 0;

    for (let row = 1; row < nRows - 1; row++) {
      for (let col = 1; col < nCols - 1; col++) {
        if (flowAccumulation[row][col] > bestAccum) {
          bestAccum = flowAccumulation[row][col];
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
        elevation: elevationGrid[bestRow][bestCol],
        row: bestRow,
        col: bestCol,
        reason: 'Selected as highest flow accumulation cell (fallback method)'
      },
      candidates: []
    };
  }

  // Sort by score descending
  cellScores.sort((a, b) => b.score - a.score);

  // Select top candidates, ensuring minimum spatial separation
  const minSeparation = Math.max(3, Math.floor(Math.min(nRows, nCols) * 0.1));
  const candidates = [];

  for (const cell of cellScores) {
    // Check distance from existing candidates
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
        elevation: Math.round(cell.elev * 100) / 100,
        row: cell.row,
        col: cell.col,
        score: Math.round(cell.score * 1000) / 1000,
        flowAccumulation: cell.accum,
        convergence: Math.round(cell.convergence * 100) / 100,
        localRelief: Math.round(cell.localRelief * 100) / 100,
        relativeElevation: Math.round(cell.relativeElev * 100) / 100,
        reason: buildReason(cell)
      });

      if (candidates.length >= 3) break;
    }
  }

  return {
    selected: candidates[0],
    candidates: candidates.slice(1)
  };
}

/**
 * Build a human-readable reason string for pond selection.
 */
function buildReason(cell) {
  const parts = [];

  if (cell.accum > 10) {
    parts.push(`high drainage convergence (flow accumulation: ${Math.round(cell.accum)})`);
  }

  if (cell.convergence > 0.5) {
    parts.push(`surrounded by higher terrain (${Math.round(cell.convergence * 100)}% of neighbors higher)`);
  }

  if (cell.localRelief > 0) {
    parts.push(`local depression (${cell.localRelief.toFixed(2)}m below average neighbor elevation)`);
  }

  if (cell.relativeElev < 0.3) {
    parts.push('located in lower portion of terrain');
  } else if (cell.relativeElev < 0.5) {
    parts.push('moderate relative elevation');
  }

  if (parts.length === 0) {
    parts.push('best composite terrain suitability score');
  }

  return 'Selected based on: ' + parts.join('; ');
}

module.exports = { selectPondSite };
