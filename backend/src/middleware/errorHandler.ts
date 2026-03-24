import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

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

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as Error & { code?: string; meta?: { field_name?: string; target?: string[] } };
    if (prismaError.code === 'P2002') {
      const field = prismaError.meta?.target?.[0] || 'field';
      res.status(409).json({ error: `A record with this ${field} already exists` });
      return;
    }
    if (prismaError.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if (prismaError.code === 'P2003') {
      res.status(400).json({ error: 'Related record not found' });
      return;
    }
  }

  // Validation errors
  if (err.name === 'ZodError') {
    res.status(422).json({
      error: 'Validation failed',
      details: err.message,
    });
    return;
  }

  console.error('Unhandled error:', err);

  const message = config.nodeEnv === 'production' ? 'Internal server error' : err.message;

  res.status(500).json({
    error: message,
    ...(config.nodeEnv !== 'production' && { stack: err.stack }),
  });
}
