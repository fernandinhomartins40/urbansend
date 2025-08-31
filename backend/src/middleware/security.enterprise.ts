import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/environment';
import { logger } from '../config/logger.enterprise';
import rateLimit from 'express-rate-limit';

/**
 * Enterprise Security Middleware Suite
 * 
 * Comprehensive security layer including:
 * - Advanced Helmet.js configuration
 * - Content Security Policy (CSP) management
 * - Request sanitization and validation
 * - Security headers optimization
 * - Attack detection and logging
 * - Environment-specific security policies
 */

/**
 * Advanced Helmet configuration with environment-specific policies
 */
export const createSecurityMiddleware = () => {
  const config = env.config;
  
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        
        scriptSrc: [
          "'self'",
          ...(env.isDevelopment ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
          // Add trusted CDNs for production
          ...(!env.isDevelopment ? [
            "https://cdnjs.cloudflare.com",
            "https://cdn.jsdelivr.net"
          ] : [])
        ],
        
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for many UI frameworks
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com"
        ],
        
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com"
        ],
        
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "blob:",
          // Allow images from trusted sources
          "https://cdn.ultrazend.com.br"
        ],
        
        connectSrc: [
          "'self'",
          // WebSocket connections
          env.isProduction ? "wss://www.ultrazend.com.br" : "ws://localhost:*",
          // API endpoints
          env.isProduction ? "https://api.ultrazend.com.br" : "http://localhost:*",
          // Allow CORS preflight
          "*"
        ],
        
        mediaSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        childSrc: ["'none'"],
        frameSrc: ["'none'"],
        workerSrc: ["'self'", "blob:"],
        manifestSrc: ["'self'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        
        // Upgrade insecure requests in production
        ...(env.isProduction && { upgradeInsecureRequests: [] })
      },
      
      // Report CSP violations
      reportOnly: config.CSP_REPORT_ONLY || false,
      
      // CSP violation reporting endpoint
      ...(env.isProduction && {
        reportUri: '/api/security/csp-report'
      })
    },
    
    // HTTP Strict Transport Security
    hsts: {
      maxAge: config.HSTS_MAX_AGE || 31536000, // 1 year
      includeSubDomains: true,
      preload: env.isProduction // Only preload in production
    },
    
    // Cross-Origin policies
    crossOriginEmbedderPolicy: false, // Disable for compatibility
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { 
      policy: env.isProduction ? "same-site" : "cross-origin" 
    },
    
    // Other security headers
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
  });
};

/**
 * CSP violation reporting endpoint
 */
export const cspViolationReporter = (req: Request, res: Response): void => {
  const violation = req.body;
  
  logger.security('CSP Violation Detected', {
    violation,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Respond with 204 No Content
  res.status(204).end();
};

/**
 * Request sanitization middleware
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = (req as any).correlationId;
  
  // Sanitize query parameters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        // Remove potential XSS vectors
        req.query[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
        
        // Log suspicious patterns
        if (value !== req.query[key]) {
          logger.security('Suspicious query parameter sanitized', {
            correlationId,
            key,
            original: value,
            sanitized: req.query[key],
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
        }
      }
    }
  }
  
  // Sanitize request body (for non-file uploads)
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body, correlationId, req);
  }
  
  next();
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = (obj: any, correlationId: string, req: Request): void => {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const original = value;
      
      // Basic XSS prevention
      obj[key] = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
      
      // Log if changes were made
      if (original !== obj[key]) {
        logger.security('Suspicious request body content sanitized', {
          correlationId,
          field: key,
          original,
          sanitized: obj[key],
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      }
      
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value, correlationId, req);
    }
  }
};

/**
 * Security headers middleware for additional protection
 */
export const additionalSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature policy (deprecated but still supported)
  res.setHeader('Permissions-Policy', [
    'camera=(), microphone=(), geolocation=()',
    'interest-cohort=(), browsing-topics=()'
  ].join(', '));
  
  // Custom security headers
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
};

/**
 * Attack detection middleware
 */
export const attackDetection = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = (req as any).correlationId;
  const suspiciousPatterns = [
    // SQL Injection patterns
    /(\%27)|(\')|(\-\-)|(%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(%23)|(#))/i,
    /w*((\%27)|(\''))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    
    // XSS patterns
    /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,
    /((\%3C)|<)[^\n]+((\%3E)|>)/i,
    
    // Command injection patterns
    /\||\;|\&|\$|\>|\<|`|\(|\)|\{|\}/,
    
    // Path traversal patterns
    /\.\./,
    /(\.\.\/){2,}/,
    
    // LDAP injection patterns
    /(\%28)|(\%29)|\(|\)/
  ];
  
  const userAgent = req.get('User-Agent') || '';
  const url = req.url;
  const body = JSON.stringify(req.body || {});
  
  // Check for suspicious patterns
  const suspiciousContent = [url, body, userAgent].join(' ');
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(suspiciousContent)) {
      logger.security('Potential attack detected', {
        correlationId,
        pattern: pattern.toString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent,
        body: env.isDevelopment ? req.body : '[REDACTED]',
        query: req.query
      });
      
      // In production, consider blocking the request
      if (env.isProduction) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Request blocked by security filter',
          correlationId
        });
        return;
      }
      
      break; // Only log first match to avoid spam
    }
  }
  
  next();
};

/**
 * Rate limiting for security-sensitive endpoints
 */
export const createSecurityRateLimit = (options: {
  windowMs: number;
  max: number;
  message: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: 'Security rate limit exceeded',
      message: options.message
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: any, res: Response) => {
      logger.security('Security rate limit exceeded', {
        correlationId: req.correlationId,
        ip: req.ip,
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent')
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message,
        correlationId: req.correlationId
      });
    }
  });
};

/**
 * IP allowlist/blocklist middleware
 */
export const ipFilter = (req: Request, res: Response, next: NextFunction): void => {
  const clientIp = req.ip;
  const correlationId = (req as any).correlationId;
  
  // Example blocklist (in production, load from database or config)
  const blockedIPs = process.env.BLOCKED_IPS?.split(',') || [];
  
  if (blockedIPs.includes(clientIp)) {
    logger.security('Blocked IP attempted access', {
      correlationId,
      ip: clientIp,
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied',
      correlationId
    });
    return;
  }
  
  next();
};

/**
 * Request size limiting middleware
 */
export const requestSizeLimit = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    const maxBytes = parseSize(maxSize);
    
    if (contentLength > maxBytes) {
      logger.security('Request size limit exceeded', {
        correlationId: (req as any).correlationId,
        contentLength,
        maxSize: maxBytes,
        ip: req.ip,
        method: req.method,
        path: req.path
      });
      
      res.status(413).json({
        error: 'Payload Too Large',
        message: `Request size exceeds limit of ${maxSize}`,
        correlationId: (req as any).correlationId
      });
      return;
    }
    
    next();
  };
};

/**
 * Convert size string to bytes
 */
const parseSize = (size: string): number => {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * (units[unit] || 1));
};

export {
  createSecurityMiddleware as securityMiddleware
};