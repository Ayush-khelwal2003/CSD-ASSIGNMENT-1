const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  analyzeContour,
  getAnalyses,
  getAnalysis,
  healthCheck
} = require('../controllers/analysisController');

// Health check
router.get('/health', healthCheck);

// Analyze contour file
router.post('/analyze-contour', upload.single('file'), analyzeContour);

// List all analyses
router.get('/analyses', getAnalyses);

// Get specific analysis
router.get('/analyses/:id', getAnalysis);

module.exports = router;
