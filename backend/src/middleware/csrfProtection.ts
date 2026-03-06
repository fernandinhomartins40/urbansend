import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXCLUDED_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/super-admin/forgot-password',
  '/api/auth/super-admin/reset-password',
  '/api/auth/refresh',
  '/api/health',
  '/api/application-logs/frontend-error'
];

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const csrfProtectionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const requestPath = req.originalUrl || req.url || '';
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => requestPath.startsWith(prefix))) {
    return next();
  }

  const hasApiKey = Boolean(req.headers['x-api-key']);
  const hasBearerToken = String(req.headers.authorization || '').startsWith('Bearer ');
  if (hasApiKey || hasBearerToken) {
    return next();
  }

  const hasCookieSession = Boolean(req.cookies?.access_token);
  if (!hasCookieSession) {
    return next();
  }

  const csrfCookie = String(req.cookies?.csrf_token || '');
  const csrfHeader = String(req.headers['x-csrf-token'] || '');

  if (!csrfCookie || !csrfHeader || !timingSafeEqual(csrfCookie, csrfHeader)) {
    logger.warn('CSRF validation failed', {
      path: requestPath,
      method: req.method,
      ip: req.ip
    });

    return res.status(403).json({
      error: 'Forbidden',
      message: 'CSRF token validation failed'
    });
  }

  next();
};
