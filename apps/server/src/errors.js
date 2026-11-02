// One error-to-JSON handler for the whole API, so every route answers with {error: "plain message"}.
import { logEvent } from './log.js';

/** Express error middleware (4 arguments). Never echoes internals or keys for 5xx. */
export function errorHandler(err, _req, res, _next) {
  let status = err.status ?? err.statusCode ?? 500;
  let message = err.message;
  // body-parser errors: say it in plain words instead of echoing parser internals.
  if (err.type === 'entity.parse.failed') message = 'The request body is not valid JSON.';
  else if (err.type === 'entity.too.large') { status = 413; message = 'That request is too large.'; }
  if (status >= 500) { console.error(err); logEvent('server.error', { message: err.message }); }
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Please try again.' : message });
}
