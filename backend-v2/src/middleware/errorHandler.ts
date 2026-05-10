import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation_failed',
      message: 'Request body is invalid',
      details: err.flatten(),
    });
    return;
  }

  logger.error({ err, path: req.path, method: req.method, requestId: req.requestId }, 'unhandled error');
  // Sentry capture — tylko 5xx (4xx są handle'owane wyżej i nie ma sensu zalewać).
  Sentry.captureException(err, {
    tags: { path: req.path, method: req.method, requestId: req.requestId },
  });
  res.status(500).json({ error: 'internal', message: 'Internal server error' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not_found', message: 'Endpoint does not exist' });
}
