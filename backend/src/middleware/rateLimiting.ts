import rateLimit from 'express-rate-limit';

/**
 * Simplified Rate limiting configuration without custom keyGenerator
 * This avoids X-Forwarded-For header issues while still providing protection
 */

// Simple rate limiting factory function
const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    // No custom keyGenerator - use default IP-based limiting
  });
};

// Login rate limiting - 15 attempts per 15 minutes
export const loginRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  15, // max attempts
  'Muitas tentativas de login. Tente novamente em 15 minutos.'
);

// Registration rate limiting - 5 attempts per hour
export const registrationRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  5, // max attempts
  'Muitas tentativas de registro. Tente novamente em 1 hora.'
);

// Password reset rate limiting - 3 attempts per hour
export const passwordResetRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  3, // max attempts
  'Muitas tentativas de reset de senha. Tente novamente em 1 hora.'
);

// General API rate limiting - 100 requests per 15 minutes
export const apiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // max requests
  'Muitas requisições à API. Tente novamente em 15 minutos.'
);

// Email sending rate limiting - 10 emails per 10 minutes
export const emailSendRateLimit = createRateLimit(
  10 * 60 * 1000, // 10 minutes
  10, // max emails
  'Muitos emails enviados. Tente novamente em 10 minutos.'
);

// API key rate limiting - same as general API
export const apiKeyRateLimit = apiRateLimit;