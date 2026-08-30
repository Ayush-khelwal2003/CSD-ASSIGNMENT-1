/**
 * Analysis Orchestration Service
 * 
 * Coordinates the full analysis pipeline:
 * 1. Parse KML/KMZ → contour features
 * 2. Build terrain model (DEM, flow direction, flow accumulation)
 * 3. Select pond site
 * 4. Delineate catchment area
 * 5. Return structured results
 */

const { parseContourFile } = require('./contourParser');
const { buildTerrainModel } = require('./terrainAnalysis');
const { selectPondSite } = require('./pondSiteSelection');
const { delineateCatchment } = require('./catchmentAnalysis');

/**
 * Run the complete contour analysis pipeline.
 * @param {Buffer} fileBuffer - Uploaded file buffer
 * @param {string} filename - Original filename
 * @returns {Object} Complete analysis result
 */
async function runAnalysis(fileBuffer, filename) {
  const startTime = Date.now();

  console.log(`\n=== Starting Contour Analysis ===`);
  console.log(`File: ${filename} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // Step 1: Parse KML/KMZ
  console.log('\n[1/4] Parsing contour file...');
  const { features, labels, metadata } = parseContourFile(fileBuffer, filename);
  console.log(`  Found ${metadata.contourCount} contour lines`);
  console.log(`  Elevation range: ${metadata.minElevation}m – ${metadata.maxElevation}m`);
  console.log(`  Contour interval: ${metadata.contourInterval}m`);
  console.log(`  Bounds: ${metadata.bounds.minLng.toFixed(4)},${metadata.bounds.minLat.toFixed(4)} → ${metadata.bounds.maxLng.toFixed(4)},${metadata.bounds.maxLat.toFixed(4)}`);

  // Step 2: Build terrain model
  console.log('\n[2/4] Building terrain model...');
  const terrainModel = buildTerrainModel(features, metadata);
  console.log(`  Grid: ${terrainModel.nRows}×${terrainModel.nCols}`);

  // Step 3: Select pond site
  console.log('\n[3/4] Selecting pond site...');
  const { selected: pondSite, candidates } = selectPondSite(terrainModel, metadata);
  console.log(`  Selected: (${pondSite.latitude.toFixed(6)}, ${pondSite.longitude.toFixed(6)}) at ${pondSite.elevation}m`);
  console.log(`  Reason: ${pondSite.reason}`);

  // Step 4: Delineate catchment
  console.log('\n[4/4] Delineating catchment...');
  const catchmentResult = delineateCatchment(terrainModel, pondSite);
  console.log(`  Area: ${catchmentResult.areaSquareMeters.toFixed(0)} m² (${catchmentResult.areaHectares.toFixed(4)} ha, ${catchmentResult.areaSquareKilometers.toFixed(4)} km²)`);

  const elapsed = Date.now() - startTime;
  console.log(`\n=== Analysis complete in ${elapsed}ms ===\n`);

  // Determine format
  const format = filename.toLowerCase().endsWith('.kmz') ? 'KMZ' : 'KML';

  // Build contour GeoJSON for frontend visualization
  const contourGeoJSON = {
    type: 'FeatureCollection',
    features: features.map(f => ({
      type: 'Feature',
      properties: { elevation: f.properties.elevation },
      geometry: f.geometry
    }))
  };

  return {
    success: true,
    input: {
      filename,
      format
    },
    terrain: {
      minElevation: metadata.minElevation,
      maxElevation: metadata.maxElevation,
      contourCount: metadata.contourCount,
      contourInterval: metadata.contourInterval,
      uniqueElevations: metadata.uniqueElevations,
      bounds: metadata.bounds
    },
    pondSite: {
      latitude: pondSite.latitude,
      longitude: pondSite.longitude,
      elevation: pondSite.elevation,
      reason: pondSite.reason
    },
    candidates: candidates.map(c => ({
      latitude: c.latitude,
      longitude: c.longitude,
      elevation: c.elevation,
      reason: c.reason,
      score: c.score
    })),
    catchment: {
      areaSquareMeters: catchmentResult.areaSquareMeters,
      areaHectares: catchmentResult.areaHectares,
      areaSquareKilometers: catchmentResult.areaSquareKilometers,
      polygon: catchmentResult.polygon
    },
    contours: contourGeoJSON,
    analysis: {
      method: 'TIN interpolation → D8 flow direction → upstream catchment trace',
      confidence: determineConfidence(metadata, terrainModel, catchmentResult),
      gridResolution: Math.round(terrainModel.cellSizeMeters),
      processingTimeMs: elapsed,
      candidateCount: candidates.length + 1
    }
  };
}

/**
 * Determine confidence level based on data quality indicators.
 */
function determineConfidence(metadata, terrainModel, catchmentResult) {
  const factors = [];

  // Contour count
  if (metadata.contourCount > 500) {
    factors.push('high');
  } else if (metadata.contourCount > 100) {
    factors.push('medium');
  } else {
    factors.push('low');
  }

  // Elevation range
  const elevRange = metadata.maxElevation - metadata.minElevation;
  if (elevRange > 20) {
    factors.push('high');
  } else if (elevRange > 5) {
    factors.push('medium');
  } else {
    factors.push('low');
  }

  // Catchment area
  if (catchmentResult.areaSquareMeters > 1000) {
    factors.push('high');
  } else if (catchmentResult.areaSquareMeters > 100) {
    factors.push('medium');
  } else {
    factors.push('low');
  }

  // Overall confidence
  const highCount = factors.filter(f => f === 'high').length;
  const lowCount = factors.filter(f => f === 'low').length;

  if (highCount >= 2) return 'high';
  if (lowCount >= 2) return 'low';
  return 'medium';
}

module.exports = { runAnalysis };
