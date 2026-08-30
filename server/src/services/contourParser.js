/**
 * KML/KMZ Contour Parser
 * 
 * Parses contour map files in KML or KMZ format.
 * Extracts contour lines with elevation values.
 * 
 * Supports elevation detection from:
 * - <name> tag (numeric values)
 * - <description> tag (elevation patterns)
 * - <ExtendedData> / <SimpleData>
 * - Coordinate altitude (3rd component)
 * 
 * Flexible enough to handle various KML generators.
 */

const { DOMParser } = require('@xmldom/xmldom');
const AdmZip = require('adm-zip');
const { calculateBounds } = require('../utils/geometry');

/**
 * Parse a KML or KMZ buffer and extract contour features.
 * @param {Buffer} fileBuffer - The uploaded file buffer
 * @param {string} filename - Original filename
 * @returns {Object} Parsed contour data
 */
function parseContourFile(fileBuffer, filename) {
  const ext = filename.toLowerCase().split('.').pop();

  let kmlContent;
  if (ext === 'kmz') {
    kmlContent = extractKmlFromKmz(fileBuffer);
  } else {
    kmlContent = fileBuffer.toString('utf-8');
  }

  return parseKmlContent(kmlContent);
}

/**
 * Extract KML content from a KMZ (ZIP) file.
 * @param {Buffer} kmzBuffer - The KMZ file buffer
 * @returns {string} KML content string
 */
function extractKmlFromKmz(kmzBuffer) {
  try {
    const zip = new AdmZip(kmzBuffer);
    const entries = zip.getEntries();

    // Look for .kml file inside the KMZ
    const kmlEntry = entries.find(entry =>
      entry.entryName.toLowerCase().endsWith('.kml')
    );

    if (!kmlEntry) {
      const error = new Error('No KML file found inside the KMZ archive');
      error.statusCode = 422;
      error.code = 'INVALID_KMZ';
      throw error;
    }

    return kmlEntry.getData().toString('utf-8');
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error('Failed to extract KMZ archive: ' + err.message);
    error.statusCode = 422;
    error.code = 'KMZ_EXTRACTION_FAILED';
    throw error;
  }
}

/**
 * Parse KML XML content and extract contour features.
 * @param {string} kmlContent - KML XML string
 * @returns {Object} { features, metadata }
 */
function parseKmlContent(kmlContent) {
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === 'fatalError') {
        const error = new Error('Malformed KML file: ' + msg);
        error.statusCode = 422;
        error.code = 'MALFORMED_KML';
        throw error;
      }
      // Ignore warnings and non-fatal errors
    }
  });

  let doc;
  try {
    doc = parser.parseFromString(kmlContent, 'text/xml');
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error('Failed to parse KML XML: ' + err.message);
    error.statusCode = 422;
    error.code = 'MALFORMED_KML';
    throw error;
  }

  if (!doc || !doc.documentElement) {
    const error = new Error('Invalid or empty KML document');
    error.statusCode = 422;
    error.code = 'MALFORMED_KML';
    throw error;
  }

  const placemarks = doc.getElementsByTagName('Placemark');
  const contourFeatures = [];
  const labelFeatures = [];

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const feature = extractFeature(placemark);
    if (feature) {
      if (feature.geometry.type === 'LineString') {
        contourFeatures.push(feature);
      } else if (feature.geometry.type === 'Point') {
        labelFeatures.push(feature);
      }
    }
  }

  if (contourFeatures.length === 0) {
    const error = new Error('No contour lines found in the KML file. Ensure the file contains LineString geometries with elevation information.');
    error.statusCode = 422;
    error.code = 'NO_CONTOURS_FOUND';
    throw error;
  }

  // Check if we have elevation data
  const withElevation = contourFeatures.filter(f => f.properties.elevation !== null);
  if (withElevation.length === 0) {
    const error = new Error('No elevation information found in contour features. Elevation should be in <name>, <description>, or coordinate altitude.');
    error.statusCode = 422;
    error.code = 'NO_ELEVATION_DATA';
    throw error;
  }

  // Calculate metadata
  const elevations = withElevation.map(f => f.properties.elevation).sort((a, b) => a - b);
  const uniqueElevations = [...new Set(elevations)].sort((a, b) => a - b);
  const bounds = calculateBounds(contourFeatures);

  // Infer contour interval
  let contourInterval = null;
  if (uniqueElevations.length >= 2) {
    const diffs = [];
    for (let i = 1; i < uniqueElevations.length; i++) {
      const diff = Math.round((uniqueElevations[i] - uniqueElevations[i - 1]) * 100) / 100;
      if (diff > 0) diffs.push(diff);
    }
    if (diffs.length > 0) {
      // Most common difference
      const diffCounts = {};
      diffs.forEach(d => { diffCounts[d] = (diffCounts[d] || 0) + 1; });
      contourInterval = parseFloat(Object.entries(diffCounts).sort((a, b) => b[1] - a[1])[0][0]);
    }
  }

  return {
    features: contourFeatures,
    labels: labelFeatures,
    metadata: {
      contourCount: contourFeatures.length,
      minElevation: elevations[0],
      maxElevation: elevations[elevations.length - 1],
      uniqueElevations: uniqueElevations.length,
      contourInterval,
      bounds,
      elevations: uniqueElevations
    }
  };
}

/**
 * Extract a GeoJSON feature from a KML Placemark element.
 * @param {Element} placemark - KML Placemark DOM element
 * @returns {Object|null} GeoJSON feature or null
 */
function extractFeature(placemark) {
  // Detect geometry type
  const lineString = placemark.getElementsByTagName('LineString')[0];
  const point = placemark.getElementsByTagName('Point')[0];

  const geometryElement = lineString || point;
  if (!geometryElement) return null;

  // Extract coordinates
  const coordsElement = geometryElement.getElementsByTagName('coordinates')[0];
  if (!coordsElement || !coordsElement.textContent) return null;

  const coordsText = coordsElement.textContent.trim();
  const coordinates = parseCoordinates(coordsText);
  if (coordinates.length === 0) return null;

  // Extract elevation
  const elevation = extractElevation(placemark, coordinates);

  // Build geometry
  const geometryType = lineString ? 'LineString' : 'Point';
  const geometry = geometryType === 'Point'
    ? { type: 'Point', coordinates: coordinates[0] }
    : { type: 'LineString', coordinates };

  return {
    type: 'Feature',
    properties: {
      elevation,
      name: getTextContent(placemark, 'name')
    },
    geometry
  };
}

/**
 * Parse KML coordinate string into array of [lng, lat] pairs.
 * KML coordinates format: "lng,lat[,alt] lng,lat[,alt] ..."
 */
function parseCoordinates(coordsText) {
  return coordsText
    .split(/\s+/)
    .filter(s => s.length > 0)
    .map(s => {
      const parts = s.split(',').map(Number);
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
      return [parts[0], parts[1]]; // [lng, lat]
    })
    .filter(c => c !== null);
}

/**
 * Extract elevation from various KML representations.
 * Priority: name tag > ExtendedData > description > coordinate altitude
 */
function extractElevation(placemark, coordinates) {
  // 1. Try <name> tag - most common for contour maps
  const name = getTextContent(placemark, 'name');
  if (name) {
    const num = parseFloat(name);
    if (!isNaN(num) && isFinite(num)) return num;
  }

  // 2. Try ExtendedData / SimpleData
  const simpleDataElements = placemark.getElementsByTagName('SimpleData');
  for (let i = 0; i < simpleDataElements.length; i++) {
    const el = simpleDataElements[i];
    const attrName = el.getAttribute('name');
    if (attrName && /elev|alt|height|contour|z/i.test(attrName)) {
      const val = parseFloat(el.textContent);
      if (!isNaN(val) && isFinite(val)) return val;
    }
  }

  // 3. Try <description> tag for elevation patterns
  const desc = getTextContent(placemark, 'description');
  if (desc) {
    const match = desc.match(/(?:elevation|elev|altitude|alt|height|contour)\s*[=:]\s*([-\d.]+)/i);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && isFinite(val)) return val;
    }
    // Also try bare number in description
    const numMatch = desc.match(/^([-\d.]+)\s*$/);
    if (numMatch) {
      const val = parseFloat(numMatch[1]);
      if (!isNaN(val) && isFinite(val)) return val;
    }
  }

  // 4. Try coordinate altitude (3rd component)
  // Not applicable since we only store [lng, lat], but check raw text
  return null;
}

/**
 * Get text content of a child element by tag name.
 */
function getTextContent(parent, tagName) {
  const elements = parent.getElementsByTagName(tagName);
  // Get the direct child, not nested
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].parentNode === parent) {
      const text = elements[i].textContent;
      return text ? text.trim() : null;
    }
  }
  return null;
}

module.exports = {
  parseContourFile,
  extractKmlFromKmz,
  parseKmlContent
};
