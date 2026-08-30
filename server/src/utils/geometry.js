/**
 * Geometry utility functions for geospatial calculations.
 * Used across terrain analysis, pond selection, and catchment delineation.
 */

/**
 * Calculate the bounding box of a set of GeoJSON features.
 * @param {Array} features - Array of GeoJSON features with LineString/Point geometry
 * @returns {{ minLng, maxLng, minLat, maxLat }}
 */
function calculateBounds(features) {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const feature of features) {
    const coords = feature.geometry.type === 'Point'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

    for (const coord of coords) {
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Convert grid indices (row, col) to geographic coordinates.
 * @param {number} row - Row index
 * @param {number} col - Column index
 * @param {{ minLng, minLat }} origin - Grid origin
 * @param {number} cellSizeLng - Cell size in longitude degrees
 * @param {number} cellSizeLat - Cell size in latitude degrees
 * @returns {[number, number]} [longitude, latitude]
 */
function gridToCoords(row, col, origin, cellSizeLng, cellSizeLat) {
  const lng = origin.minLng + (col + 0.5) * cellSizeLng;
  const lat = origin.minLat + (row + 0.5) * cellSizeLat;
  return [lng, lat];
}

/**
 * Convert geographic coordinates to grid indices.
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {{ minLng, minLat }} origin - Grid origin
 * @param {number} cellSizeLng - Cell size in longitude degrees
 * @param {number} cellSizeLat - Cell size in latitude degrees
 * @returns {[number, number]} [row, col]
 */
function coordsToGrid(lng, lat, origin, cellSizeLng, cellSizeLat) {
  const col = Math.floor((lng - origin.minLng) / cellSizeLng);
  const row = Math.floor((lat - origin.minLat) / cellSizeLat);
  return [row, col];
}

/**
 * Calculate approximate distance between two lat/lng points in meters.
 * Uses Haversine formula.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

/**
 * Sample points along a LineString at regular intervals.
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @param {number} elevation - Elevation value for this contour
 * @param {number} maxPoints - Maximum points to sample from this line
 * @returns {Array} Array of { lng, lat, elevation }
 */
function sampleLinePoints(coordinates, elevation, maxPoints = 20) {
  if (coordinates.length <= maxPoints) {
    return coordinates.map(([lng, lat]) => ({ lng, lat, elevation }));
  }

  const step = Math.max(1, Math.floor(coordinates.length / maxPoints));
  const points = [];
  for (let i = 0; i < coordinates.length; i += step) {
    const [lng, lat] = coordinates[i];
    points.push({ lng, lat, elevation });
  }

  // Always include the last point
  const last = coordinates[coordinates.length - 1];
  if (points.length === 0 || points[points.length - 1].lng !== last[0] || points[points.length - 1].lat !== last[1]) {
    points.push({ lng: last[0], lat: last[1], elevation });
  }

  return points;
}

/**
 * Compute barycentric interpolation within a triangle.
 * @param {number} px - Query point x
 * @param {number} py - Query point y
 * @param {Object} v0 - Triangle vertex 0 { x, y, z }
 * @param {Object} v1 - Triangle vertex 1 { x, y, z }
 * @param {Object} v2 - Triangle vertex 2 { x, y, z }
 * @returns {number|null} Interpolated z value, or null if outside triangle
 */
function barycentricInterpolation(px, py, v0, v1, v2) {
  const denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
  if (Math.abs(denom) < 1e-15) return null;

  const lambda0 = ((v1.y - v2.y) * (px - v2.x) + (v2.x - v1.x) * (py - v2.y)) / denom;
  const lambda1 = ((v2.y - v0.y) * (px - v2.x) + (v0.x - v2.x) * (py - v2.y)) / denom;
  const lambda2 = 1 - lambda0 - lambda1;

  // Check if point is inside triangle (with small tolerance)
  const tol = -0.001;
  if (lambda0 < tol || lambda1 < tol || lambda2 < tol) return null;

  return lambda0 * v0.z + lambda1 * v1.z + lambda2 * v2.z;
}

module.exports = {
  calculateBounds,
  gridToCoords,
  coordsToGrid,
  haversineDistance,
  sampleLinePoints,
  barycentricInterpolation
};
