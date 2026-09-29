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

// Dynamic Ranked Candidate Marker Icon Generator with Strongly Highlighted #1 Best Pond
const createCandidateIcon = (rank, isRecommended = false, isActive = false) => {
  if (isRecommended || rank === 1) {
    return new L.DivIcon({
      className: `best-pond-marker-container ${isActive ? 'focused-marker' : ''}`,
      html: `
        <div class="best-pond-pulse-ring"></div>
        <div class="best-pond-floating-label">🏆 BEST POND</div>
        <div class="best-pond-pin-body">
          <span>🏆</span>
        </div>
      `,
      iconSize: [52, 52],
      iconAnchor: [26, 48],
      popupAnchor: [0, -50]
    });
  }

  return new L.DivIcon({
    className: `alt-pond-marker-container ${isActive ? 'focused-marker' : ''}`,
    html: `
      <div class="alt-pond-pin-body">
        <span>#${rank}</span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
};

// Map Size Invalidator and Bounds Controller
const MapController = ({ bounds, selectedArea, activeCandidate }) => {
  const map = useMap();

  // Invalidate size on mount and window resize so Leaflet map is never blank
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  // Handle bounds and flying to active candidate
  useEffect(() => {
    if (activeCandidate && activeCandidate.latitude && activeCandidate.longitude) {
      map.flyTo([activeCandidate.latitude, activeCandidate.longitude], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 0.8
      });
    } else if (bounds && bounds.minLat && bounds.maxLat && bounds.minLng && bounds.maxLng) {
      const b = L.latLngBounds(
        L.latLng(bounds.minLat, bounds.minLng),
        L.latLng(bounds.maxLat, bounds.maxLng)
      );
      map.invalidateSize();
      map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
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

// Interactive Land Area Selection Handler (Mouse Drag Rectangle)
const AreaSelectionHandler = ({ isSelecting, onAreaSelected }) => {
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const map = useMap();

  useEffect(() => {
    if (isSelecting) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
      setStartPoint(null);
      setCurrentPoint(null);
    }
  }, [isSelecting, map]);

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
  contourData,
  selectedArea,
  onAreaSelected,
  isSelectingArea,
  setIsSelectingArea,
  onClearSelection,
  activeCandidateId,
  onSelectCandidate
}) => {
  // Default basemap is Esri Satellite Imagery
  const [basemap, setBasemap] = useState('satellite');
  const [showContours, setShowContours] = useState(true);
  const [showCatchment, setShowCatchment] = useState(true);
  const [showCandidates, setShowCandidates] = useState(true);

  // Basemap tile definitions with Esri Satellite as primary
  const basemaps = {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, Aerogrid, IGN, IGP',
      name: 'Esri Satellite'
    },
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      name: 'OpenStreetMap'
    },
    topo: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, HERE, Garmin, Intermap, increment P Corp.',
      name: 'Esri Topographic'
    }
  };

  const defaultCenter = [21.25, 81.29];
  const defaultZoom = 13;

  // Extract effective contours & bounds from result or immediate contourData
  const contours = result?.contours || contourData?.contours;
  const bounds = result?.terrain?.bounds || contourData?.bounds || contourData?.metadata?.bounds;

  // Compute elevation color scale for contours
  const minElev = result?.terrain?.minElevation || contourData?.metadata?.minElevation || 260;
  const maxElev = result?.terrain?.maxElevation || contourData?.metadata?.maxElevation || 310;
  const elevRange = maxElev - minElev || 1;

  const getContourStyle = (feature) => {
    const elev = feature?.properties?.elevation || minElev;
    const ratio = Math.max(0, Math.min(1, (elev - minElev) / elevRange));
    // Dynamic color gradient: cyan -> emerald -> amber -> coral
    let color = '#38bdf8';
    if (ratio < 0.25) color = '#34d399';
    else if (ratio < 0.50) color = '#a3e635';
    else if (ratio < 0.75) color = '#fbbf24';
    else color = '#f87171';

    return {
      color,
      weight: 1.5,
      opacity: 0.85
    };
  };

  const candidates = result?.candidates || result?.pondCandidates || (result?.pondSite ? [result.pondSite] : []);
  const activeCandidate = candidates.find(c => c.id === activeCandidateId) || candidates[0];

  const catchmentStyle = {
    color: (activeCandidate?.rank === 1 || activeCandidate?.isRecommended) ? '#f59e0b' : '#10b981',
    weight: 2.5,
    dashArray: '4, 4',
    fillColor: (activeCandidate?.rank === 1 || activeCandidate?.isRecommended) ? '#d97706' : '#10b981',
    fillOpacity: 0.28
  };

  // Active catchment polygon
  const activeCatchmentPolygon = activeCandidate?.catchment?.polygon || result?.catchment?.polygon;

  return (
    <div className="map-view-wrapper">
      {/* Top Map Action Toolbar */}
      <div className="map-toolbar">
        <div className="toolbar-left">
          <div className="basemap-selector">
            <Layers size={14} style={{ marginRight: '6px', color: '#94a3b8' }} />
            <span className="tb-label">Layer:</span>
            {Object.keys(basemaps).map((key) => (
              <button
                key={key}
                className={`tb-btn ${basemap === key ? 'active' : ''}`}
                onClick={() => setBasemap(key)}
              >
                {basemaps[key].name}
              </button>
            ))}
          </div>

          <div className="layer-toggles">
            {contours && (
              <button
                className={`tb-toggle-btn ${showContours ? 'active' : ''}`}
                onClick={() => setShowContours(!showContours)}
                title="Toggle Topographic Contours"
              >
                {showContours ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>Contours</span>
              </button>
            )}

            {result?.catchment && (
              <button
                className={`tb-toggle-btn ${showCatchment ? 'active' : ''}`}
                onClick={() => setShowCatchment(!showCatchment)}
                title="Toggle Catchment Watershed Basin"
              >
                {showCatchment ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>Catchment</span>
              </button>
            )}

            {candidates.length > 0 && (
              <button
                className={`tb-toggle-btn ${showCandidates ? 'active' : ''}`}
                onClick={() => setShowCandidates(!showCandidates)}
                title="Toggle Pond Candidate Pins"
              >
                {showCandidates ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>Sites ({candidates.length})</span>
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-right">
          {/* Mouse drag selection trigger */}
          <button
            className={`btn-draw-area ${isSelectingArea ? 'active' : ''}`}
            onClick={() => setIsSelectingArea(!isSelectingArea)}
          >
            <Crop size={15} />
            <span>{isSelectingArea ? 'Cancel Drag Selection' : 'Select Land Area'}</span>
          </button>

          {selectedArea && (
            <button
              className="btn-clear-area"
              onClick={onClearSelection}
              title="Clear selected land area"
            >
              <Trash2 size={14} />
              <span>Clear Parcel</span>
            </button>
          )}
        </div>
      </div>

      {/* Selection Drawing Prompt Overlay */}
      {isSelectingArea && (
        <div className="drawing-banner">
          <Crop size={16} className="pulse-icon" />
          <span>Click and drag a rectangle on the satellite map to select your target land parcel.</span>
        </div>
      )}

      {/* Interactive Leaflet Map Container */}
      <div className="map-container-relative">
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          scrollWheelZoom={true}
          className="leaflet-map-canvas"
          style={{ height: '100%', width: '100%', minHeight: '540px' }}
        >
          {/* Base Imagery Tile Layer */}
          <TileLayer
            key={basemap}
            url={basemaps[basemap].url}
            attribution={basemaps[basemap].attribution}
            maxZoom={19}
          />

          {/* Dynamic Controller for Bounds, Zoom & FlyTo */}
          <MapController 
            bounds={bounds} 
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

          {/* Topographic Contour Lines (visible immediately on file select) */}
          {contours && showContours && (
            <GeoJSON
              key={`contours-${result?.analysisId || contourData?.filename || 'default'}-${contours.features?.length}`}
              data={contours}
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
          {activeCatchmentPolygon && showCatchment && (
            <GeoJSON
              key={`catchment-${result?.analysisId || 'default'}-${activeCandidate?.id || 'main'}`}
              data={activeCatchmentPolygon}
              style={catchmentStyle}
              onEachFeature={(feature, layer) => {
                const cArea = activeCandidate?.catchment?.areaHectares || result?.catchment?.areaHectares;
                const cAreaM2 = activeCandidate?.catchment?.areaSquareMeters || result?.catchment?.areaSquareMeters;
                const isRank1 = (activeCandidate?.rank === 1) || activeCandidate?.isRecommended;
                layer.bindPopup(`
                  <div class="custom-map-popup">
                    <h4 style="color:${isRank1 ? '#fbbf24' : '#10b981'};">
                      ${isRank1 ? '🏆 Best Pond Catchment Basin' : 'Upstream Catchment Basin (Candidate #' + (activeCandidate?.rank || 1) + ')'}
                    </h4>
                    <p>Area: <strong>${cArea ? cArea.toFixed(2) : '0'} ha</strong> (${cAreaM2 ? cAreaM2.toLocaleString() : '0'} m²)</p>
                    <p style="color: #94a3b8; font-size: 11px;">Upstream runoff watershed calculated via D8 flow direction</p>
                  </div>
                `);
              }}
            />
          )}

          {/* Multiple Candidate Pond Sites Pins */}
          {result && showCandidates && candidates.map((cand, idx) => {
            const isRank1 = (cand.rank === 1) || (cand.isRecommended === true) || (!cand.rank && idx === 0);
            const isActive = cand.id === activeCandidateId || (isRank1 && !activeCandidateId);
            const rankNum = cand.rank || (idx + 1);
            const icon = createCandidateIcon(rankNum, isRank1, isActive);

            return (
              <Marker
                key={cand.id || `candidate-${idx}`}
                position={[cand.latitude, cand.longitude]}
                icon={icon}
                zIndexOffset={isRank1 ? 2500 : 500}
                eventHandlers={{
                  click: () => {
                    if (onSelectCandidate) onSelectCandidate(cand);
                  }
                }}
              >
                <Popup autoPan={true} className={isRank1 ? 'optimal-pond-popup' : 'candidate-pond-popup'}>
                  <div className="custom-map-popup" style={{ minWidth: isRank1 ? '245px' : '220px' }}>
                    {isRank1 ? (
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, background: 'rgba(245,158,11,0.25)', border: '1.5px solid #f59e0b', color: '#fbbf24', padding: '0.2rem 0.6rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', letterSpacing: '0.03em' }}>
                        <span>🏆</span>
                        <span>BEST SUITABLE POND LOCATION</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', padding: '0.15rem 0.5rem', borderRadius: '4px', display: 'inline-block' }}>
                        Alternative Candidate Site #{rankNum}
                      </div>
                    )}

                    <h4 style={{ color: isRank1 ? '#fbbf24' : '#38bdf8', fontSize: isRank1 ? '1.02rem' : '0.95rem', fontWeight: 800, marginTop: '5px' }}>
                      {cand.name || (isRank1 ? 'Rank #1 Optimal Pond Site' : `Pond Site #${rankNum}`)}
                    </h4>
                    
                    <div className="popup-grid">
                      <div className="highlight">
                        <span className="lbl">Suitability:</span>
                        <span className="val" style={{ color: isRank1 ? '#fbbf24' : '#38bdf8', fontSize: '0.92rem' }}>
                          {((cand.suitabilityScore || 0.8) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="lbl">Elevation:</span>
                        <span className="val">{cand.elevation?.toFixed(1)} m</span>
                      </div>
                      <div>
                        <span className="lbl">Catchment:</span>
                        <span className="val" style={{ color: '#34d399' }}>
                          {(cand.catchmentAreaHectares || cand.catchment?.areaHectares || 10).toFixed(2)} ha
                        </span>
                      </div>
                      <div>
                        <span className="lbl">Expected Water:</span>
                        <span className="val" style={{ color: '#60a5fa' }}>
                          {(cand.expectedVolumeM3 || cand.waterVolume?.expectedVolumeM3 || 8000).toLocaleString()} m³
                        </span>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span className="lbl">Coordinates:</span>
                        <span className="val">{cand.latitude.toFixed(5)}°N, {cand.longitude.toFixed(5)}°E</span>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span className="lbl">Distance to Channel:</span>
                        <span className="val">~{Math.round(cand.distanceToChannelMeters || 0)} m safe buffer</span>
                      </div>
                    </div>

                    <div className="popup-reason" style={{ borderColor: isRank1 ? '#f59e0b' : '#38bdf8', color: '#cbd5e1' }}>
                      {cand.reason}
                    </div>

                    <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
                      <button 
                        className="btn-popup-select"
                        style={{
                          background: isRank1 ? 'linear-gradient(135deg, #d97706, #b45309)' : '#0284c7',
                          color: '#fff',
                          border: isRank1 ? '1px solid #fef08a' : 'none',
                          padding: '0.4rem 0.9rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          width: '100%',
                          boxShadow: isRank1 ? '0 2px 10px rgba(245,158,11,0.4)' : 'none'
                        }}
                        onClick={() => onSelectCandidate && onSelectCandidate(cand)}
                      >
                        {isRank1 ? '✓ Focus Best Pond Catchment' : 'Focus & Delineate Catchment on Map'}
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
            <span className="sym-pond rank-1-sym" style={{ background: '#f59e0b', borderColor: '#fef08a' }}></span>
            <span>🏆 Best Suitable Pond (#1)</span>
          </div>
          <div className="legend-item">
            <span className="sym-candidate-pin"></span>
            <span>Alternate Candidates (#2 - #{candidates.length || 5})</span>
          </div>
          <div className="legend-item">
            <span className="sym-catchment"></span>
            <span>Catchment Basin ({activeCandidate?.catchment?.areaHectares ? `${activeCandidate.catchment.areaHectares.toFixed(1)} ha` : 'Upstream Watershed'})</span>
          </div>
          {selectedArea && (
            <div className="legend-item">
              <span className="sym-selection"></span>
              <span>Selected Land Parcel ({selectedArea.areaHectares} ha)</span>
            </div>
          )}
          {contours && (
            <div className="legend-item">
              <span className="sym-contour"></span>
              <span>Topographic Contours ({minElev}m - {maxElev}m)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapView;
