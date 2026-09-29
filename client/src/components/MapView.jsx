import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents, Rectangle, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
  Map as MapIcon, 
  Layers, 
  Crop, 
  Trash2, 
  CheckCircle2, 
  Maximize2, 
  Droplet, 
  HelpCircle,
  Eye,
  EyeOff
} from 'lucide-react';

// Fix Leaflet marker icons in Vite/React bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom glowing pin for optimal pond site
const pondIcon = new L.DivIcon({
  className: 'custom-pond-marker-container',
  html: `
    <div class="pond-marker-pulse"></div>
    <div class="pond-marker-pin">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="#38bdf8"/>
      </svg>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -38]
});

// Alternate candidate pond sites icon
const candidateIcon = new L.DivIcon({
  className: 'custom-candidate-marker',
  html: `
    <div class="candidate-marker-pin">
      <div class="candidate-dot"></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -22]
});

// Bounds and zoom manager
const MapController = ({ bounds, selectedArea }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      const b = L.latLngBounds(
        L.latLng(bounds.minLat, bounds.minLng),
        L.latLng(bounds.maxLat, bounds.maxLng)
      );
      map.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
    } else if (selectedArea && selectedArea.minLat) {
      const b = L.latLngBounds(
        L.latLng(selectedArea.minLat, selectedArea.minLng),
        L.latLng(selectedArea.maxLat, selectedArea.maxLng)
      );
      map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
    }
  }, [bounds, selectedArea, map]);

  return null;
};

// Interactive Land Area Selection Handler
const AreaSelectionHandler = ({ isSelecting, onAreaSelected }) => {
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);

  useMapEvents({
    mousedown(e) {
      if (!isSelecting) return;
      setStartPoint(e.latlng);
      setCurrentPoint(e.latlng);
    },
    mousemove(e) {
      if (!isSelecting || !startPoint) return;
      setCurrentPoint(e.latlng);
    },
    mouseup(e) {
      if (!isSelecting || !startPoint) return;
      const endPoint = e.latlng;
      
      const minLat = Math.min(startPoint.lat, endPoint.lat);
      const maxLat = Math.max(startPoint.lat, endPoint.lat);
      const minLng = Math.min(startPoint.lng, endPoint.lng);
      const maxLng = Math.max(startPoint.lng, endPoint.lng);

      // Avoid zero-area clicks
      if (Math.abs(maxLat - minLat) > 0.0001 && Math.abs(maxLng - minLng) > 0.0001) {
        // Calculate rough geodesic area in m²
        const midLat = (minLat + maxLat) / 2;
        const latMeters = (maxLat - minLat) * 111320;
        const lngMeters = (maxLng - minLng) * (111320 * Math.cos((midLat * Math.PI) / 180));
        const areaM2 = Math.round(latMeters * lngMeters);
        const areaHa = Number((areaM2 / 10000).toFixed(2));

        onAreaSelected({
          minLat, maxLat, minLng, maxLng,
          areaSquareMeters: areaM2,
          areaHectares: areaHa,
          bounds: [[minLat, minLng], [maxLat, maxLng]]
        });
      }

      setStartPoint(null);
      setCurrentPoint(null);
    }
  });

  if (!isSelecting || !startPoint || !currentPoint) return null;

  const minLat = Math.min(startPoint.lat, currentPoint.lat);
  const maxLat = Math.max(startPoint.lat, currentPoint.lat);
  const minLng = Math.min(startPoint.lng, currentPoint.lng);
  const maxLng = Math.max(startPoint.lng, currentPoint.lng);

  return (
    <Rectangle
      bounds={[[minLat, minLng], [maxLat, maxLng]]}
      pathOptions={{
        color: '#f59e0b',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#fbbf24',
        fillOpacity: 0.25
      }}
    />
  );
};

const MapView = ({
  result,
  selectedArea,
  onAreaSelected,
  isSelectingArea,
  setIsSelectingArea,
  onClearSelection
}) => {
  const [basemap, setBasemap] = useState('dark');
  const [showContours, setShowContours] = useState(true);
  const [showCatchment, setShowCatchment] = useState(true);
  const [showCandidates, setShowCandidates] = useState(true);

  // Basemap tile definitions
  const basemaps = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; CartoDB &copy; OpenStreetMap contributors',
      name: 'Dark Carto'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, Maxar, Earthstar Geographics',
      name: 'Satellite'
    },
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      name: 'OpenStreetMap'
    }
  };

  const defaultCenter = [21.25, 81.29];
  const defaultZoom = 13;

  // Compute elevation color scale for contours
  const minElev = result?.terrain?.minElevation || 260;
  const maxElev = result?.terrain?.maxElevation || 310;
  const elevRange = maxElev - minElev || 1;

  const getContourStyle = (feature) => {
    const elev = feature?.properties?.elevation || minElev;
    const ratio = Math.max(0, Math.min(1, (elev - minElev) / elevRange));
    // Color gradient from green (low) to yellow to orange to red (high)
    let color = '#38bdf8';
    if (ratio < 0.25) color = '#34d399';
    else if (ratio < 0.5) color = '#38bdf8';
    else if (ratio < 0.75) color = '#fbbf24';
    else color = '#f87171';

    return {
      color,
      weight: 1.2,
      opacity: 0.65
    };
  };

  const catchmentStyle = {
    color: '#10b981',
    weight: 2.5,
    fillColor: '#059669',
    fillOpacity: 0.28,
    dashArray: '4, 2'
  };

  return (
    <div className={`map-wrapper ${isSelectingArea ? 'drawing-mode' : ''}`}>
      {/* Top Map Action Toolbar */}
      <div className="map-toolbar">
        <div className="toolbar-left">
          <button
            className={`tool-btn ${isSelectingArea ? 'active' : ''}`}
            onClick={() => setIsSelectingArea(!isSelectingArea)}
            title="Click and drag on the map to define a land parcel"
          >
            <Crop size={16} />
            <span>{isSelectingArea ? 'Cancel Drawing' : 'Select Land Area'}</span>
          </button>

          {selectedArea && (
            <div className="selection-badge">
              <CheckCircle2 size={14} className="badge-icon" />
              <span>Selected: <strong>{selectedArea.areaHectares} ha</strong></span>
              <button className="badge-clear-btn" onClick={onClearSelection} title="Clear selection">
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-right">
          {/* Layer visibility toggles */}
          {result && (
            <div className="layer-toggles">
              <button 
                className={`layer-toggle-btn ${showContours ? 'active' : ''}`}
                onClick={() => setShowContours(!showContours)}
                title="Toggle Contour Lines"
              >
                {showContours ? <Eye size={14} /> : <EyeOff size={14} />} Contours
              </button>
              <button 
                className={`layer-toggle-btn ${showCatchment ? 'active' : ''}`}
                onClick={() => setShowCatchment(!showCatchment)}
                title="Toggle Catchment Polygon"
              >
                {showCatchment ? <Eye size={14} /> : <EyeOff size={14} />} Catchment
              </button>
            </div>
          )}

          {/* Basemap switcher */}
          <div className="basemap-selector">
            <Layers size={14} style={{ color: 'var(--text-muted)' }} />
            <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
              <option value="dark">Dark Theme</option>
              <option value="satellite">Satellite Imagery</option>
              <option value="streets">Streets</option>
            </select>
          </div>
        </div>
      </div>

      {/* Drawing Instructions Banner */}
      {isSelectingArea && (
        <div className="drawing-instructions-banner">
          <Crop size={16} className="pulse-icon" />
          <span>Click and drag on the map to draw your target Land Area parcel</span>
        </div>
      )}

      {/* The Leaflet Map Container */}
      <div className="map-inner-container">
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution={basemaps[basemap].attribution}
            url={basemaps[basemap].url}
          />

          {/* Auto bounds controller */}
          <MapController 
            bounds={result?.terrain?.bounds} 
            selectedArea={selectedArea}
          />

          {/* Drawing Handler */}
          <AreaSelectionHandler
            isSelecting={isSelectingArea}
            onAreaSelected={(area) => {
              onAreaSelected(area);
              setIsSelectingArea(false);
            }}
          />

          {/* User-selected Land Area Overlay */}
          {selectedArea && selectedArea.minLat && (
            <Rectangle
              bounds={[[selectedArea.minLat, selectedArea.minLng], [selectedArea.maxLat, selectedArea.maxLng]]}
              pathOptions={{
                color: '#f59e0b',
                weight: 2.5,
                dashArray: '6, 6',
                fillColor: '#fbbf24',
                fillOpacity: 0.18
              }}
            >
              <Popup>
                <div className="custom-map-popup">
                  <h4 style={{ color: '#f59e0b' }}>Target Land Selection</h4>
                  <p>Area: <strong>{selectedArea.areaHectares} hectares</strong> ({selectedArea.areaSquareMeters.toLocaleString()} m²)</p>
                  <p className="popup-coords">
                    {selectedArea.minLat.toFixed(4)}, {selectedArea.minLng.toFixed(4)} to {selectedArea.maxLat.toFixed(4)}, {selectedArea.maxLng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Rectangle>
          )}

          {/* Topographic Contour Lines */}
          {result && result.contours && showContours && (
            <GeoJSON
              key={`contours-${result.analysisId || 'default'}`}
              data={result.contours}
              style={getContourStyle}
              onEachFeature={(feature, layer) => {
                const elev = feature?.properties?.elevation;
                if (elev !== undefined) {
                  layer.bindTooltip(`Elevation: ${elev} m`, { sticky: true, className: 'contour-tooltip' });
                }
              }}
            />
          )}

          {/* Upstream Catchment GeoJSON Polygon */}
          {result && result.catchment && result.catchment.polygon && showCatchment && (
            <GeoJSON
              key={`catchment-${result.analysisId || 'default'}`}
              data={result.catchment.polygon}
              style={catchmentStyle}
              onEachFeature={(feature, layer) => {
                layer.bindPopup(`
                  <div class="custom-map-popup">
                    <h4 style="color:#10b981">Delineated Catchment Basin</h4>
                    <p>Area: <strong>${result.catchment.areaHectares.toFixed(2)} ha</strong> (${result.catchment.areaSquareMeters.toLocaleString()} m²)</p>
                    <p style="color:#94a3b8;font-size:11px">Upstream runoff watershed calculated via D8 flow direction</p>
                  </div>
                `);
              }}
            />
          )}

          {/* Alternate Candidate Pond Sites */}
          {result && result.candidates && showCandidates && result.candidates.map((cand, idx) => (
            <Marker
              key={`candidate-${idx}`}
              position={[cand.latitude, cand.longitude]}
              icon={candidateIcon}
            >
              <Popup>
                <div className="custom-map-popup">
                  <h4 style={{ color: '#94a3b8' }}>Alternate Pond Site #{idx + 2}</h4>
                  <p>Suitability: <strong>{(cand.suitabilityScore * 100).toFixed(1)}%</strong></p>
                  <p>Elevation: <strong>{cand.elevation.toFixed(1)}m</strong></p>
                  <p style={{ color: '#94a3b8', fontSize: '11px' }}>{cand.reason}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Selected Optimal Pond Site Marker */}
          {result && result.pondSite && (
            <Marker
              position={[result.pondSite.latitude, result.pondSite.longitude]}
              icon={pondIcon}
            >
              <Popup autoPan={true} className="optimal-pond-popup">
                <div className="custom-map-popup">
                  <div className="popup-badge">Optimal Siting</div>
                  <h4 style={{ color: '#38bdf8', fontSize: '1rem', marginTop: '4px' }}>Suggested Village Pond Location</h4>
                  
                  <div className="popup-grid">
                    <div className="popup-stat">
                      <span className="lbl">Latitude:</span>
                      <span className="val">{result.pondSite.latitude.toFixed(6)}°N</span>
                    </div>
                    <div className="popup-stat">
                      <span className="lbl">Longitude:</span>
                      <span className="val">{result.pondSite.longitude.toFixed(6)}°E</span>
                    </div>
                    <div className="popup-stat">
                      <span className="lbl">Elevation:</span>
                      <span className="val">{result.pondSite.elevation.toFixed(1)} m</span>
                    </div>
                    <div className="popup-stat highlight">
                      <span className="lbl">Suitability:</span>
                      <span className="val">{(result.pondSite.suitabilityScore * 100).toFixed(1)}%</span>
                    </div>
                    {result.waterVolume && (
                      <div className="popup-stat success" style={{ gridColumn: 'span 2' }}>
                        <span className="lbl">Expected Water Volume:</span>
                        <span className="val">{result.waterVolume.expectedVolumeM3.toLocaleString()} m³</span>
                      </div>
                    )}
                    <div className="popup-stat" style={{ gridColumn: 'span 2' }}>
                      <span className="lbl">Catchment Area:</span>
                      <span className="val">{result.catchment.areaHectares.toFixed(2)} ha ({result.catchment.areaSquareMeters.toLocaleString()} m²)</span>
                    </div>
                  </div>

                  <div className="popup-reason">
                    {result.pondSite.reason}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Floating GIS Map Legend */}
        <div className="map-floating-legend">
          <div className="legend-title">GIS Symbology</div>
          <div className="legend-item">
            <span className="sym-pond"></span>
            <span>Proposed Pond Site</span>
          </div>
          <div className="legend-item">
            <span className="sym-catchment"></span>
            <span>Catchment Basin (${result?.catchment?.areaHectares ? `${result.catchment.areaHectares.toFixed(1)} ha` : 'Upstream Watershed'})</span>
          </div>
          {selectedArea && (
            <div className="legend-item">
              <span className="sym-selection"></span>
              <span>Target Land Selection</span>
            </div>
          )}
          <div className="legend-item">
            <span className="sym-contour"></span>
            <span>Topographic Contours (m)</span>
          </div>
          {result?.candidates?.length > 0 && (
            <div className="legend-item">
              <span className="sym-candidate"></span>
              <span>Alternate Candidate Sites</span>
            </div>
          )}
        </div>

        {/* Placeholder overlay when no data */}
        {!result && (
          <div className="map-empty-hint">
            <MapIcon size={32} style={{ opacity: 0.6, marginBottom: '0.5rem' }} />
            <h3>Interactive Topographic GIS Viewer</h3>
            <p>Upload a contour map or click <strong>Select Land Area</strong> above to start spatial hydrological analysis.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapView;
