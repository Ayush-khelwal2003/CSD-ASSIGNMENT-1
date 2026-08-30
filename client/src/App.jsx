import React, { useState } from 'react';
import { Layers, Droplets } from 'lucide-react';
import FileUpload from './components/FileUpload';
import ResultsPanel from './components/ResultsPanel';
import MapView from './components/MapView';
import { analyzeContour } from './services/api';

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (file) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      
      const data = await analyzeContour(file);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || err.message || 'An unexpected error occurred during analysis.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <Droplets className="logo-icon" />
          <span>HydroCatch</span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          CSD Assignment 1 – Phase 2
        </div>
      </header>

      <main className="main-content">
        <aside className="glass-panel">
          {!result && !loading ? (
            <FileUpload onUpload={handleUpload} error={error} />
          ) : (
            <ResultsPanel 
              result={result} 
              loading={loading} 
              error={error} 
              onReset={() => { setResult(null); setError(null); }} 
            />
          )}
        </aside>

        <section className="glass-panel" style={{ padding: '0.5rem' }}>
          <MapView result={result} />
        </section>
      </main>
    </div>
  );
}

export default App;
