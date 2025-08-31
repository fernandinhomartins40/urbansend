import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { env } from '../config/environment';
import { CorrelatedRequest } from './correlationId';

/**
 * Enterprise Error Handling System
 * 
 * Features:
 * - Structured error logging with correlation IDs
 * - Environment-aware error responses (detailed in dev, generic in prod)
 * - Support for multiple error types (Validation, Authentication, Business Logic)
 * - Performance monitoring integration
 * - Security-conscious error responses
 * - Standardized error format across the application
 */

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  API_KEY_INVALID = 'API_KEY_INVALID',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Business Logic
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  
  // External Services
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EMAIL_SERVICE_ERROR = 'EMAIL_SERVICE_ERROR',
  
  // System
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Feature Specific
  EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  FEATURE_NOT_AVAILABLE = 'FEATURE_NOT_AVAILABLE'
}

export interface ErrorDetails {
  field?: string;
  value?: any;
  constraint?: string;
  context?: Record<string, any>;
}

export class EnterpriseError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails[];
  public readonly correlationId?: string;
  public readonly timestamp: string;
  
  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: ErrorDetails[],
    correlationId?: string
  ) {
    super(message);
    
    this.name = 'EnterpriseError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.correlationId = correlationId;
    this.timestamp = new Date().toISOString();
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
  
  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        correlationId: this.correlationId,
        timestamp: this.timestamp
      }
    };
  }
  
  /**
   * Create safe response object (strips sensitive data in production)
   */
  toSafeJSON() {
    const baseResponse = {
      error: {
        code: this.code,
        message: this.message,
        correlationId: this.correlationId,
        timestamp: this.timestamp
      }
    };
    
    // Include details only in development
    if (env.isDevelopment && this.details) {
      (baseResponse.error as any).details = this.details;
    }
    
    return baseResponse;
  }
}

/**
 * Factory functions for common error types
 */
export const createError = {
  unauthorized: (message = 'Authentication required', correlationId?: string) =>
    new EnterpriseError(message, ErrorCode.UNAUTHORIZED, 401, true, undefined, correlationId),
    
  forbidden: (message = 'Access forbidden', correlationId?: string) =>
    new EnterpriseError(message, ErrorCode.FORBIDDEN, 403, true, undefined, correlationId),
    
  notFound: (resource = 'Resource', correlationId?: string) =>
    new EnterpriseError(`${resource} not found`, ErrorCode.RESOURCE_NOT_FOUND, 404, true, undefined, correlationId),
    
  validation: (message: string, details?: ErrorDetails[], correlationId?: string) =>
    new EnterpriseError(message, ErrorCode.VALIDATION_ERROR, 400, true, details, correlationId),
    
  conflict: (message = 'Resource already exists', correlationId?: string) =>
    new EnterpriseError(message, ErrorCode.RESOURCE_ALREADY_EXISTS, 409, true, undefined, correlationId),
    
  businessRule: (message: string, correlationId?: string) =>
    new EnterpriseError(message, ErrorCode.BUSINESS_RULE_VIOLATION, 400, true, undefined, correlationId),
    
  internal: (message = 'Internal server error', correlationId?: string, isOperational = false) =>
    new EnterpriseError(message, ErrorCode.INTERNAL_SERVER_ERROR, 500, isOperational, undefined, correlationId),
    
  serviceUnavailable: (service = 'Service', correlationId?: string) =>
    new EnterpriseError(`${service} temporarily unavailable`, ErrorCode.SERVICE_UNAVAILABLE, 503, true, undefined, correlationId),
    
  rateLimitExceeded: (retryAfter?: number, correlationId?: string) =>
    new EnterpriseError(
      `Rate limit exceeded${retryAfter ? `. Retry after ${retryAfter} seconds` : ''}`, 
      ErrorCode.RATE_LIMIT_EXCEEDED, 
      429, 
      true, 
      retryAfter ? [{ context: { retryAfter } }] : undefined,
      correlationId
    )
};

/**
 * Parse and convert Zod validation errors
 */
const parseZodError = (error: ZodError, correlationId?: string): EnterpriseError => {
  const details: ErrorDetails[] = error.issues.map(issue => ({
    field: issue.path.join('.'),
    value: (issue as any).input,
    constraint: issue.message,
    context: {
      code: issue.code,
      expected: (issue as any).expected || undefined,
      received: (issue as any).received || undefined
    }
  }));
  
  return new EnterpriseError(
    'Validation failed',
    ErrorCode.VALIDATION_ERROR,
    400,
    true,
    details,
    correlationId
  );
};

/**
 * Parse database errors (Knex/SQLite specific)
 */
const parseDatabaseError = (error: any, correlationId?: string): EnterpriseError => {
  // SQLite unique constraint violation
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.errno === 19) {
    return new EnterpriseError(
      'Resource already exists',
      ErrorCode.RESOURCE_ALREADY_EXISTS,
      409,
      true,
      [{ constraint: 'unique', context: { sqliteError: error.code } }],
      correlationId
    );
  }
  
  // SQLite foreign key constraint violation
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new EnterpriseError(
      'Referenced resource does not exist',
      ErrorCode.BUSINESS_RULE_VIOLATION,
      400,
      true,
      [{ constraint: 'foreign_key', context: { sqliteError: error.code } }],
      correlationId
    );
  }
  
  // Other database errors
  if (error.code && error.code.startsWith('SQLITE_')) {
    return new EnterpriseError(
      'Database operation failed',
      ErrorCode.DATABASE_ERROR,
      500,
      true,
      [{ context: { sqliteError: error.code, message: error.message } }],
      correlationId
    );
  }
  
  // Generic database error
  return new EnterpriseError(
    'Database error occurred',
    ErrorCode.DATABASE_ERROR,
    500,
    true,
    undefined,
    correlationId
  );
};

/**
 * Main error handling middleware
 */
export const errorHandler = (
  err: Error,
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = req.correlationId || 'unknown';
  
  // If response already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }
  
  let enterpriseError: EnterpriseError;
  
  // Convert known error types to EnterpriseError
  if (err instanceof EnterpriseError) {
    enterpriseError = err;
    if (!enterpriseError.correlationId) {
      enterpriseError = new EnterpriseError(
        enterpriseError.message,
        enterpriseError.code,
        enterpriseError.statusCode,
        enterpriseError.isOperational,
        enterpriseError.details,
        correlationId
      );
    }
  } else if (err instanceof ZodError) {
    enterpriseError = parseZodError(err, correlationId);
  } else if (err.name === 'ValidationError' && (err as any).issues) {
    // Handle Zod-like validation errors
    enterpriseError = parseZodError(err as ZodError, correlationId);
  } else if (err.name === 'JsonWebTokenError') {
    enterpriseError = createError.unauthorized('Invalid token', correlationId);
  } else if (err.name === 'TokenExpiredError') {
    enterpriseError = new EnterpriseError(
      'Token expired',
      ErrorCode.TOKEN_EXPIRED,
      401,
      true,
      undefined,
      correlationId
    );
  } else if (err.name === 'DatabaseError' || (err as any).code?.startsWith?.('SQLITE_')) {
    enterpriseError = parseDatabaseError(err, correlationId);
  } else {
    // Unknown error - treat as internal server error
    enterpriseError = createError.internal(
      env.isDevelopment ? err.message : 'An unexpected error occurred',
      correlationId,
      false // Not operational - indicates a bug
    );
  }
  
  // Log error with appropriate level
  const logLevel = enterpriseError.statusCode >= 500 ? 'error' : 'warn';
  const logData = {
    correlationId,
    error: {
      name: err.name,
      message: err.message,
      code: enterpriseError.code,
      statusCode: enterpriseError.statusCode,
      isOperational: enterpriseError.isOperational,
      stack: env.isDevelopment ? err.stack : undefined
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id
    },
    timestamp: enterpriseError.timestamp
  };
  
  if (logLevel === 'error') {
    logger.error('Unhandled error occurred', logData);
  } else {
    logger.warn('Request error occurred', logData);
  }
  
  // Send appropriate response
  res.status(enterpriseError.statusCode).json(
    env.isDevelopment ? enterpriseError.toJSON() : enterpriseError.toSafeJSON()
  );
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = req.correlationId || 'unknown';
  
  logger.warn('Route not found', {
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  const error = createError.notFound(
    `Route ${req.method} ${req.path} not found`,
    correlationId
  );
  
  res.status(404).json(error.toSafeJSON());
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: CorrelatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global uncaught exception handler
 */
export const setupGlobalErrorHandlers = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception - shutting down gracefully', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    });
    
    // Graceful shutdown
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
      timestamp: new Date().toISOString()
    });
    
    // Don't exit for unhandled rejections - log and continue
  });
  
  // Handle SIGTERM and SIGINT for graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal} - starting graceful shutdown`, {
      timestamp: new Date().toISOString()
    });
    
    // Allow ongoing requests to complete
    setTimeout(() => {
      process.exit(0);
    }, 10000); // 10 seconds to clean up
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

// Backward compatibility exports
export { EnterpriseError as CustomError };