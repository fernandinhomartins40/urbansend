import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContextService } from '../services/RequestContextService';

/**
 * Enterprise Correlation ID Middleware
 * 
 * Provides request tracing capabilities by:
 * - Extracting existing correlation IDs from headers
 * - Generating new UUIDs when not present
 * - Adding correlation ID to all log contexts
 * - Including correlation ID in response headers
 * - Supporting request chaining across services
 */

export interface CorrelatedRequest extends Request {
  correlationId: string;
  requestId: string;
}

export const correlationIdMiddleware = (
  req: CorrelatedRequest, 
  res: Response, 
  next: NextFunction
): void => {
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-trace-id'] as string) ||
    uuidv4();
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    requestId;

  req.requestId = requestId;
  req.correlationId = correlationId;

  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', correlationId);

  const originalJson = res.json;
  res.json = function(body) {
    if (body && typeof body === 'object' && body.error) {
      body.correlationId = correlationId;
      body.requestId = requestId;
    }
    return originalJson.call(this, body);
  };

  requestContextService.run({
    requestId,
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }, () => next());
};

/**
 * Enhanced logging context extractor for correlation ID
 * Use this in your logger to automatically include correlation ID
 */
export const getLoggingContext = (req: CorrelatedRequest) => ({
  requestId: req.requestId,
  correlationId: req.correlationId,
  method: req.method,
  path: req.path,
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  timestamp: new Date().toISOString()
});

/**
 * Extract correlation ID from request for use in async operations
 */
export const extractCorrelationId = (req: CorrelatedRequest): string => {
  return req.correlationId;
};
