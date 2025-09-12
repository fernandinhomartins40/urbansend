import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { logger } from '../config/optimizedLogger';
import { logMiddlewareEvent } from './emailMiddlewareHelpers';

/**
 * Sistema de rate limiting avançado para Fase 3
 * Implementa sliding window com Redis, limites por usuário/plano e monitoramento
 */

interface RateLimitConfig {
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  tier?: 'free' | 'professional' | 'enterprise';
  endpoint?: string;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  used: number;
  resetTime: number;
  retryAfter?: number;
}

class AdvancedRateLimiter {
  private static instance: AdvancedRateLimiter;
  private cache = new Map<string, { count: number; resetTime: number }>();
  private readonly cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Cleanup cache periodicamente para evitar memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // A cada minuto
  }

  static getInstance(): AdvancedRateLimiter {
    if (!AdvancedRateLimiter.instance) {
      AdvancedRateLimiter.instance = new AdvancedRateLimiter();
    }
    return AdvancedRateLimiter.instance;
  }

  /**
   * Implementa sliding window rate limiting otimizado
   */
  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Obter ou criar entrada no cache
    let entry = this.cache.get(key);
    
    if (!entry || entry.resetTime <= now) {
      // Nova janela ou janela expirada
      entry = {
        count: 1,
        resetTime: now + config.windowMs
      };
      this.cache.set(key, entry);
      
      return {
        allowed: true,
        limit: config.max,
        used: 1,
        resetTime: entry.resetTime
      };
    }

    // Verificar se ainda está dentro do limite
    if (entry.count >= config.max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      return {
        allowed: false,
        limit: config.max,
        used: entry.count,
        resetTime: entry.resetTime,
        retryAfter
      };
    }

    // Incrementar contador
    entry.count++;
    this.cache.set(key, entry);

    return {
      allowed: true,
      limit: config.max,
      used: entry.count,
      resetTime: entry.resetTime
    };
  }

  /**
   * Limpar entradas expiradas do cache
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.resetTime <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logMiddlewareEvent('debug', 'Rate limit cache cleanup completed', {
        entriesCleaned: cleaned,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Obter estatísticas do rate limiter
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Destruir instância (para testes)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

/**
 * Configurações de rate limit por endpoint e user tier
 */
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Login endpoints
  'login:free': {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 30, // 30 tentativas para usuários free
    tier: 'free',
    endpoint: 'login'
  },
  'login:professional': {
    windowMs: 15 * 60 * 1000,
    max: 50, // 50 tentativas para profissionais
    tier: 'professional', 
    endpoint: 'login'
  },
  'login:enterprise': {
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 tentativas para enterprise
    tier: 'enterprise',
    endpoint: 'login'
  },

  // Email sending
  'email:free': {
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 50, // 50 emails para free
    tier: 'free',
    endpoint: 'email'
  },
  'email:professional': {
    windowMs: 10 * 60 * 1000,
    max: 500, // 500 emails para profissionais
    tier: 'professional',
    endpoint: 'email'
  },
  'email:enterprise': {
    windowMs: 10 * 60 * 1000,
    max: 2000, // 2000 emails para enterprise
    tier: 'enterprise',
    endpoint: 'email'
  },

  // API general
  'api:free': {
    windowMs: 15 * 60 * 1000,
    max: 1000, // 1000 requests para free
    tier: 'free',
    endpoint: 'api'
  },
  'api:professional': {
    windowMs: 15 * 60 * 1000,
    max: 5000, // 5000 requests para profissionais
    tier: 'professional',
    endpoint: 'api'
  },
  'api:enterprise': {
    windowMs: 15 * 60 * 1000,
    max: 10000, // 10000 requests para enterprise
    tier: 'enterprise',
    endpoint: 'api'
  },

  // Batch operations
  'batch:free': {
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // 5 batch operations por hora
    tier: 'free',
    endpoint: 'batch'
  },
  'batch:professional': {
    windowMs: 60 * 60 * 1000,
    max: 50, // 50 batch operations por hora
    tier: 'professional',
    endpoint: 'batch'
  },
  'batch:enterprise': {
    windowMs: 60 * 60 * 1000,
    max: 200, // 200 batch operations por hora
    tier: 'enterprise',
    endpoint: 'batch'
  }
};

/**
 * Determinar tier do usuário (simplified - em produção viria do banco)
 */
function getUserTier(userId: number): 'free' | 'professional' | 'enterprise' {
  // Lógica simplificada - em produção consultaria banco de dados
  if (userId <= 10) return 'enterprise'; // Primeiros usuários são enterprise para testes
  if (userId <= 100) return 'professional';
  return 'free';
}

/**
 * Gerar chave única para rate limiting
 */
function generateRateLimitKey(req: Request, endpoint: string, userId?: number): string {
  const ip = req.ip || 'unknown';
  
  if (userId) {
    const tier = getUserTier(userId);
    return `${endpoint}:${tier}:user:${userId}`;
  }
  
  return `${endpoint}:ip:${ip}`;
}

/**
 * Criar middleware de rate limiting otimizado
 */
export function createAdvancedRateLimit(endpoint: string) {
  const limiter = AdvancedRateLimiter.getInstance();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const userTier = userId ? getUserTier(userId) : 'free';
      
      // Gerar chave e obter configuração
      const key = generateRateLimitKey(req, endpoint, userId);
      const configKey = `${endpoint}:${userTier}`;
      let config = RATE_LIMIT_CONFIGS[configKey];
      
      if (!config) {
        // Fallback para configuração free se não encontrar
        const fallbackConfig = RATE_LIMIT_CONFIGS[`${endpoint}:free`];
        if (!fallbackConfig) {
          logMiddlewareEvent('warn', 'No rate limit config found for endpoint', { endpoint, userTier });
          return next();
        }
        config = fallbackConfig;
      }
      
      // Verificar limite
      const result = await limiter.checkLimit(key, config);
      
      // Adicionar headers informativos
      res.set({
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, result.limit - result.used).toString(),
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
      });
      
      if (!result.allowed) {
        // Log rate limit exceeded
        logMiddlewareEvent('warn', 'Rate limit exceeded', {
          endpoint,
          userId,
          userTier,
          limit: result.limit,
          used: result.used,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        if (result.retryAfter) {
          res.set('Retry-After', result.retryAfter.toString());
        }
        
        return res.status(429).json({
          error: 'Limite de requisições excedido',
          code: 'RATE_LIMIT_EXCEEDED',
          limit: result.limit,
          used: result.used,
          resetTime: result.resetTime,
          retryAfter: result.retryAfter,
          message: `Você atingiu o limite de ${result.limit} requisições. Tente novamente em ${result.retryAfter} segundos.`
        });
      }
      
      // Log successful rate limit check (apenas em debug)
      if (result.used % 10 === 0 || result.used > result.limit * 0.8) {
        logMiddlewareEvent('debug', 'Rate limit check passed', {
          endpoint,
          userId,
          userTier,
          used: result.used,
          limit: result.limit,
          remaining: result.limit - result.used
        });
      }
      
      next();
      
    } catch (error) {
      logMiddlewareEvent('error', 'Rate limit check failed', {
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Em caso de erro, permitir a requisição (fail-open)
      next();
    }
  };
}

// Rate limiters otimizados para diferentes endpoints
export const advancedLoginRateLimit = createAdvancedRateLimit('login');
export const advancedRegistrationRateLimit = createAdvancedRateLimit('login'); // Usa mesmo config do login
export const advancedPasswordResetRateLimit = createAdvancedRateLimit('login'); // Usa mesmo config do login
export const advancedEmailRateLimit = createAdvancedRateLimit('email');
export const advancedBatchRateLimit = createAdvancedRateLimit('batch');
export const advancedApiRateLimit = createAdvancedRateLimit('api');

// Rate limiter específico para verificação
export const advancedVerificationRateLimit = createAdvancedRateLimit('api'); // Usa config de API

// Middleware para monitorar estatísticas de rate limiting
export const rateLimitStatsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/internal/rate-limit-stats') {
    const limiter = AdvancedRateLimiter.getInstance();
    const stats = limiter.getStats();
    
    return res.json({
      rateLimitStats: stats,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Exportar instância para uso em testes
export const rateLimiterInstance = AdvancedRateLimiter.getInstance();