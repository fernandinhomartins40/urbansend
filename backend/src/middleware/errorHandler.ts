import { Request, Response, NextFunction } from 'express';
import { logger, Logger } from '../config/logger';
import { ZodError } from 'zod';
import { Env } from '../utils/env';
import { applicationErrorLogService } from '../services/ApplicationErrorLogService';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const createError = (message: string, statusCode: number = 500): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

export const errorHandler = (
  err: AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof ZodError
    ? 400
    : err.statusCode || 500;
  const normalizedError = err instanceof Error
    ? err
    : new Error('Unknown application error');

  Logger.error('Request processing failed', normalizedError, {
    requestId: req.requestId,
    userId: req.user?.id ? String(req.user.id) : undefined,
    context: {
      statusCode,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }
  });
  void applicationErrorLogService.captureBackendError({
    error: normalizedError,
    req,
    statusCode,
    context: err instanceof ZodError
      ? {
          validationErrors: err.errors.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code
          }))
        }
      : undefined
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid input data',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code
      }))
    });
  }

  // Handle operational errors
  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({
      error: 'Error',
      message: err.message
    });
  }

  // Handle programming errors
  if (Env.isDevelopment) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      stack: err.stack
    });
  }

  // Production error response
  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong. Please try again later.'
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
