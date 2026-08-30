/**
 * Catchment Analysis Service
 * 
 * Delineates the catchment area (watershed) contributing to a selected pond site.
 * 
 * Method:
 * - Uses D8 flow direction grid
 * - BFS/flood-fill upstream from the pond (pour point)
 * - Collects all cells whose flow path leads to the pond
 * - Converts catchment cells to a polygon
 * - Calculates geodesic area using Turf.js
 * 
 * Limitations:
 * - Grid resolution limits polygon detail
 * - Interpolated DEM may create artifacts in flat areas
 * - D8 single-direction flow does not handle distributary flow
 */

const turf = require('@turf/turf');
const { gridToCoords, haversineDistance } = require('../utils/geometry');
const { DR, DC } = require('./terrainAnalysis');

/**
 * Delineate catchment area for a given pond location.
 * @param {Object} terrainModel - Output from buildTerrainModel
 * @param {Object} pondSite - Selected pond site with row, col
 * @returns {Object} Catchment polygon and area calculations
 */
function delineateCatchment(terrainModel, pondSite) {
  const {
    flowDirection, flowAccumulation, elevationGrid,
    nRows, nCols, bounds, cellSizeLng, cellSizeLat, cellSizeMeters
  } = terrainModel;

  const pourRow = pondSite.row;
  const pourCol = pondSite.col;

  // Step 1: Trace all upstream cells using BFS
  const catchmentCells = traceUpstream(
    flowDirection, nRows, nCols, pourRow, pourCol
  );

  console.log(`  Catchment cells: ${catchmentCells.size}`);

  if (catchmentCells.size === 0) {
    return {
      polygon: null,
      areaSquareMeters: 0,
      areaHectares: 0,
      areaSquareKilometers: 0
    };
  }

  // Step 2: Convert catchment cells to a polygon
  const polygon = catchmentCellsToPolygon(
    catchmentCells, nRows, nCols, bounds, cellSizeLng, cellSizeLat
  );

  // Step 3: Calculate area
  let areaSquareMeters = 0;
  if (polygon) {
    areaSquareMeters = turf.area(polygon);
  } else {
    // Fallback: estimate from cell count
    areaSquareMeters = catchmentCells.size * cellSizeMeters * cellSizeMeters;
  }

  const areaHectares = areaSquareMeters / 10000;
  const areaSquareKilometers = areaSquareMeters / 1000000;

  return {
    polygon: polygon ? polygon.geometry : null,
    areaSquareMeters: Math.round(areaSquareMeters * 100) / 100,
    areaHectares: Math.round(areaHectares * 10000) / 10000,
    areaSquareKilometers: Math.round(areaSquareKilometers * 10000) / 10000
  };
}

/**
 * Trace all cells upstream of a pour point using reverse flow direction.
 * @param {Array} flowDirection - 2D flow direction grid
 * @param {number} nRows
 * @param {number} nCols
 * @param {number} pourRow - Pour point row
 * @param {number} pourCol - Pour point column
 * @returns {Set} Set of "row,col" strings for catchment cells
 */
function traceUpstream(flowDirection, nRows, nCols, pourRow, pourCol) {
  const catchment = new Set();
  const queue = [`${pourRow},${pourCol}`];
  catchment.add(`${pourRow},${pourCol}`);

  while (queue.length > 0) {
    const current = queue.shift();
    const [row, col] = current.split(',').map(Number);

    // Check all 8 neighbors to see if they flow INTO this cell
    for (let d = 0; d < 8; d++) {
      const nr = row + DR[d];
      const nc = col + DC[d];

      if (nr < 0 || nr >= nRows || nc < 0 || nc >= nCols) continue;

      const key = `${nr},${nc}`;
      if (catchment.has(key)) continue;

      // The opposite direction: if neighbor flows in direction (d+4)%8, it flows to this cell
      const oppositeDir = (d + 4) % 8;
      if (flowDirection[nr][nc] === oppositeDir) {
        catchment.add(key);
        queue.push(key);
      }
    }
  }

  return catchment;
}

/**
 * Convert a set of catchment grid cells into a GeoJSON polygon.
 * Creates individual cell polygons and unions them.
 */
function catchmentCellsToPolygon(catchmentCells, nRows, nCols, bounds, cellSizeLng, cellSizeLat) {
  const cellPolygons = [];

  for (const key of catchmentCells) {
    const [row, col] = key.split(',').map(Number);

    // Cell corners
    const minLng = bounds.minLng + col * cellSizeLng;
    const maxLng = bounds.minLng + (col + 1) * cellSizeLng;
    const minLat = bounds.minLat + row * cellSizeLat;
    const maxLat = bounds.minLat + (row + 1) * cellSizeLat;

    cellPolygons.push(turf.bboxPolygon([minLng, minLat, maxLng, maxLat]));
  }

  if (cellPolygons.length === 0) return null;

  if (cellPolygons.length === 1) return cellPolygons[0];

  // Union all cell polygons
  try {
    // Use dissolve or iterative union
    let combined = cellPolygons[0];
    for (let i = 1; i < cellPolygons.length; i++) {
      try {
        const result = turf.union(
          turf.featureCollection([combined, cellPolygons[i]])
        );
        if (result) combined = result;
      } catch (e) {
        // Skip cells that fail to union (edge cases)
        continue;
      }
    }
    return combined;
  } catch (err) {
    // Fallback: use convex hull of all cell centers
    console.warn('  Union failed, using convex hull instead:', err.message);
    const centers = [];
    for (const key of catchmentCells) {
      const [row, col] = key.split(',').map(Number);
      const [lng, lat] = gridToCoords(row, col, bounds, cellSizeLng, cellSizeLat);
      centers.push(turf.point([lng, lat]));
    }
    return turf.convex(turf.featureCollection(centers));
  }
}

module.exports = { delineateCatchment };
