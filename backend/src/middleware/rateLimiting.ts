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

// Login rate limiting - 50 attempts per 15 minutes (flexibilizado para testes)
export const loginRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // max attempts (aumentado de 15 para 50)
  'Muitas tentativas de login. Tente novamente em 15 minutos.'
);

// Registration rate limiting - 25 attempts per hour (flexibilizado para testes)
export const registrationRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  25, // max attempts (aumentado de 10 para 25)
  'Muitas tentativas de registro. Tente novamente em 1 hora.'
);

// Password reset rate limiting - 15 attempts per hour (flexibilizado para testes)
export const passwordResetRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  15, // max attempts (aumentado de 3 para 15)
  'Muitas tentativas de reset de senha. Tente novamente em 1 hora.'
);

// General API rate limiting - 500 requests per 15 minutes (flexibilizado para testes)
export const apiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  500, // max requests (aumentado de 100 para 500)
  'Muitas requisições à API. Tente novamente em 15 minutos.'
);

// Email sending rate limiting - 100 emails per 10 minutes (flexibilizado para testes)
export const emailSendRateLimit = createRateLimit(
  10 * 60 * 1000, // 10 minutes
  100, // max emails (aumentado de 10 para 100)
  'Muitos emails enviados. Tente novamente em 10 minutos.'
);

// Verification resend rate limiting - 20 attempts per 10 minutes (flexibilizado para testes)
export const verificationResendRateLimit = createRateLimit(
  10 * 60 * 1000, // 10 minutes
  20, // max attempts (aumentado de 3 para 20)
  'Muitas tentativas de reenvio. Tente novamente em 10 minutos.'
);

// API key rate limiting - same as general API
export const apiKeyRateLimit = apiRateLimit;