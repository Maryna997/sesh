// Last-resort error handler. Express 5 sends errors thrown in route handlers
// (including async ones) here.
//
// Clients only ever get a short, generic message: never stack traces, SQL,
// connection details or request data.
//
// Express recognises an error handler by its four parameters, so `next`
// must stay in the signature even though it isn't used.
export function errorHandler(error, req, res, next) {
  // Body that isn't valid JSON, e.g. {"email": }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'error', message: 'Request body must be valid JSON.' });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', message: 'Request body is too large.' });
  }

  // Log only the error type and message for debugging: never the request
  // body (it may contain a password) or the SQL parameters.
  if (process.env.NODE_ENV !== 'test') {
    console.error(`Unexpected error: ${error.name}: ${error.message}`);
  }

  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong. Please try again later.',
  });
}
