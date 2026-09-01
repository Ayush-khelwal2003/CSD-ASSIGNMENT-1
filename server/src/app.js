const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const analysisRoutes = require('./routes/analysisRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet());

// CORS - allow CLIENT_URL or all origins for public API access
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
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
