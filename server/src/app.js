const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const analysisRoutes = require('./routes/analysisRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', analysisRoutes);

// Global error handler
app.use(errorHandler);

module.exports = app;
