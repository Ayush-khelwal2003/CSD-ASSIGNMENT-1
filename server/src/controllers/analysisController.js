/**
 * Analysis Controller
 * 
 * Handles HTTP request/response for contour analysis endpoints.
 * Delegates core processing to services.
 */

const path = require('path');
const Analysis = require('../models/Analysis');
const { runAnalysis } = require('../services/analysisService');

/**
 * POST /api/analyze-contour
 * Analyze an uploaded KML/KMZ contour file.
 */
async function analyzeContour(req, res, next) {
  try {
    // Validate file presence
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'No file uploaded. Please upload a KML or KMZ file using the "file" field.'
        }
      });
    }

    const { originalname, buffer } = req.file;
    const ext = path.extname(originalname).toLowerCase();

    // Validate extension (redundant with multer but belt-and-suspenders)
    if (ext !== '.kml' && ext !== '.kmz') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only KML and KMZ files are allowed.'
        }
      });
    }

    // Run analysis pipeline
    const result = await runAnalysis(buffer, originalname);

    // Save to MongoDB
    const analysis = new Analysis({
      filename: result.input.filename,
      format: result.input.format,
      status: 'completed',
      terrain: {
        minElevation: result.terrain.minElevation,
        maxElevation: result.terrain.maxElevation,
        contourCount: result.terrain.contourCount,
        contourInterval: result.terrain.contourInterval,
        bounds: result.terrain.bounds
      },
      pondSite: {
        ...result.pondSite
      },
      catchment: {
        areaSquareMeters: result.catchment.areaSquareMeters,
        areaHectares: result.catchment.areaHectares,
        areaSquareKilometers: result.catchment.areaSquareKilometers,
        polygon: result.catchment.polygon
      },
      contours: result.contours,
      analysis: result.analysis
    });

    await analysis.save();
    console.log(`Analysis saved to MongoDB with ID: ${analysis._id}`);

    // Add the MongoDB ID to the response
    result.id = analysis._id;

    res.status(200).json(result);
  } catch (err) {
    // Handle known errors with proper status codes
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'PROCESSING_ERROR',
          message: err.message
        }
      });
    }

    // Save failed analysis
    try {
      const analysis = new Analysis({
        filename: req.file?.originalname || 'unknown',
        format: req.file?.originalname?.toLowerCase().endsWith('.kmz') ? 'KMZ' : 'KML',
        status: 'failed',
        error: {
          code: 'PROCESSING_ERROR',
          message: err.message
        }
      });
      await analysis.save();
    } catch (saveErr) {
      console.error('Failed to save error analysis:', saveErr.message);
    }

    next(err);
  }
}

/**
 * GET /api/analyses
 * List all saved analyses.
 */
async function getAnalyses(req, res, next) {
  try {
    const analyses = await Analysis.find()
      .select('-contours')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: analyses.length,
      data: analyses
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analyses/:id
 * Get a specific analysis by ID.
 */
async function getAnalysis(req, res, next) {
  try {
    const analysis = await Analysis.findById(req.params.id).select('+contours');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Analysis not found'
        }
      });
    }

    res.json({
      success: true,
      data: analysis
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid analysis ID format'
        }
      });
    }
    next(err);
  }
}

/**
 * GET /api/health
 * Health check endpoint.
 */
async function healthCheck(req, res) {
  const mongoose = require('mongoose');
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
}

module.exports = {
  analyzeContour,
  getAnalyses,
  getAnalysis,
  healthCheck
};
