import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ZodError } from 'zod';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Standard error response shape */
function errorResponse(res: Response, req: Request, status: number, error: string, details?: unknown) {
  const body: Record<string, unknown> = {
    error,
    status,
    requestId: (req as any).requestId ?? undefined,
  };
  if (details) body.details = details;
  res.status(status).json(body);
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Tenant isolation errors — always 403, no details leaked
  if (err.name === 'TenantIsolationError') {
    errorResponse(res, req, 403, 'Access denied');
    return;
  }

  // Operational errors (thrown intentionally)
  if (err instanceof AppError) {
    errorResponse(res, req, err.statusCode, err.message);
    return;
  }

  // Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as Error & { code?: string; meta?: { field_name?: string; target?: string[] } };
    if (prismaError.code === 'P2002') {
      const field = prismaError.meta?.target?.[0] || 'field';
      errorResponse(res, req, 409, `A record with this ${field} already exists`);
      return;
    }
    if (prismaError.code === 'P2025') {
      errorResponse(res, req, 404, 'Record not found');
      return;
    }
    if (prismaError.code === 'P2003') {
      errorResponse(res, req, 400, 'Related record not found');
      return;
    }
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const issues = err.issues.map(i => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    errorResponse(res, req, 400, 'Validation failed', issues);
    return;
  }

  // Unhandled errors
  console.error('Unhandled error:', err);

  const message = config.nodeEnv === 'production' ? 'Internal server error' : err.message;
  const body: Record<string, unknown> = {
    error: message,
    status: 500,
    requestId: (req as any).requestId ?? undefined,
  };
  if (config.nodeEnv !== 'production') body.stack = err.stack;

  res.status(500).json(body);
}
