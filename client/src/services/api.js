import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

export const analyzeContour = async (file) => {
  const formData = new FormData();
  formData.append('contour_map', file);

  const response = await api.post('/analyze-contour', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
};

export const getHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};
