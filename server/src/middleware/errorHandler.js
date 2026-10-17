/**
 * Centralized Express Error Handler
 */
export function errorHandler(err, req, res, next) {
  // If response has already started streaming, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  // PostgreSQL Error Codes mapping
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        return res.status(409).json({
          error: 'A record with this unique identifier already exists.',
          detail: err.detail || 'Unique constraint violation'
        });
      case '23503': // foreign_key_violation
        return res.status(400).json({
          error: 'Invalid reference: The associated record does not exist or is referenced elsewhere.',
          detail: err.detail || 'Foreign key constraint violation'
        });
      case '23514': // check_violation
        return res.status(400).json({
          error: 'Data validation failed: Check constraint violated.',
          detail: err.detail || err.message
        });
      case '22P02': // invalid_text_representation
        return res.status(400).json({
          error: 'Invalid input format (e.g. invalid number or UUID).',
          detail: err.message
        });
      case '40P01': // deadlock_detected
        return res.status(409).json({
          error: 'Transaction conflict. Please retry the operation.'
        });
    }
  }

  let statusCode = err.statusCode || err.status;
  if (!statusCode) {
    if (err.message && (
      err.message.includes('Insufficient') ||
      err.message.includes('exceeds') ||
      err.message.includes('required') ||
      err.message.includes('Cannot') ||
      err.message.includes('Invalid')
    )) {
      statusCode = 400;
    } else if (err.message && err.message.includes('not found')) {
      statusCode = 404;
    } else {
      statusCode = 500;
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: err.message || 'An unexpected internal server error occurred.',
    ...(isProduction ? {} : { stack: err.stack })
  });
}
