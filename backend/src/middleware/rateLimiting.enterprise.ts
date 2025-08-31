import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../config/logger.enterprise';
import { env } from '../config/environment';
import { CorrelatedRequest } from './correlationId';

/**
 * Enterprise-Grade Rate Limiting System
 * 
 * Features:
 * - Environment-aware configuration
 * - Intelligent IP detection with proxy support
 * - Structured logging with correlation IDs
 * - Route-specific rate limiting
 * - Graceful degradation
 * - Security monitoring integration
 */

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: any;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  trustProxy?: boolean;
  skip?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
  handler?: (req: Request, res: Response) => void;
}

/**
 * Create enterprise rate limiter with intelligent configuration
 */
const createEnterpriseRateLimit = (config: Partial<RateLimitConfig> = {}) => {
  const envConfig = env.getRateLimitConfig();
  
  const finalConfig: RateLimitConfig = {
    ...envConfig,
    ...config,
    
    // Custom key generator that handles proxy scenarios
    keyGenerator: (req: Request): string => {
      // In development, use a fixed key to avoid rate limiting during testing
      if (env.isDevelopment && !config.keyGenerator) {
        return 'dev-mode-key';
      }
      
      // Custom key generator provided
      if (config.keyGenerator) {
        return config.keyGenerator(req);
      }
      
      // Production IP extraction with proxy support
      const forwarded = req.headers['x-forwarded-for'];
      const realIp = req.headers['x-real-ip'];
      const connectionRemoteAddress = req.connection?.remoteAddress;
      const socketRemoteAddress = req.socket?.remoteAddress;
      
      let clientIp = req.ip;
      
      // Handle proxy scenarios with proper precedence
      if (forwarded && typeof forwarded === 'string') {
        // X-Forwarded-For can contain multiple IPs, get the first (client)
        clientIp = forwarded.split(',')[0].trim();
      } else if (realIp && typeof realIp === 'string') {
        clientIp = realIp;
      } else if (connectionRemoteAddress) {
        clientIp = connectionRemoteAddress;
      } else if (socketRemoteAddress) {
        clientIp = socketRemoteAddress;
      }
      
      // Fallback for edge cases
      if (!clientIp || clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = 'localhost';
      }
      
      return clientIp;
    },
    
    // Enhanced rate limit reached handler
    onLimitReached: (req: CorrelatedRequest, res: Response) => {
      const correlationId = req.correlationId || 'unknown';
      const clientIp = finalConfig.keyGenerator!(req);
      
      // Security logging
      logger.warn('Rate limit exceeded', {
        correlationId,
        clientIp,
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        windowMs: finalConfig.windowMs,
        maxRequests: finalConfig.max
      });
      
      // Call custom handler if provided
      if (config.onLimitReached) {
        config.onLimitReached(req, res);
      }
    },
    
    // Enhanced error handler
    handler: (req: CorrelatedRequest, res: Response) => {
      const correlationId = req.correlationId || 'unknown';
      const retryAfter = Math.ceil(finalConfig.windowMs! / 1000);
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: finalConfig.message?.error || 'Too many requests from this IP, please try again later.',
        retryAfter,
        correlationId,
        timestamp: new Date().toISOString()
      });
      return;
    }
  };
  
  return rateLimit(finalConfig);
};

/**
 * General API rate limiting - applies to all routes
 */
export const generalRateLimit = createEnterpriseRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.isDevelopment ? 1000 : 100, // More permissive in development
  message: {
    error: 'Too many requests from this IP, please try again later.',
  }
});

/**
 * Authentication endpoints rate limiting - more restrictive
 */
export const authRateLimit = createEnterpriseRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.isDevelopment ? 100 : 15, // Strict for auth endpoints
  message: {
    error: 'Too many authentication attempts. Please try again later.',
  },
  keyGenerator: (req: Request) => {
    // Rate limit by IP for auth attempts
    const ip = req.ip || 'unknown';
    return `auth:${ip}`;
  }
});

/**
 * Registration rate limiting - prevent spam registrations
 */
export const registrationRateLimit = createEnterpriseRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: env.isDevelopment ? 50 : 5, // Strict registration limits
  message: {
    error: 'Too many registration attempts. Please try again in an hour.',
  },
  keyGenerator: (req: Request) => {
    const ip = req.ip || 'unknown';
    return `registration:${ip}`;
  }
});

/**
 * Password reset rate limiting - prevent abuse
 */
export const passwordResetRateLimit = createEnterpriseRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: env.isDevelopment ? 20 : 3, // Very strict for password reset
  message: {
    error: 'Too many password reset attempts. Please try again in an hour.',
  },
  keyGenerator: (req: Request) => {
    const ip = req.ip || 'unknown';
    return `password-reset:${ip}`;
  }
});

/**
 * Email verification resend rate limiting - prevent spam
 */
export const verificationResendRateLimit = createEnterpriseRateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: env.isDevelopment ? 20 : 3, // Reasonable for verification
  message: {
    error: 'Too many verification email requests. Please try again in 10 minutes.',
  },
  keyGenerator: (req: Request) => {
    const ip = req.ip || 'unknown';
    return `verification-resend:${ip}`;
  }
});

/**
 * Email sending rate limiting - prevent abuse of email API
 */
export const emailSendRateLimit = createEnterpriseRateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: env.isDevelopment ? 100 : 10, // Limit email sending
  message: {
    error: 'Too many emails sent. Please try again in 10 minutes.',
  },
  keyGenerator: (req: Request) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    const userId = (req as any).user?.id;
    const ip = req.ip || 'unknown';
    return userId ? `email-send:user:${userId}` : `email-send:ip:${ip}`;
  }
});

/**
 * API key rate limiting - for API users
 */
export const apiKeyRateLimit = createEnterpriseRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.isDevelopment ? 1000 : 1000, // Higher limit for API users
  message: {
    error: 'API rate limit exceeded. Please try again later.',
  },
  keyGenerator: (req: Request) => {
    // Rate limit by API key if present
    const apiKey = req.headers['x-api-key'] as string;
    const ip = req.ip || 'unknown';
    return apiKey ? `api-key:${apiKey.substring(0, 8)}` : `api-ip:${ip}`;
  }
});

/**
 * Create custom rate limiter for specific use cases
 */
export const createCustomRateLimit = (options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix?: string;
  skipInDevelopment?: boolean;
}) => {
  return createEnterpriseRateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    skip: options.skipInDevelopment && env.isDevelopment ? () => true : undefined,
    keyGenerator: options.keyPrefix ? (req: Request) => {
      const ip = req.ip || 'unknown';
      return `${options.keyPrefix}:${ip}`;
    } : undefined
  });
};

// Legacy exports for backward compatibility
export const loginRateLimit = authRateLimit;