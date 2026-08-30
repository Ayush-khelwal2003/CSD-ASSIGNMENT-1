import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Map as MapIcon } from 'lucide-react';

// Fix Leaflet default marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker for the pond site
const pondIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to handle map view bounds updates
const MapUpdater = ({ result }) => {
  const map = useMap();
  
  useEffect(() => {
    if (result && result.terrain && result.terrain.bounds) {
      const b = result.terrain.bounds;
      const bounds = L.latLngBounds(
        L.latLng(b.minLat, b.minLng),
        L.latLng(b.maxLat, b.maxLng)
      );
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 17 });
    }
  }, [result, map]);

  return null;
};

const MapView = ({ result }) => {
  const [mapReady, setMapReady] = useState(false);
  
  // Default center if no result
  const defaultCenter = [21.25, 81.29]; 
  const defaultZoom = 13;

  const getContourStyle = (feature) => {
    // Optional: color code by elevation
    return {
      color: '#3b82f6',
      weight: 1,
      opacity: 0.5
    };
  };

  const catchmentStyle = {
    color: '#10b981',
    weight: 2,
    fillColor: '#10b981',
    fillOpacity: 0.2
  };

  if (!result) {
    return (
      <div className="map-container">
        <div className="map-placeholder">
          <MapIcon className="map-icon" />
          <p>Upload a contour map to view terrain analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-container">
      <MapContainer 
        center={defaultCenter} 
        zoom={defaultZoom} 
        style={{ height: '100%', width: '100%' }}
        whenReady={() => setMapReady(true)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Bounds updater */}
        <MapUpdater result={result} />

        {/* Contour Lines */}
        {result.contours && (
          <GeoJSON 
            data={result.contours} 
            style={getContourStyle} 
            onEachFeature={(feature, layer) => {
              if (feature.properties && feature.properties.elevation) {
                layer.bindPopup(`Elevation: ${feature.properties.elevation}m`);
              }
            }}
          />
        )}

        {/* Catchment Polygon */}
        {result.catchment && result.catchment.polygon && (
          <GeoJSON 
            data={result.catchment.polygon} 
            style={catchmentStyle} 
          />
        )}

        {/* Pond Site Marker */}
        {result.pondSite && (
          <Marker 
            position={[result.pondSite.latitude, result.pondSite.longitude]}
            icon={pondIcon}
          >
            <Popup>
              <div style={{ padding: '4px' }}>
                <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>Proposed Pond Site</h4>
                <p style={{ margin: '0 0 4px 0', color: '#333' }}>Elevation: <strong>{result.pondSite.elevation.toFixed(1)}m</strong></p>
                <p style={{ margin: 0, color: '#666', fontSize: '11px' }}>Catchment: {result.catchment.areaHectares.toFixed(2)} ha</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default MapView;
