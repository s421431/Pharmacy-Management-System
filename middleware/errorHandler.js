// Centralized error handler — must be registered LAST in server.js (after all routes).
// Any next(err) call in a route lands here.
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err.message, err.stack);

  const status = err.status || 500;
  const isApiRequest = req.originalUrl.startsWith('/api') || req.get('Content-Type') === 'application/json';

  const userMessage = status === 500
    ? 'Something went wrong on our end. Please try again.'
    : err.message;

  if (isApiRequest) {
    return res.status(status).json({ error: userMessage });
  }

  res.status(status).render('error', { message: userMessage, status });
}

module.exports = errorHandler;