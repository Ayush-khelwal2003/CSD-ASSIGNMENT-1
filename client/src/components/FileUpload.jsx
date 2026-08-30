import React, { useCallback, useState } from 'react';
import { UploadCloud, File, AlertCircle } from 'lucide-react';

const FileUpload = ({ onUpload, error }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'kml' || ext === 'kmz') {
      setSelectedFile(file);
    } else {
      alert("Please upload a .kml or .kmz file");
    }
  };

  const handleUploadClick = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  return (
    <div className="upload-container">
      <div className="section-title">
        <UploadCloud size={20} />
        Upload Contour Map
      </div>
      
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Upload a KML or KMZ file containing contour lines to analyze the terrain, identify a pond location, and delineate the catchment area.
      </p>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      <form onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
        <input 
          type="file" 
          id="file-upload" 
          accept=".kml,.kmz" 
          onChange={handleChange} 
          style={{ display: 'none' }} 
        />
        <label 
          htmlFor="file-upload" 
          className={`drop-zone ${dragActive ? "active" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {selectedFile ? (
            <>
              <File className="upload-icon" />
              <div className="upload-text">{selectedFile.name}</div>
              <div className="upload-subtext">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</div>
            </>
          ) : (
            <>
              <UploadCloud className="upload-icon" />
              <div className="upload-text">Drag & drop your file here</div>
              <div className="upload-subtext">or click to browse (.kml, .kmz)</div>
            </>
          )}
        </label>
      </form>

      <button 
        className="btn" 
        onClick={handleUploadClick}
        disabled={!selectedFile}
        style={{ marginTop: '0.5rem' }}
      >
        Analyze Terrain
      </button>
    </div>
  );
};

export default FileUpload;
