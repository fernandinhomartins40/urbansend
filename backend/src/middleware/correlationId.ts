import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

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
}

export const correlationIdMiddleware = (
  req: CorrelatedRequest, 
  res: Response, 
  next: NextFunction
): void => {
  // Extract correlation ID from various possible headers
  const existingId = 
    req.headers['x-correlation-id'] as string ||
    req.headers['x-request-id'] as string ||
    req.headers['x-trace-id'] as string;
  
  // Generate new UUID if no existing correlation ID found
  const correlationId = existingId || uuidv4();
  
  // Add correlation ID to request object for use in controllers/services
  req.correlationId = correlationId;
  
  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Add correlation ID to all subsequent logs in this request context
  // This creates a closure that maintains the correlation ID
  const originalJson = res.json;
  res.json = function(body) {
    // Ensure correlation ID is included in error responses
    if (body && typeof body === 'object' && body.error) {
      body.correlationId = correlationId;
    }
    return originalJson.call(this, body);
  };
  
  next();
};

/**
 * Enhanced logging context extractor for correlation ID
 * Use this in your logger to automatically include correlation ID
 */
export const getLoggingContext = (req: CorrelatedRequest) => ({
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