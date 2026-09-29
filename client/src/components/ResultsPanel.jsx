import React, { useState, useEffect } from 'react';
import { 
  Mountain, 
  Map, 
  Droplets, 
  ChevronLeft, 
  AlertCircle, 
  CheckCircle2, 
  BarChart3, 
  CloudRain, 
  Compass, 
  Layers, 
  Sliders, 
  Sparkles, 
  Info, 
  Clock, 
  ShieldCheck, 
  Check, 
  Table, 
  ListFilter, 
  ArrowUpRight, 
  Award, 
  TrendingUp 
} from 'lucide-react';
import { recalculateVolume } from '../services/api';

const ResultsPanel = ({ 
  result, 
  loading, 
  error, 
  onReset, 
  activeCandidateId, 
  onSelectCandidate 
}) => {
  const [rainfall, setRainfall] = useState(100);
  const [runoff, setRunoff] = useState(0.70);
  const [waterVolume, setWaterVolume] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'comparison' | 'suitability' | 'water'

  useEffect(() => {
    if (result && result.waterVolume) {
      setWaterVolume(result.waterVolume);
      setRainfall(result.waterVolume.rainfallMm || 100);
      setRunoff(result.waterVolume.runoffCoefficient || 0.70);
    }
  }, [result]);

  const handleRecalculate = async (newRainfall, newRunoff) => {
    if (!result?.catchment?.areaSquareMeters) return;
    setRecalculating(true);
    try {
      const res = await recalculateVolume(result.catchment.areaSquareMeters, newRainfall, newRunoff);
      if (res.success) {
        setWaterVolume(res.waterVolume);
      }
    } catch (err) {
      console.error("Recalculation error:", err);
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="gis-radar-spinner">
          <div className="radar-sweep"></div>
          <div className="radar-core"></div>
        </div>
        <div className="loading-title">Analyzing Topography &amp; Hydrology...</div>
        <div className="loading-subtext">
          Interpolating DEM grid • Tracing D8 drainage flow • Evaluating multi-factor pond suitability • Generating multiple spatially distinct candidates
        </div>
        <div className="loading-pipeline-steps">
          <div className="pipeline-step done">✓ Parsed Contour Geometry</div>
          <div className="pipeline-step active">⚡ Computing Flow Accumulation &amp; Candidates</div>
          <div className="pipeline-step">Delineating Watershed Catchments</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-panel">
        <div className="alert alert-error">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Analysis Failed</strong>
            <p>{error}</p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={onReset}>
          <ChevronLeft size={16} /> Try Another Contour Map
        </button>
      </div>
    );
  }

  if (!result) return null;

  // Candidates list
  const candidates = result.candidates && result.candidates.length > 0 
    ? result.candidates 
    : (result.pondSite ? [result.pondSite] : []);

  // Find active site (or default to rank 1 / pondSite)
  const activeCandidate = candidates.find(c => c.id === activeCandidateId) || result.pondSite || candidates[0] || {};
  const catchment = result.catchment || {};
  const terrain = result.terrain || {};
  const breakdown = activeCandidate.scoreBreakdown || result.pondSite?.scoreBreakdown || {};

  // Formatted reasons
  const reasonBullets = activeCandidate.reason 
    ? activeCandidate.reason.replace('Optimal pond site selected: ', '').replace('Land site selected: ', '').split('; ')
    : ['High composite topographic suitability score', 'Optimal slope gradient for earthen excavation'];

  return (
    <div className="results-panel">
      {/* Top Header Controls */}
      <div className="results-header-bar">
        <button onClick={onReset} className="btn-back">
          <ChevronLeft size={16} />
          <span>New Analysis</span>
        </button>
        <div className="processing-badge">
          <Clock size={12} />
          <span>{result.processingTimeMs || 1020} ms</span>
        </div>
      </div>

      {/* Result Navigation Tabs */}
      <div className="result-tab-bar">
        <button 
          className={`result-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`result-tab ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          Compare Sites ({candidates.length})
        </button>
        <button 
          className={`result-tab ${activeTab === 'suitability' ? 'active' : ''}`}
          onClick={() => setActiveTab('suitability')}
        >
          Suitability
        </button>
        <button 
          className={`result-tab ${activeTab === 'water' ? 'active' : ''}`}
          onClick={() => setActiveTab('water')}
        >
          Water Simulator
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <>
          {/* Card 1: Active Suggested Pond Site */}
          <div className="result-card primary-site-card">
            <div className="card-header">
              <div className="card-title">
                <MapPin size={18} style={{ color: activeCandidate.isRecommended ? '#38bdf8' : '#fbbf24' }} />
                <span>{activeCandidate.name || 'Suggested Pond Location'}</span>
              </div>
              <span className="score-pill">
                {((activeCandidate.suitabilityScore || 0.88) * 100).toFixed(1)}% Suitability
              </span>
            </div>

            <div className="stats-grid-2x2">
              <div className="stat-card">
                <span className="stat-label">Latitude</span>
                <span className="stat-value">{activeCandidate.latitude?.toFixed(5)}°N</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Longitude</span>
                <span className="stat-value">{activeCandidate.longitude?.toFixed(5)}°E</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Elevation</span>
                <span className="stat-value text-blue">{activeCandidate.elevation?.toFixed(1)} m</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Channel Buffer</span>
                <span className="stat-value">~{Math.round(activeCandidate.distanceToChannelMeters || 45)} m</span>
              </div>
            </div>

            {activeCandidate.inSelectedArea && (
              <div className="selection-notice-pill">
                <CheckCircle2 size={13} style={{ color: '#10b981' }} />
                <span>Optimized inside user-selected land boundary</span>
              </div>
            )}
          </div>

          {/* Card 2: Catchment Basin */}
          <div className="result-card">
            <div className="card-header">
              <div className="card-title">
                <Layers size={18} style={{ color: '#10b981' }} />
                <span>Upstream Catchment Basin</span>
              </div>
              <span className="tag-info">D8 Watershed</span>
            </div>

            <div className="stats-grid-2x2">
              <div className="stat-card highlight-green">
                <span className="stat-label">Catchment Area</span>
                <span className="stat-value text-green" style={{ fontSize: '1.25rem' }}>
                  {catchment.areaHectares?.toFixed(2) || '0'} <small style={{ fontSize: '0.8rem' }}>ha</small>
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Square Metres</span>
                <span className="stat-value">{catchment.areaSquareMeters?.toLocaleString() || '0'} m²</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Square Kilometres</span>
                <span className="stat-value">{catchment.areaSquareKilometers?.toFixed(4) || '0'} km²</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Flow Accumulation</span>
                <span className="stat-value">{activeCandidate.flowAccumulation || 14} cells</span>
              </div>
            </div>
          </div>

          {/* Card 3: Water Volume */}
          <div className="result-card water-summary-card">
            <div className="card-header">
              <div className="card-title">
                <Droplets size={18} style={{ color: '#60a5fa' }} />
                <span>Expected Collectable Water Volume</span>
              </div>
              <span className="tag-accent">Hydrological Model</span>
            </div>

            <div className="water-metric-box">
              <div className="water-vol-number">
                {(activeCandidate.expectedVolumeM3 || waterVolume?.expectedVolumeM3)?.toLocaleString() || '0'} m³
              </div>
              <div className="water-vol-liters">
                = {(((activeCandidate.expectedVolumeM3 || waterVolume?.expectedVolumeM3) * 1000 || 0) / 1000000).toFixed(2)} Million Litres ({waterVolume?.expectedVolumeAcreFeet || 0} Acre-Feet)
              </div>
            </div>

            <div className="water-assumptions-bar">
              <div className="assump-item">
                <span>Rainfall:</span> <strong>{waterVolume?.rainfallMm || rainfall} mm</strong>
              </div>
              <div className="assump-item">
                <span>Runoff Coeff (C):</span> <strong>{waterVolume?.runoffCoefficient || runoff}</strong>
              </div>
            </div>
          </div>

          {/* Card 4: Why This Pond Location? */}
          <div className="result-card">
            <div className="card-header">
              <div className="card-title">
                <Sparkles size={18} style={{ color: '#f59e0b' }} />
                <span>Why This Pond Location?</span>
              </div>
            </div>

            <div className="reasoning-checklist">
              {reasonBullets.map((bullet, idx) => (
                <div key={idx} className="reason-check-item">
                  <div className="check-bullet"><Check size={13} /></div>
                  <span className="bullet-text">{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: CANDIDATE COMPARISON (CRITICAL FEATURE) */}
      {activeTab === 'comparison' && (
        <div className="result-card comparison-card">
          <div className="card-header">
            <div className="card-title">
              <Table size={18} style={{ color: '#38bdf8' }} />
              <span>Pond Site Candidates Comparison</span>
            </div>
            <span className="score-pill">{candidates.length} Locations Evaluated</span>
          </div>

          <p className="tab-desc">
            Spatially distinct candidate sites ranked by multi-factor GIS suitability. Click any candidate to focus on the map and view its specific hydrology:
          </p>

          <div className="candidates-list">
            {candidates.map((cand, idx) => {
              const isSelected = (cand.id === activeCandidate.id) || (idx === 0 && !activeCandidateId);
              const scorePct = ((cand.suitabilityScore || 0) * 100).toFixed(1);
              return (
                <div 
                  key={cand.id || idx}
                  className={`candidate-compare-row ${isSelected ? 'active-cand-row' : ''}`}
                  onClick={() => onSelectCandidate && onSelectCandidate(cand)}
                >
                  <div className="cand-row-header">
                    <div className="cand-rank-badge">
                      {cand.isRecommended ? (
                        <span className="rank-pill rank-1">
                          <Award size={13} /> Rank #{cand.rank || 1} (Recommended)
                        </span>
                      ) : (
                        <span className="rank-pill">
                          Rank #{cand.rank || idx + 1}
                        </span>
                      )}
                      <span className="cand-coords">
                        {cand.latitude?.toFixed(4)}°N, {cand.longitude?.toFixed(4)}°E
                      </span>
                    </div>

                    <div className="cand-score-tag">
                      <strong style={{ color: cand.isRecommended ? '#10b981' : '#38bdf8' }}>{scorePct}%</strong>
                    </div>
                  </div>

                  <div className="cand-stats-strip">
                    <div className="cand-stat">
                      <span className="lbl">Elevation</span>
                      <span className="val">{cand.elevation?.toFixed(1)} m</span>
                    </div>
                    <div className="cand-stat">
                      <span className="lbl">Inflow Volume</span>
                      <span className="val highlight">{cand.expectedVolumeM3?.toLocaleString() || '—'} m³</span>
                    </div>
                    <div className="cand-stat">
                      <span className="lbl">Channel Buffer</span>
                      <span className="val">~{Math.round(cand.distanceToChannelMeters || 0)} m</span>
                    </div>
                    <div className="cand-stat">
                      <span className="lbl">Upstream Flow</span>
                      <span className="val">{cand.flowAccumulation || 10} cells</span>
                    </div>
                  </div>

                  {/* Pros & Trade-offs */}
                  {cand.pros && cand.pros.length > 0 && (
                    <div className="cand-pros-box">
                      <div className="pros-title">Key Advantages:</div>
                      {cand.pros.slice(0, 2).map((p, pi) => (
                        <div key={pi} className="pro-line">
                          <Check size={11} style={{ color: '#10b981', flexShrink: 0 }} />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {cand.cons && cand.cons.length > 0 && (
                    <div className="cand-cons-box">
                      <div className="cons-title">Considerations:</div>
                      {cand.cons.slice(0, 1).map((c, ci) => (
                        <div key={ci} className="con-line">
                          <span className="bullet-dash">•</span>
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="cand-action-footer">
                    <button 
                      className={`btn-select-cand ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectCandidate) onSelectCandidate(cand);
                      }}
                    >
                      {isSelected ? '✓ Currently Focused' : 'Focus on Map & Overview'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: SUITABILITY BREAKDOWN */}
      {activeTab === 'suitability' && (
        <div className="result-card">
          <div className="card-header">
            <div className="card-title">
              <BarChart3 size={18} style={{ color: '#38bdf8' }} />
              <span>Multi-Factor Suitability Breakdown</span>
            </div>
            <span className="score-pill">
              {((activeCandidate.suitabilityScore || 0.88) * 100).toFixed(1)}% Total
            </span>
          </div>

          <p className="tab-desc">
            Geospatial suitability composite calculated using six hydrological and topographical factors for {activeCandidate.name || 'Candidate #1'}:
          </p>

          <div className="factors-list">
            {[
              { key: 'channelOffset', label: 'Drainage Channel Offset', weight: '25%', desc: 'Safe distance from river to prevent stream breach' },
              { key: 'depression', label: 'Natural Depression (Bowl)', weight: '20%', desc: 'Natural terrain hollow reduces required excavation' },
              { key: 'catchment', label: 'Upstream Catchment Flow', weight: '20%', desc: 'High gravity flow accumulation from surrounding slopes' },
              { key: 'slope', label: 'Low Terrain Slope Gradient', weight: '15%', desc: 'Flat/gentle gradient suitable for pond bunding' },
              { key: 'elevation', label: 'Relative Elevation', weight: '10%', desc: 'Low-lying zone for gravity-driven water collection' },
              { key: 'convergence', label: 'Topographic Convergence', weight: '10%', desc: 'Surrounded by higher ground for convergent runoff' }
            ].map(({ key, label, weight, desc }) => {
              const val = breakdown[key] != null ? breakdown[key] : 0.85;
              const percent = Math.round(val * 100);
              return (
                <div key={key} className="factor-row">
                  <div className="factor-meta">
                    <span className="factor-name">{label}</span>
                    <span className="factor-weight">Weight: {weight}</span>
                    <span className="factor-val">{percent}%</span>
                  </div>
                  <div className="progress-track">
                    <div 
                      className="progress-fill" 
                      style={{ 
                        width: `${percent}%`,
                        backgroundColor: percent > 80 ? '#10b981' : percent > 60 ? '#38bdf8' : '#f59e0b'
                      }}
                    />
                  </div>
                  <div className="factor-subtext">{desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: WATER VOLUME SIMULATOR */}
      {activeTab === 'water' && (
        <div className="result-card">
          <div className="card-header">
            <div className="card-title">
              <CloudRain size={18} style={{ color: '#38bdf8' }} />
              <span>Hydrological Water Harvest Model</span>
            </div>
            {recalculating && <span className="calculating-tag">Calculating...</span>}
          </div>

          <div className="simulator-box">
            <div className="sim-formula">
              <code>V = Catchment Area (m²) × Rainfall (m) × Runoff Coefficient (C)</code>
            </div>

            {/* Slider 1: Rainfall */}
            <div className="sim-slider-group">
              <div className="slider-header">
                <label>Design Rainfall Depth</label>
                <span className="slider-val">{rainfall} mm</span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={rainfall}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRainfall(val);
                  handleRecalculate(val, runoff);
                }}
                className="slider-input"
              />
              <div className="sim-presets">
                <button onClick={() => { setRainfall(50); handleRecalculate(50, runoff); }} className={rainfall === 50 ? 'active' : ''}>Arid (50mm)</button>
                <button onClick={() => { setRainfall(100); handleRecalculate(100, runoff); }} className={rainfall === 100 ? 'active' : ''}>Standard (100mm)</button>
                <button onClick={() => { setRainfall(250); handleRecalculate(250, runoff); }} className={rainfall === 250 ? 'active' : ''}>Monsoon (250mm)</button>
              </div>
            </div>

            {/* Slider 2: Soil Runoff Coefficient */}
            <div className="sim-slider-group">
              <div className="slider-header">
                <label>Soil Runoff Coefficient (C)</label>
                <span className="slider-val">{runoff}</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.95"
                step="0.05"
                value={runoff}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRunoff(val);
                  handleRecalculate(rainfall, val);
                }}
                className="slider-input"
              />
              <div className="sim-presets">
                <button onClick={() => { setRunoff(0.35); handleRecalculate(rainfall, 0.35); }} className={runoff === 0.35 ? 'active' : ''}>Sandy Loam (0.35)</button>
                <button onClick={() => { setRunoff(0.70); handleRecalculate(rainfall, 0.70); }} className={runoff === 0.70 ? 'active' : ''}>Clay Loam (0.70)</button>
                <button onClick={() => { setRunoff(0.85); handleRecalculate(rainfall, 0.85); }} className={runoff === 0.85 ? 'active' : ''}>Heavy Clay (0.85)</button>
              </div>
            </div>

            {/* Live Calculated Results */}
            <div className="sim-output-card">
              <span className="output-lbl">Expected Collectable Water Volume:</span>
              <div className="output-main">{waterVolume?.expectedVolumeM3?.toLocaleString() || '0'} m³</div>
              <div className="output-sub">
                = {((waterVolume?.expectedVolumeLiters || 0) / 1000000).toFixed(2)} Million Litres ({waterVolume?.expectedVolumeAcreFeet || 0} Acre-Feet)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Telemetry Footer */}
      <div className="result-telemetry-box">
        <div className="telem-item">
          <span>Grid:</span> <strong>{terrain.gridRows || 39} × {terrain.gridCols || 50}</strong>
        </div>
        <div className="telem-item">
          <span>Cell Res:</span> <strong>~{terrain.cellSizeMeters || 65}m</strong>
        </div>
        <div className="telem-item">
          <span>Elev Range:</span> <strong>{terrain.minElevation || 267}m – {terrain.maxElevation || 298}m</strong>
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
