import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';

const allowedOrigin = new URL(config.APP_ORIGIN).origin;

export function requireSameOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (!origin || origin !== allowedOrigin) {
    return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.'));
  }
  next();
}

export function errorHandler(error, _req, res, _next) {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large.' } });
  }

  if (error?.name === 'MulterError') {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        message: tooLarge ? 'Receipt image must be 5 MB or smaller.' : 'Receipt upload could not be processed.'
      }
    });
  }

  if (error?.name === 'ZodError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? 'Invalid input.' } });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }

  console.error('Unhandled request error:', error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
}
