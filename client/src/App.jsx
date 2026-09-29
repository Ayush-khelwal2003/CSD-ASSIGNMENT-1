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
import HistoryDrawer from './components/HistoryDrawer';
import { analyzeContour, getHealth } from './services/api';

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'online' | 'offline' | 'checking'

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

  const handleUpload = async (file, area, rainfall, runoff) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const data = await analyzeContour(file, area, rainfall, runoff);
      if (data && data.success) {
        setResult(data);
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
    setError(null);
  };

  const handleClearSelection = () => {
    setSelectedArea(null);
    setIsSelectingArea(false);
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
          >
            <Crop size={16} />
            <span>{isSelectingArea ? 'Cancel Draw' : 'Select Land Area'}</span>
          </button>

          {/* Action: Analysis History */}
          <button 
            className="btn-header"
            onClick={() => setIsHistoryOpen(true)}
            title="View previous analysis records"
          >
            <History size={16} />
            <span>Analysis History</span>
          </button>

          {/* Action: New Analysis Reset */}
          {result && (
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
            />
          )}
        </aside>

        {/* RIGHT PANE: Interactive Leaflet Geospatial Map */}
        <section className="glass-panel map-pane">
          <MapView 
            result={result}
            selectedArea={selectedArea}
            onAreaSelected={(area) => {
              setSelectedArea(area);
              setIsSelectingArea(false);
            }}
            isSelectingArea={isSelectingArea}
            setIsSelectingArea={setIsSelectingArea}
            onClearSelection={handleClearSelection}
          />
        </section>
      </main>

      {/* HISTORICAL RUNS DRAWER */}
      <HistoryDrawer 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        onLoadAnalysis={(histItem) => {
          setResult(histItem);
          if (histItem.selectedArea) {
            setSelectedArea(histItem.selectedArea);
          }
        }}
      />
    </div>
  );
}

export default App;
