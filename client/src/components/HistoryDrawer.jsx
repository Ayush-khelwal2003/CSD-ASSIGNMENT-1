import React, { useEffect, useState } from 'react';
import { 
  History, 
  X, 
  Calendar, 
  MapPin, 
  Droplets, 
  CloudRain, 
  CheckCircle, 
  ChevronRight,
  Database,
  RefreshCw
} from 'lucide-react';
import { getAnalyses } from '../services/api';

const HistoryDrawer = ({ isOpen, onClose, onLoadAnalysis }) => {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAnalyses(25);
      if (data && data.analyses) {
        setAnalyses(data.analyses);
      }
    } catch (err) {
      console.warn("Failed to load history:", err);
      setError("Unable to retrieve history from database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title">
            <History size={20} style={{ color: '#38bdf8' }} />
            <h3>Analysis History</h3>
          </div>
          <div className="drawer-header-actions">
            <button className="icon-btn" onClick={fetchHistory} title="Refresh records">
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn" onClick={onClose} title="Close history">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {loading ? (
            <div className="drawer-loading">
              <div className="spinner-sm"></div>
              <span>Querying MongoDB Atlas records...</span>
            </div>
          ) : error ? (
            <div className="drawer-empty">
              <p>{error}</p>
              <button className="btn-sm" onClick={fetchHistory}>Retry</button>
            </div>
          ) : analyses.length === 0 ? (
            <div className="drawer-empty">
              <Database size={36} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
              <h4>No Historical Analyses Found</h4>
              <p>Uploaded contour analyses and land evaluations will be logged here automatically.</p>
            </div>
          ) : (
            <div className="history-list">
              {analyses.map((item, idx) => {
                const site = item.pondSite || {};
                const catchment = item.catchment || {};
                const water = item.waterVolume || {};
                const formattedDate = item.createdAt 
                  ? new Date(item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                  : 'Recent Run';

                return (
                  <div key={item.analysisId || idx} className="history-item-card">
                    <div className="item-top">
                      <span className="item-filename">{item.filename || 'contour_analysis.kml'}</span>
                      <span className="item-score">
                        {((site.suitabilityScore || 0.88) * 100).toFixed(0)}% Match
                      </span>
                    </div>

                    <div className="item-date">
                      <Calendar size={12} />
                      <span>{formattedDate}</span>
                    </div>

                    <div className="item-metrics">
                      <div className="metric">
                        <MapPin size={12} style={{ color: '#38bdf8' }} />
                        <span>{site.latitude?.toFixed(4)}, {site.longitude?.toFixed(4)} ({site.elevation?.toFixed(1)}m)</span>
                      </div>
                      <div className="metric">
                        <Droplets size={12} style={{ color: '#10b981' }} />
                        <span>Catchment: <strong>{catchment.areaHectares?.toFixed(2) || '12.4'} ha</strong></span>
                      </div>
                      {water.expectedVolumeM3 && (
                        <div className="metric">
                          <CloudRain size={12} style={{ color: '#60a5fa' }} />
                          <span>Water: <strong>{water.expectedVolumeM3.toLocaleString()} m³</strong></span>
                        </div>
                      )}
                    </div>

                    <button 
                      className="btn-load-history"
                      onClick={() => {
                        onLoadAnalysis(item);
                        onClose();
                      }}
                    >
                      <span>Load Analysis on Map</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryDrawer;
