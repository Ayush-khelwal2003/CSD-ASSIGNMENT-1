/**
 * Terrain Analysis Service
 * 
 * Creates an interpolated DEM (Digital Elevation Model) from contour lines
 * using TIN (Triangulated Irregular Network) interpolation.
 * 
 * Computes:
 * - Elevation grid from contour data
 * - Slope and aspect at each cell
 * - D8 flow direction
 * - Flow accumulation
 * 
 * Limitations:
 * - Interpolated DEM is less accurate than surveyed DEM
 * - Flat areas between contour lines may have artifacts
 * - Grid resolution trades off between accuracy and performance
 */

const turf = require('@turf/turf');
const {
  calculateBounds,
  gridToCoords,
  coordsToGrid,
  sampleLinePoints,
  barycentricInterpolation,
  haversineDistance
} = require('../utils/geometry');

// D8 flow direction encoding: 8 neighbors
// Index: 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE
const DR = [0, 1, 1, 1, 0, -1, -1, -1]; // row offsets
const DC = [1, 1, 0, -1, -1, -1, 0, 1]; // col offsets

/**
 * Build a terrain model from contour features.
 * @param {Array} features - GeoJSON contour line features with elevation
 * @param {Object} metadata - Contour metadata (bounds, elevations)
 * @param {number} targetCellCount - Approximate number of grid cells per axis (default 80)
 * @returns {Object} Terrain model with elevation grid, flow direction, flow accumulation
 */
function buildTerrainModel(features, metadata, targetCellCount = 80) {
  const { bounds } = metadata;

  // Calculate grid dimensions
  const lngRange = bounds.maxLng - bounds.minLng;
  const latRange = bounds.maxLat - bounds.minLat;

  // Determine cell size (in degrees)
  const maxRange = Math.max(lngRange, latRange);
  const cellSize = maxRange / targetCellCount;
  const cellSizeLng = cellSize;
  const cellSizeLat = cellSize;

  const nCols = Math.max(5, Math.ceil(lngRange / cellSizeLng));
  const nRows = Math.max(5, Math.ceil(latRange / cellSizeLat));

  console.log(`  Grid dimensions: ${nRows} rows × ${nCols} cols (cell ~${cellSize.toFixed(6)}°)`);

  // Calculate approximate cell size in meters for reference
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const cellSizeMeters = haversineDistance(
    centerLat, bounds.minLng,
    centerLat, bounds.minLng + cellSizeLng
  );
  console.log(`  Approximate cell size: ${cellSizeMeters.toFixed(1)}m`);

  // Step 1: Sample points from contour lines
  const samplePoints = sampleContourPoints(features, nCols);

  console.log(`  Sampled ${samplePoints.length} points from ${features.length} contour lines`);

  // Step 2: Build TIN from sample points
  const tin = buildTIN(samplePoints);

  // Step 3: Interpolate elevation grid
  const elevationGrid = interpolateGrid(
    tin, samplePoints, nRows, nCols,
    bounds, cellSizeLng, cellSizeLat
  );

  // Step 4: Fill NoData cells using nearest-neighbor
  fillNoData(elevationGrid, nRows, nCols);

  // Step 5: Calculate flow direction (D8)
  const flowDirection = calculateFlowDirection(elevationGrid, nRows, nCols);

  // Step 6: Calculate flow accumulation
  const flowAccumulation = calculateFlowAccumulation(
    elevationGrid, flowDirection, nRows, nCols
  );

  return {
    elevationGrid,
    flowDirection,
    flowAccumulation,
    nRows,
    nCols,
    bounds,
    cellSizeLng,
    cellSizeLat,
    cellSizeMeters
  };
}

/**
 * Sample elevation points from contour lines.
 */
function sampleContourPoints(features, gridSize) {
  const points = [];
  // Limit points per line based on grid size
  const maxPointsPerLine = Math.max(5, Math.floor(gridSize * 0.5));

  for (const feature of features) {
    if (feature.properties.elevation === null) continue;
    const sampled = sampleLinePoints(
      feature.geometry.coordinates,
      feature.properties.elevation,
      maxPointsPerLine
    );
    points.push(...sampled);
  }

  return points;
}

/**
 * Build a TIN (Triangulated Irregular Network) from sample points.
 * Uses Turf.js tin function.
 */
function buildTIN(samplePoints) {
  // Create a Turf point collection
  const pointFeatures = samplePoints.map(p =>
    turf.point([p.lng, p.lat], { elevation: p.elevation })
  );
  const pointCollection = turf.featureCollection(pointFeatures);

  // Generate TIN
  const tin = turf.tin(pointCollection, 'elevation');
  return tin;
}

/**
 * Interpolate elevation at grid points using TIN.
 */
function interpolateGrid(tin, samplePoints, nRows, nCols, bounds, cellSizeLng, cellSizeLat) {
  const grid = Array.from({ length: nRows }, () =>
    new Float64Array(nCols).fill(NaN)
  );

  // Pre-process TIN triangles for faster lookup
  const triangles = tin.features.map(f => {
    const coords = f.geometry.coordinates[0]; // polygon ring
    return {
      v0: { x: coords[0][0], y: coords[0][1], z: f.properties.a },
      v1: { x: coords[1][0], y: coords[1][1], z: f.properties.b },
      v2: { x: coords[2][0], y: coords[2][1], z: f.properties.c },
      bbox: {
        minX: Math.min(coords[0][0], coords[1][0], coords[2][0]),
        maxX: Math.max(coords[0][0], coords[1][0], coords[2][0]),
        minY: Math.min(coords[0][1], coords[1][1], coords[2][1]),
        maxY: Math.max(coords[0][1], coords[1][1], coords[2][1])
      }
    };
  });

  // For each grid cell, find the containing triangle and interpolate
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      const [lng, lat] = gridToCoords(row, col, bounds, cellSizeLng, cellSizeLat);

      // Search through triangles
      for (const tri of triangles) {
        // Quick bbox check
        if (lng < tri.bbox.minX || lng > tri.bbox.maxX ||
            lat < tri.bbox.minY || lat > tri.bbox.maxY) continue;

        const z = barycentricInterpolation(lng, lat, tri.v0, tri.v1, tri.v2);
        if (z !== null) {
          grid[row][col] = z;
          break;
        }
      }
    }
  }

  return grid;
}

/**
 * Fill NoData (NaN) cells using nearest-neighbor interpolation.
 * Iteratively expands from known cells.
 */
function fillNoData(grid, nRows, nCols) {
  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(nRows, nCols);

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let row = 0; row < nRows; row++) {
      for (let col = 0; col < nCols; col++) {
        if (!isNaN(grid[row][col])) continue;

        // Check 8 neighbors
        let sum = 0, count = 0;
        for (let d = 0; d < 8; d++) {
          const nr = row + DR[d];
          const nc = col + DC[d];
          if (nr >= 0 && nr < nRows && nc >= 0 && nc < nCols && !isNaN(grid[nr][nc])) {
            sum += grid[nr][nc];
            count++;
          }
        }

        if (count > 0) {
          grid[row][col] = sum / count;
          changed = true;
        }
      }
    }
  }

  // Any remaining NaN cells, fill with global mean
  let globalSum = 0, globalCount = 0;
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      if (!isNaN(grid[r][c])) {
        globalSum += grid[r][c];
        globalCount++;
      }
    }
  }
  const globalMean = globalCount > 0 ? globalSum / globalCount : 0;
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      if (isNaN(grid[r][c])) grid[r][c] = globalMean;
    }
  }
}

/**
 * Calculate D8 flow direction for each cell.
 * Each cell flows to its steepest downhill neighbor.
 * Returns a 2D array of direction indices (0-7) or -1 for flat/pit cells.
 */
function calculateFlowDirection(elevationGrid, nRows, nCols) {
  const flowDir = Array.from({ length: nRows }, () =>
    new Int8Array(nCols).fill(-1)
  );

  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      const elev = elevationGrid[row][col];
      let maxDrop = 0;
      let bestDir = -1;

      for (let d = 0; d < 8; d++) {
        const nr = row + DR[d];
        const nc = col + DC[d];

        if (nr < 0 || nr >= nRows || nc < 0 || nc >= nCols) {
          // Boundary: allow flow out
          const drop = elev - elevationGrid[row][col]; // flat, but edge
          if (bestDir === -1 && (row === 0 || row === nRows - 1 || col === 0 || col === nCols - 1)) {
            bestDir = d; // Flow to boundary
          }
          continue;
        }

        const neighborElev = elevationGrid[nr][nc];
        // Diagonal distance factor
        const dist = (d % 2 === 0) ? 1.0 : 1.414;
        const drop = (elev - neighborElev) / dist;

        if (drop > maxDrop) {
          maxDrop = drop;
          bestDir = d;
        }
      }

      flowDir[row][col] = bestDir;
    }
  }

  return flowDir;
}

/**
 * Calculate flow accumulation using topological sort.
 * Sorts cells from highest to lowest elevation and accumulates flow downstream.
 */
function calculateFlowAccumulation(elevationGrid, flowDirection, nRows, nCols) {
  const accumulation = Array.from({ length: nRows }, () =>
    new Float64Array(nCols).fill(1) // Each cell starts with 1 (itself)
  );

  // Sort cells by elevation (highest first)
  const cells = [];
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      cells.push({ row, col, elev: elevationGrid[row][col] });
    }
  }
  cells.sort((a, b) => b.elev - a.elev);

  // Process from highest to lowest
  for (const { row, col } of cells) {
    const dir = flowDirection[row][col];
    if (dir < 0) continue;

    const nr = row + DR[dir];
    const nc = col + DC[dir];

    if (nr >= 0 && nr < nRows && nc >= 0 && nc < nCols) {
      accumulation[nr][nc] += accumulation[row][col];
    }
  }

  return accumulation;
}

module.exports = {
  buildTerrainModel,
  DR,
  DC
};
