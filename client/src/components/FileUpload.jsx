import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileCheck, 
  AlertCircle, 
  Sliders, 
  Droplets, 
  CloudRain, 
  Crop, 
  HelpCircle,
  FileCode2,
  Sparkles,
  RefreshCw
} from 'lucide-react';

const FileUpload = ({ 
  onUpload, 
  error, 
  selectedArea, 
  isSelectingArea, 
  setIsSelectingArea 
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  
  // Hydrological inputs
  const [rainfallMm, setRainfallMm] = useState(100);
  const [runoffCoeff, setRunoffCoeff] = useState(0.70);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const openFileChooser = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset so re-selecting same file fires onChange
      fileInputRef.current.click();
    }
  };

  const validateAndSetFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'kml' || ext === 'kmz') {
      setSelectedFile(file);
    } else {
      alert('Please select a KML or KMZ contour file (.kml, .kmz).');
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedFile) return;
    onUpload(selectedFile, selectedArea, rainfallMm, runoffCoeff);
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h2>Topographic Ingestion</h2>
        <p>Upload KML/KMZ elevation contours to delineate catchments and calculate optimal village pond sites.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Hidden File Input placed outside drop-zone */}
      <input 
        ref={fileInputRef}
        type="file" 
        id="file-upload" 
        accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/zip,application/octet-stream" 
        onChange={handleChange} 
        style={{ display: 'none' }} 
      />

      {/* Drag & Drop File Zone */}
      <div 
        className={`drop-zone ${dragActive ? "active" : ""} ${selectedFile ? "has-file" : ""}`}
        onClick={openFileChooser}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        {selectedFile ? (
          <div className="file-info-box">
            <FileCheck className="upload-icon-success" size={40} />
            <div className="file-name">{selectedFile.name}</div>
            <div className="file-meta">
              <span>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
              <span className="file-badge">.{selectedFile.name.split('.').pop().toUpperCase()}</span>
              <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 600 }}>✓ Valid Vector</span>
            </div>
            <button 
              type="button" 
              className="file-change-hint" 
              onClick={openFileChooser}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginTop: '4px' }}
            >
              Click to replace file
            </button>
          </div>
        ) : (
          <div className="drop-zone-placeholder">
            <UploadCloud className="upload-icon" size={48} style={{ pointerEvents: 'none' }} />
            <div className="upload-text" style={{ pointerEvents: 'none' }}>Drag &amp; drop contour map file</div>
            <div className="upload-subtext" style={{ pointerEvents: 'none' }}>Supports <strong>.kml</strong> or <strong>.kmz</strong> elevation vector data</div>
            <button type="button" className="browse-pill" onClick={openFileChooser}>Browse File</button>
          </div>
        )}
      </div>

      {/* Target Land Area Selection Status Card */}
      <div className={`land-selection-card ${selectedArea ? 'selected' : ''}`}>
        <div className="card-header">
          <div className="card-title">
            <Crop size={16} style={{ color: '#f59e0b' }} />
            <span>Target Land Selection</span>
          </div>
          <span className="status-tag" style={{ color: selectedArea ? '#f59e0b' : 'var(--text-muted)' }}>
            {selectedArea ? 'Selected' : 'Pending'}
          </span>
        </div>
        
        {selectedArea ? (
          <div className="selected-area-summary">
            <div className="area-stat">
              <span className="lbl">Selected Area:</span>
              <span className="val" style={{ color: '#fbbf24', fontWeight: 700 }}>{selectedArea.areaHectares} hectares</span>
            </div>
            <div className="area-stat">
              <span className="lbl">Square Metres:</span>
              <span className="val">{selectedArea.areaSquareMeters.toLocaleString()} m²</span>
            </div>
            <p className="area-note">Pond placement and analysis will be constrained to this parcel.</p>
          </div>
        ) : (
          <div className="no-selection-box">
            <p>No land area selected. Use <strong>Select Land Area</strong> and drag a rectangle on the map.</p>
            <button
              type="button"
              className={`btn-secondary-sm ${isSelectingArea ? 'active' : ''}`}
              onClick={() => setIsSelectingArea(!isSelectingArea)}
            >
              <Crop size={14} />
              {isSelectingArea ? 'Cancel Drawing' : 'Select Land Area'}
            </button>
          </div>
        )}
      </div>

      {/* Hydrology & Water Harvesting Parameters */}
      <div className="hydrology-settings-card">
        <div className="card-header" onClick={() => setShowAdvanced(!showAdvanced)} style={{ cursor: 'pointer' }}>
          <div className="card-title">
            <CloudRain size={16} style={{ color: '#38bdf8' }} />
            <span>Water Volume Parameters</span>
          </div>
          <button type="button" className="toggle-btn">
            <Sliders size={14} />
            {showAdvanced ? 'Hide' : 'Configure'}
          </button>
        </div>

        <div className="params-preview">
          <div className="param-chip">
            <span>Rainfall:</span>
            <strong>{rainfallMm} mm</strong>
          </div>
          <div className="param-chip">
            <span>Runoff (C):</span>
            <strong>{runoffCoeff}</strong>
          </div>
        </div>

        {showAdvanced && (
          <div className="params-expanded">
            {/* Rainfall Depth */}
            <div className="input-group">
              <div className="input-label-row">
                <label>Design Rainfall Depth (mm)</label>
                <span className="val-display">{rainfallMm} mm</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="400" 
                step="5" 
                value={rainfallMm} 
                onChange={(e) => setRainfallMm(Number(e.target.value))}
                className="slider-input"
              />
              <div className="preset-buttons">
                <button type="button" onClick={() => setRainfallMm(50)} className={rainfallMm === 50 ? 'active' : ''}>Arid (50mm)</button>
                <button type="button" onClick={() => setRainfallMm(100)} className={rainfallMm === 100 ? 'active' : ''}>Normal (100mm)</button>
                <button type="button" onClick={() => setRainfallMm(200)} className={rainfallMm === 200 ? 'active' : ''}>Monsoon (200mm)</button>
              </div>
            </div>

            {/* Runoff Coefficient */}
            <div className="input-group">
              <div className="input-label-row">
                <label>Soil Runoff Coefficient (C)</label>
                <span className="val-display">{runoffCoeff}</span>
              </div>
              <input 
                type="range" 
                min="0.10" 
                max="0.95" 
                step="0.05" 
                value={runoffCoeff} 
                onChange={(e) => setRunoffCoeff(Number(e.target.value))}
                className="slider-input"
              />
              <div className="preset-buttons">
                <button type="button" onClick={() => setRunoffCoeff(0.35)} className={runoffCoeff === 0.35 ? 'active' : ''}>Sandy (0.35)</button>
                <button type="button" onClick={() => setRunoffCoeff(0.70)} className={runoffCoeff === 0.70 ? 'active' : ''}>Clay Loam (0.70)</button>
                <button type="button" onClick={() => setRunoffCoeff(0.85)} className={runoffCoeff === 0.85 ? 'active' : ''}>Heavy Clay (0.85)</button>
              </div>
            </div>

            <div className="formula-box">
              <code>V (m³) = Area (m²) × (Rainfall / 1000) × C</code>
            </div>
          </div>
        )}
      </div>

      {/* Main Analyze Button */}
      <button 
        className="btn btn-primary" 
        onClick={handleStartAnalysis}
        disabled={!selectedFile}
      >
        <Sparkles size={18} />
        {selectedArea ? 'Analyze Selected Land Area' : 'Select Land Area to Analyze'}
      </button>

      {/* Demo helper */}
      <div className="demo-hint-box">
        <FileCode2 size={15} />
        <span>Ready with standard contour files (e.g. <code>contour_map.kml</code>)</span>
      </div>
    </div>
  );
};

export default FileUpload;
