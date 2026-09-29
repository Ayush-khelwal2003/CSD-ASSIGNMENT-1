import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes for heavy GIS calculations
});

export const getHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (err) {
    console.warn('Backend health check failed:', err.message);
    return { success: false, status: 'offline', database: 'disconnected' };
  }
};

export const analyzeContour = async (file, selectedArea = null, rainfallMm = 100.0, runoffCoeff = 0.70) => {
  const formData = new FormData();
  // Support both field names for maximum backward/forward compatibility
  formData.append('contour_map', file);
  formData.append('file', file);
  
  if (selectedArea) {
    formData.append('selected_area', typeof selectedArea === 'string' ? selectedArea : JSON.stringify(selectedArea));
  }
  
  formData.append('rainfall_mm', String(rainfallMm));
  formData.append('runoff_coeff', String(runoffCoeff));

  const response = await api.post('/analyze-contour', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
};

export const recalculateVolume = async (areaSquareMeters, rainfallMm = 100.0, runoffCoefficient = 0.70) => {
  const response = await api.post('/recalculate-volume', {
    areaSquareMeters,
    rainfallMm: Number(rainfallMm),
    runoffCoefficient: Number(runoffCoefficient)
  });
  return response.data;
};

export const getAnalyses = async (limit = 25) => {
  const response = await api.get(`/analyses?limit=${limit}`);
  return response.data;
};

export const getAnalysis = async (analysisId) => {
  const response = await api.get(`/analyses/${analysisId}`);
  return response.data;
};

export default api;
