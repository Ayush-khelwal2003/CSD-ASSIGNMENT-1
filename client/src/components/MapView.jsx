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
  EyeOff,
  Award,
  Sparkles
} from 'lucide-react';

// Fix Leaflet marker icons in Vite/React bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Dynamic Ranked Candidate Marker Icon Generator
const createCandidateIcon = (rank, isRecommended = false, isActive = false) => {
  if (isRecommended || rank === 1) {
    return new L.DivIcon({
      className: `custom-pond-marker-container ${isActive ? 'focused-marker' : ''}`,
      html: `
        <div class="pond-marker-pulse"></div>
        <div class="pond-marker-pin rank-primary">
          <div class="rank-number">#1</div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -40]
    });
  }

  return new L.DivIcon({
    className: `custom-candidate-marker ${isActive ? 'focused-marker' : ''}`,
    html: `
      <div class="candidate-marker-pin rank-alt">
        <span class="cand-rank-num">#${rank}</span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
};

// Bounds, Zoom, and Active Site Manager
const MapController = ({ bounds, selectedArea, activeCandidate }) => {
  const map = useMap();

  useEffect(() => {
    if (activeCandidate && activeCandidate.latitude && activeCandidate.longitude) {
      map.flyTo([activeCandidate.latitude, activeCandidate.longitude], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 0.8
      });
    } else if (bounds) {
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
  }, [bounds, selectedArea, activeCandidate, map]);

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
  onClearSelection,
  activeCandidateId,
  onSelectCandidate
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

  // Candidates list
  const candidates = result?.candidates && result.candidates.length > 0 
    ? result.candidates 
    : (result?.pondSite ? [result.pondSite] : []);

  const activeCandidate = candidates.find(c => c.id === activeCandidateId);

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
              <button 
                className={`layer-toggle-btn ${showCandidates ? 'active' : ''}`}
                onClick={() => setShowCandidates(!showCandidates)}
                title="Toggle Candidate Sites"
              >
                {showCandidates ? <Eye size={14} /> : <EyeOff size={14} />} Sites ({candidates.length})
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
            activeCandidate={activeCandidate}
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
                    <h4 style={{ color: '#10b981' }}>Delineated Catchment Basin</h4>
                    <p>Area: <strong>{result.catchment.areaHectares.toFixed(2)} ha</strong> ({result.catchment.areaSquareMeters.toLocaleString()} m²)</p>
                    <p style={{ color: '#94a3b8', fontSize: '11px' }}>Upstream runoff watershed calculated via D8 flow direction</p>
                  </div>
                `);
              }}
            />
          )}

          {/* Multiple Candidate Pond Sites Pins */}
          {result && showCandidates && candidates.map((cand, idx) => {
            const isRank1 = (cand.rank === 1) || (!cand.rank && idx === 0);
            const isActive = cand.id === activeCandidateId || (isRank1 && !activeCandidateId);
            const icon = createCandidateIcon(cand.rank || idx + 1, isRank1, isActive);

            return (
              <Marker
                key={cand.id || `candidate-${idx}`}
                position={[cand.latitude, cand.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    if (onSelectCandidate) onSelectCandidate(cand);
                  }
                }}
              >
                <Popup autoPan={true} className={isRank1 ? 'optimal-pond-popup' : 'candidate-pond-popup'}>
                  <div className="custom-map-popup">
                    <div className="popup-badge" style={{ background: isRank1 ? 'rgba(56,189,248,0.2)' : 'rgba(251,191,36,0.2)', color: isRank1 ? '#38bdf8' : '#fbbf24' }}>
                      {isRank1 ? '★ Rank #1 (Recommended Site)' : `Candidate Site #${cand.rank || idx + 1}`}
                    </div>
                    <h4 style={{ color: isRank1 ? '#38bdf8' : '#fff', fontSize: '0.95rem', marginTop: '4px' }}>
                      {cand.name || `Pond Site #${cand.rank || idx + 1}`}
                    </h4>
                    
                    <div className="popup-grid">
                      <div className="popup-stat">
                        <span className="lbl">Latitude:</span>
                        <span className="val">{cand.latitude.toFixed(5)}°N</span>
                      </div>
                      <div className="popup-stat">
                        <span className="lbl">Longitude:</span>
                        <span className="val">{cand.longitude.toFixed(5)}°E</span>
                      </div>
                      <div className="popup-stat">
                        <span className="lbl">Elevation:</span>
                        <span className="val">{cand.elevation.toFixed(1)} m</span>
                      </div>
                      <div className="popup-stat highlight">
                        <span className="lbl">Suitability:</span>
                        <span className="val">{((cand.suitabilityScore || 0.8) * 100).toFixed(1)}%</span>
                      </div>
                      {cand.expectedVolumeM3 && (
                        <div className="popup-stat success" style={{ gridColumn: 'span 2' }}>
                          <span className="lbl">Expected Inflow Volume:</span>
                          <span className="val">{cand.expectedVolumeM3.toLocaleString()} m³</span>
                        </div>
                      )}
                      <div className="popup-stat" style={{ gridColumn: 'span 2' }}>
                        <span className="lbl">Distance to Channel:</span>
                        <span className="val">~{Math.round(cand.distanceToChannelMeters || 0)} m safe buffer</span>
                      </div>
                    </div>

                    <div className="popup-reason">
                      {cand.reason}
                    </div>

                    <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
                      <button 
                        className="btn-popup-select"
                        onClick={() => onSelectCandidate && onSelectCandidate(cand)}
                      >
                        Inspect &amp; Compare This Site
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating GIS Map Legend */}
        <div className="map-floating-legend">
          <div className="legend-title">GIS Symbology</div>
          <div className="legend-item">
            <span className="sym-pond rank-1-sym"></span>
            <span>Rank #1 Recommended Pond</span>
          </div>
          <div className="legend-item">
            <span className="sym-candidate-pin"></span>
            <span>Alternate Candidates (#2 - #{candidates.length})</span>
          </div>
          <div className="legend-item">
            <span className="sym-catchment"></span>
            <span>Catchment Basin ({result?.catchment?.areaHectares ? `${result.catchment.areaHectares.toFixed(1)} ha` : 'Upstream Watershed'})</span>
          </div>
          {selectedArea && (
            <div className="legend-item">
              <span className="sym-selection"></span>
              <span>Selected Land Parcel ({selectedArea.areaHectares} ha)</span>
            </div>
          )}
          <div className="legend-item">
            <span className="sym-contour"></span>
            <span>Topographic Contours (m)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
