/**
 * Global error handler middleware.
 * Returns consistent JSON error format.
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds the 50MB limit'
      }
    });
  }

  if (err.message && err.message.startsWith('INVALID_FILE_TYPE')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: 'Only KML and KMZ files are allowed'
      }
    });
  }

  // Multer unexpected field
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNEXPECTED_FIELD',
        message: 'Unexpected file field. Use "file" as the field name.'
      }
    });
  }

  // Custom application errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'APPLICATION_ERROR',
        message: err.message
      }
    });
  }

  // Default server error
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message
    }
  });
}

module.exports = errorHandler;
