import React from 'react';
import { Mountain, Map, Droplets, ChevronLeft, AlertCircle } from 'lucide-react';

const ResultsPanel = ({ result, loading, error, onReset }) => {
  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <div style={{ fontWeight: 500 }}>Analyzing Terrain...</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
          Parsing geometry, building DEM, and calculating hydrology
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="upload-container">
        <div className="alert alert-error">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
        <button className="btn" onClick={onReset} style={{ background: 'transparent', border: '1px solid var(--border)' }}>
          <ChevronLeft size={16} /> Try Another File
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="results-panel">
      <button 
        onClick={onReset} 
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--accent)', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          alignSelf: 'flex-start',
          fontWeight: 600
        }}
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div className="result-section">
        <div className="section-title">
          <Mountain size={18} /> Terrain Stats
        </div>
        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Min Elevation</span>
            <span className="stat-value">{result.terrain.minElevation.toFixed(1)}m</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Max Elevation</span>
            <span className="stat-value">{result.terrain.maxElevation.toFixed(1)}m</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Contour Count</span>
            <span className="stat-value">{result.terrain.contourCount.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Grid Resolution</span>
            <span className="stat-value">~{result.analysis.gridResolution}m</span>
          </div>
        </div>
      </div>

      <div className="result-section">
        <div className="section-title">
          <Map size={18} /> Selected Pond Site
        </div>
        <div className="stat-grid">
          <div className="stat-box highlight">
            <span className="stat-label">Elevation</span>
            <span className="stat-value">{result.pondSite.elevation.toFixed(1)}m</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Coordinates</span>
            <span className="stat-value" style={{ fontSize: '1rem' }}>
              {result.pondSite.latitude.toFixed(4)}, {result.pondSite.longitude.toFixed(4)}
            </span>
          </div>
        </div>
        <div className="reason-box">
          {result.pondSite.reason}
        </div>
      </div>

      <div className="result-section">
        <div className="section-title">
          <Droplets size={18} /> Catchment Area
        </div>
        <div className="stat-grid">
          <div className="stat-box success">
            <span className="stat-label">Area (Hectares)</span>
            <span className="stat-value">{result.catchment.areaHectares.toFixed(2)} ha</span>
          </div>
          <div className="stat-box success">
            <span className="stat-label">Area (Sq Meters)</span>
            <span className="stat-value">{result.catchment.areaSquareMeters.toLocaleString()} m²</span>
          </div>
        </div>
        <div className="reason-box" style={{ background: 'rgba(16, 185, 129, 0.1)', borderLeftColor: 'var(--success)' }}>
          Flow tracing upstream from selected pour point using D8 algorithm.
        </div>
      </div>
      
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
        Processed in {result.analysis.processingTimeMs}ms
      </div>
    </div>
  );
};

export default ResultsPanel;
