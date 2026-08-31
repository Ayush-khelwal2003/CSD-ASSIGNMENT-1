const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  format: {
    type: String,
    enum: ['KML', 'KMZ'],
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  terrain: {
    minElevation: Number,
    maxElevation: Number,
    contourCount: Number,
    contourInterval: Number,
    bounds: {
      minLat: Number,
      maxLat: Number,
      minLng: Number,
      maxLng: Number
    }
  },
  pondSite: {
    latitude: Number,
    longitude: Number,
    elevation: Number,
    reason: String,
    suitabilityScore: Number,
    scoreBreakdown: mongoose.Schema.Types.Mixed,
    distanceToChannelMeters: Number
  },
  catchment: {
    areaSquareMeters: Number,
    areaHectares: Number,
    areaSquareKilometers: Number,
    polygon: {
      type: { type: String, enum: ['Polygon', 'MultiPolygon'] },
      coordinates: mongoose.Schema.Types.Mixed
    }
  },
  contours: {
    type: mongoose.Schema.Types.Mixed,
    select: false // Don't return by default (can be large)
  },
  analysis: {
    method: String,
    confidence: String,
    gridResolution: Number,
    candidateCount: Number
  },
  error: {
    code: String,
    message: String
  }
}, {
  timestamps: true
});

// Index for querying
analysisSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Analysis', analysisSchema, 'CSD_AS1');
