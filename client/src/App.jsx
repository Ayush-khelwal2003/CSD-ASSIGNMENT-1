import React, { useState, useEffect } from 'react';
import { 
  Droplets, 
  MapPin, 
  History, 
  RotateCcw, 
  Layers, 
  Activity, 
  Crop, 
  Sparkles,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import FileUpload from './components/FileUpload';
import ResultsPanel from './components/ResultsPanel';
import MapView from './components/MapView';
import { analyzeContour, parseContours, getHealth } from './services/api';

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Contour ingestion state (immediate on file browse)
  const [selectedFile, setSelectedFile] = useState(null);
  const [contourData, setContourData] = useState(null);
  const [contourLoading, setContourLoading] = useState(false);
  const [contourStatus, setContourStatus] = useState('');

  const [selectedArea, setSelectedArea] = useState(null);
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'online' | 'offline' | 'checking'
  const [activeCandidateId, setActiveCandidateId] = useState(null);

  // Check backend health periodically
  useEffect(() => {
    const checkHealth = async () => {
      const data = await getHealth();
      if (data && (data.status === 'healthy' || data.success)) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Immediate file selection handler: parses contours on FastAPI and sends GeoJSON + bounds to map
  const handleFileSelected = async (file) => {
    try {
      setSelectedFile(file);
      setContourLoading(true);
      setContourStatus('Parsing contour map...');
      setError(null);
      setResult(null);

      const data = await parseContours(file);
      if (data && data.success) {
        setContourData(data);
        setContourStatus('Contour map loaded successfully.');
      } else {
        throw new Error(data?.message || 'Failed to parse contour vector file');
      }
    } catch (err) {
      console.error("Contour parsing failed:", err);
      const errMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to parse contour map';
      setError(`Failed to load contour map: ${errMsg}`);
      setContourStatus('Failed to load contour map');
      setContourData(null);
    } finally {
      setContourLoading(false);
    }
  };

  const handleUpload = async (file, area, rainfall, runoff) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setActiveCandidateId(null);

      const data = await analyzeContour(file, area, rainfall, runoff);
      if (data && data.success) {
        setResult(data);
        if (data.contours) {
          setContourData({
            contours: data.contours,
            bounds: data.terrain?.bounds || data.metadata?.bounds || data.bounds,
            metadata: data.metadata
          });
        }
        if (data.candidates && data.candidates.length > 0) {
          setActiveCandidateId(data.candidates[0].id);
        } else if (data.pondSite) {
          setActiveCandidateId(data.pondSite.id || 'candidate-1');
        }
      } else {
        throw new Error(data?.message || 'Analysis did not return successful data');
      }
    } catch (err) {
      console.error("Analysis execution failed:", err);
      setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'An unexpected error occurred during terrain analysis.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setContourData(null);
    setSelectedFile(null);
    setSelectedArea(null);
    setError(null);
    setActiveCandidateId(null);
  };

  const handleClearSelection = () => {
    setSelectedArea(null);
    setIsSelectingArea(false);
  };

  const handleSelectCandidate = (cand) => {
    if (cand && cand.id) {
      setActiveCandidateId(cand.id);
    }
  };

  return (
    <div className="app-container">
      {/* PROFESSIONAL GIS DASHBOARD HEADER */}
      <header className="app-header glass-panel">
        <div className="header-left">
          <div className="logo-group">
            <div className="logo-icon-wrap">
              <Droplets className="logo-icon" />
            </div>
            <div className="title-group">
              <div className="main-brand-row">
                <h1 className="brand-title">Pond Catchment Analysis</h1>
                <span className="phase-pill">Phase 3</span>
              </div>
              <p className="brand-subtitle">Topographic Intelligence &amp; Water Resource Planning</p>
            </div>
          </div>
        </div>

        <div className="header-right">
          {/* Live Backend Connection Indicator */}
          <div className={`backend-status-indicator ${backendStatus}`}>
            <span className="pulse-dot"></span>
            <span className="status-label">
              Backend {backendStatus === 'online' ? 'Online' : backendStatus === 'offline' ? 'Offline' : 'Connecting...'}
            </span>
          </div>

          {/* Action: Select Land Area Quick Toggle */}
          <button 
            className={`btn-header ${isSelectingArea ? 'active' : ''}`}
            onClick={() => setIsSelectingArea(!isSelectingArea)}
            title="Draw land area on map"
            disabled={!contourData && !result}
          >
            <Crop size={16} />
            <span>{isSelectingArea ? 'Cancel Draw' : 'Select Land Area'}</span>
          </button>


          {/* Action: New Analysis Reset */}
          {(result || contourData) && (
            <button 
              className="btn-header btn-highlight"
              onClick={handleReset}
              title="Start a fresh analysis"
            >
              <RotateCcw size={16} />
              <span>New Analysis</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN GIS SPLIT VIEW */}
      <main className="main-content">
        {/* LEFT PANE: Controls & Analysis Telemetry */}
        <aside className="glass-panel sidebar-pane">
          {!result && !loading ? (
            <FileUpload 
              onUpload={handleUpload}
              onFileSelected={handleFileSelected}
              selectedFile={selectedFile}
              contourData={contourData}
              contourLoading={contourLoading}
              contourStatus={contourStatus}
              error={error}
              selectedArea={selectedArea}
              isSelectingArea={isSelectingArea}
              setIsSelectingArea={setIsSelectingArea}
            />
          ) : (
            <ResultsPanel 
              result={result} 
              loading={loading} 
              error={error} 
              onReset={handleReset} 
              activeCandidateId={activeCandidateId}
              onSelectCandidate={handleSelectCandidate}
            />
          )}
        </aside>

        {/* RIGHT PANE: Interactive Leaflet Geospatial Map */}
        <section className="glass-panel map-pane">
          <MapView 
            result={result}
            contourData={contourData}
            selectedArea={selectedArea}
            onAreaSelected={(area) => {
              setSelectedArea(area);
              setIsSelectingArea(false);
            }}
            isSelectingArea={isSelectingArea}
            setIsSelectingArea={setIsSelectingArea}
            onClearSelection={handleClearSelection}
            activeCandidateId={activeCandidateId}
            onSelectCandidate={handleSelectCandidate}
          />
        </section>
      </main>

      {/* HISTORICAL RUNS DRAWER */}
      <HistoryDrawer 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        onLoadAnalysis={(histItem) => {
          setResult(histItem);
          if (histItem.contours) {
            setContourData({
              contours: histItem.contours,
              bounds: histItem.terrain?.bounds || histItem.metadata?.bounds || histItem.bounds,
              metadata: histItem.metadata
            });
          }
          if (histItem.selectedArea) {
            setSelectedArea(histItem.selectedArea);
          }
          if (histItem.candidates && histItem.candidates.length > 0) {
            setActiveCandidateId(histItem.candidates[0].id);
          }
        }}
      />
    </div>
  );
}

export default App;
