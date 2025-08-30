import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { logger } from '../config/logger';
import { Env } from '../utils/env';

/**
 * Rate limiting configuration for different endpoints
 */

// General rate limiting for login attempts
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 attempts per IP per window
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request) => {
    logger.warn('Login rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
  },
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Rate limiting for email sending API
export const emailSendRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Env.isProduction ? 100 : 1000, // 100 emails per minute in production
  message: {
    error: 'Limite de envio de emails excedido. Tente novamente em alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by API key or user ID if available
    const apiKey = req.headers['x-api-key'];
    const userId = (req as AuthenticatedRequest).user?.id;
    return apiKey ? `api:${apiKey}` : userId ? `user:${userId}` : req.ip;
  },
  handler: (req: Request) => {
    logger.warn('Email send rate limit exceeded', {
      ip: req.ip,
      apiKey: req.headers['x-api-key'] ? 'present' : 'absent',
      userId: (req as AuthenticatedRequest).user?.id,
      endpoint: req.path
    });
  },
});

// Stricter rate limiting for API key creation/regeneration
export const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Maximum 10 API key operations per hour
  message: {
    error: 'Limite de operações de chaves API excedido. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by user ID
    return (req as AuthenticatedRequest).user?.id ? `user:${(req as AuthenticatedRequest).user.id}` : req.ip;
  },
  handler: (req: Request) => {
    logger.warn('API key operation rate limit exceeded', {
      ip: req.ip,
      userId: (req as AuthenticatedRequest).user?.id,
      endpoint: req.path,
      method: req.method
    });
  },
});

// Rate limiting for user registration
export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Maximum 3 registrations per IP per hour
  message: {
    error: 'Limite de registros excedido. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request) => {
    logger.warn('Registration rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
  },
});

// Rate limiting for password reset requests
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Maximum 3 password reset requests per IP per window
  message: {
    error: 'Limite de solicitações de redefinição de senha excedido. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request) => {
    logger.warn('Password reset rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      endpoint: req.path
    });
  },
});

// Rate limiting for webhook calls
export const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // Very high limit for webhooks as they are automated
  message: {
    error: 'Webhook rate limit exceeded.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by webhook source if identifiable
    const webhookId = req.headers['webhook-id'] || req.query.webhook_id;
    return webhookId ? `webhook:${webhookId}` : req.ip;
  },
  skip: (req: Request) => {
    // Skip rate limiting for internal webhook calls in development
    return Env.isDevelopment && req.ip === '127.0.0.1';
  },
});

// Rate limiting for general API calls
export const generalApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Env.isProduction ? 1000 : 10000, // 1000 requests per 15 minutes in production
  message: {
    error: 'Limite de requisições da API excedido. Tente novamente em alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by API key, user ID, or IP
    const apiKey = req.headers['x-api-key'];
    const userId = (req as AuthenticatedRequest).user?.id;
    if (apiKey) return `api:${apiKey}`;
    if (userId) return `user:${userId}`;
    return req.ip;
  },
});

// Strict rate limiting for sensitive operations (domain verification, etc.)
export const sensitiveOperationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Maximum 5 sensitive operations per hour
  message: {
    error: 'Limite de operações sensíveis excedido. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return (req as AuthenticatedRequest).user?.id ? `user:${(req as AuthenticatedRequest).user.id}` : req.ip;
  },
  handler: (req: Request) => {
    logger.warn('Sensitive operation rate limit exceeded', {
      ip: req.ip,
      userId: (req as AuthenticatedRequest).user?.id,
      endpoint: req.path,
      method: req.method
    });
  },
});

/**
 * Custom rate limiter factory for specific use cases
 */
export const createCustomRateLimit = (options: {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    handler: options.onLimitReached,
  });
};