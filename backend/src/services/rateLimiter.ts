import { logger } from '../config/logger';
import db from '../config/database';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  resetTime?: Date;
  retryAfter?: number;
}

export interface RateLimitConfig {
  max: number;
  windowMs: number;
  keyGenerator: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface ConnectionLimitConfig {
  maxConnections: number;
  windowMs: number;
  maxAuthAttempts: number;
  authWindowMs: number;
}

export class RateLimiter {
  private connectionCounts: Map<string, number> = new Map();
  private authAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private userLimits: Map<string, { count: number; resetTime: Date }> = new Map();
  
  // Configurações padrão (flexibilizadas para testes em VPS)
  private defaultConfig: ConnectionLimitConfig = {
    maxConnections: 1000, // aumentado de 100 para 1000
    windowMs: 3600000, // 1 hora
    maxAuthAttempts: 50, // aumentado de 10 para 50
    authWindowMs: 900000 // 15 minutos
  };

  constructor(config?: Partial<ConnectionLimitConfig>) {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    this.startCleanupTimer();
    this.validateRequiredTables();
  }

  private async validateRequiredTables() {
    try {
      const requiredTables = [
        'rate_limit_logs',
        'rate_limit_configs'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await db.schema.hasTable(tableName);
        if (!hasTable) {
          throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);
        }
      }

      logger.info('RateLimiter: Todas as tabelas obrigatórias validadas com sucesso');
    } catch (error) {
      logger.error('Erro ao validar tabelas do RateLimiter:', error);
      throw error;
    }
  }

  public async checkConnection(remoteAddress: string): Promise<RateLimitResult> {
    try {
      const key = `conn:${remoteAddress}`;
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.defaultConfig.windowMs);

      // Buscar configuração personalizada para este IP
      const customConfig = await this.getCustomConfig(remoteAddress, 'ip');
      const maxConnections = customConfig?.max_connections || this.defaultConfig.maxConnections;

      // Verificar contagem atual na janela de tempo
      const currentCount = await this.getCurrentCount(key, 'connection', windowStart);
      
      if (currentCount >= maxConnections) {
        await this.logRateLimit(key, 'connection', remoteAddress, currentCount);
        
        const resetTime = new Date(windowStart.getTime() + this.defaultConfig.windowMs);
        
        return {
          allowed: false,
          reason: 'Connection rate limit exceeded',
          remaining: 0,
          resetTime,
          retryAfter: Math.ceil((resetTime.getTime() - now.getTime()) / 1000)
        };
      }

      // Registrar esta conexão
      await this.recordRequest(key, 'connection', remoteAddress);
      
      return {
        allowed: true,
        remaining: maxConnections - currentCount - 1,
        resetTime: new Date(windowStart.getTime() + this.defaultConfig.windowMs)
      };

    } catch (error) {
      logger.error('Connection rate limit check failed', { error, remoteAddress });
      return { allowed: true }; // Allow on error
    }
  }

  public async checkAuth(
    remoteAddress: string, 
    username: string
  ): Promise<RateLimitResult> {
    try {
      const ipKey = `auth:ip:${remoteAddress}`;
      const userKey = `auth:user:${username}`;
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.defaultConfig.authWindowMs);

      // Verificar limite por IP
      const ipCount = await this.getCurrentCount(ipKey, 'auth', windowStart);
      if (ipCount >= this.defaultConfig.maxAuthAttempts) {
        await this.logRateLimit(ipKey, 'auth', remoteAddress, ipCount);
        
        return {
          allowed: false,
          reason: 'Authentication rate limit exceeded for IP',
          remaining: 0,
          retryAfter: Math.ceil(this.defaultConfig.authWindowMs / 1000)
        };
      }

      // Verificar limite por usuário
      const userCount = await this.getCurrentCount(userKey, 'auth');
      if (userCount >= this.defaultConfig.maxAuthAttempts) {
        await this.logRateLimit(userKey, 'auth', remoteAddress, userCount);
        
        return {
          allowed: false,
          reason: 'Authentication rate limit exceeded for user',
          remaining: 0,
          retryAfter: Math.ceil(this.defaultConfig.authWindowMs / 1000)
        };
      }

      // Registrar tentativa de autenticação
      await Promise.all([
        this.recordRequest(ipKey, 'auth', remoteAddress),
        this.recordRequest(userKey, 'auth', remoteAddress)
      ]);

      return {
        allowed: true,
        remaining: this.defaultConfig.maxAuthAttempts - Math.max(ipCount, userCount) - 1
      };

    } catch (error) {
      logger.error('Auth rate limit check failed', { error, remoteAddress, username });
      return { allowed: true }; // Allow on error
    }
  }

  public async checkEmailSending(
    userId: number,
    remoteAddress?: string
  ): Promise<RateLimitResult> {
    try {
      const userKey = `email:user:${userId}`;
      const now = new Date();
      const hourStart = new Date(now.getTime() - 3600000); // 1 hora
      const dayStart = new Date(now.getTime() - 86400000); // 1 dia

      // Buscar configuração personalizada para este usuário
      const customConfig = await this.getCustomConfig(userId.toString(), 'user');
      const maxEmailsPerHour = customConfig?.max_emails_per_hour || 5000; // aumentado de 1000 para 5000
      const maxEmailsPerDay = customConfig?.max_emails_per_day || 50000; // aumentado de 10000 para 50000

      // Verificar limite por hora
      const hourCount = await this.getCurrentCount(userKey, 'email', hourStart);
      if (hourCount >= maxEmailsPerHour) {
        await this.logRateLimit(userKey, 'email', remoteAddress, hourCount);
        
        return {
          allowed: false,
          reason: 'Email sending rate limit exceeded (hourly)',
          remaining: 0,
          retryAfter: 3600
        };
      }

      // Verificar limite diário
      const dayCount = await this.getCurrentCount(userKey, 'email', dayStart);
      if (dayCount >= maxEmailsPerDay) {
        await this.logRateLimit(userKey, 'email', remoteAddress, dayCount);
        
        return {
          allowed: false,
          reason: 'Email sending rate limit exceeded (daily)',
          remaining: 0,
          retryAfter: 86400
        };
      }

      // Registrar envio de email
      await this.recordRequest(userKey, 'email', remoteAddress);

      return {
        allowed: true,
        remaining: Math.min(
          maxEmailsPerHour - hourCount - 1,
          maxEmailsPerDay - dayCount - 1
        )
      };

    } catch (error) {
      logger.error('Email rate limit check failed', { error, userId });
      return { allowed: true }; // Allow on error
    }
  }

  private async getCurrentCount(
    key: string, 
    type: string, 
    windowStart?: Date
  ): Promise<number> {
    try {
      let query = db('rate_limit_logs')
        .where('key', key)
        .where('type', type);

      if (windowStart) {
        query = query.where('window_start', '>=', windowStart);
      }

      const result = await query.sum('count as total').first();
      return parseInt(result?.total || 0);
    } catch (error) {
      logger.error('Failed to get current count', { error, key, type });
      return 0;
    }
  }

  private async recordRequest(
    key: string,
    type: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      const now = new Date();
      const windowStart = this.getWindowStart(now, type);

      // Verificar se já existe um registro para esta janela
      const existing = await db('rate_limit_logs')
        .where('key', key)
        .where('type', type)
        .where('window_start', windowStart)
        .first();

      if (existing) {
        // Atualizar contagem existente
        await db('rate_limit_logs')
          .where('id', existing.id)
          .update({
            count: existing.count + 1,
            last_request: now,
            updated_at: now
          });
      } else {
        // Criar novo registro
        await db('rate_limit_logs').insert({
          key,
          type,
          ip_address: ipAddress,
          count: 1,
          window_start: windowStart,
          last_request: now
        });
      }
    } catch (error) {
      logger.error('Failed to record request', { error, key, type });
    }
  }

  private async logRateLimit(
    key: string,
    type: string,
    ipAddress?: string,
    count?: number
  ): Promise<void> {
    logger.warn('Rate limit exceeded', {
      key,
      type,
      ipAddress,
      count,
      timestamp: new Date()
    });

    // Registrar evento de rate limiting para análise
    try {
      await db('security_events').insert({
        event_type: 'rate_limit_exceeded',
        ip_address: ipAddress,
        details: JSON.stringify({ key, type, count }),
        severity: 'medium'
      });
    } catch (error) {
      logger.error('Failed to log rate limit event', { error });
    }
  }

  private getWindowStart(now: Date, type: string): Date {
    const windowMs = type === 'auth' ? this.defaultConfig.authWindowMs : this.defaultConfig.windowMs;
    return new Date(now.getTime() - (now.getTime() % windowMs));
  }

  private async getCustomConfig(
    identifier: string,
    type: 'ip' | 'user'
  ): Promise<any> {
    try {
      return await db('rate_limit_configs')
        .where('identifier', identifier)
        .where('type', type)
        .where('is_active', true)
        .first();
    } catch (error) {
      logger.error('Failed to get custom config', { error, identifier, type });
      return null;
    }
  }

  // Limpeza automática de registros antigos
  private startCleanupTimer(): void {
    setInterval(async () => {
      try {
        const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 dias
        
        const deleted = await db('rate_limit_logs')
          .where('window_start', '<', cutoffDate)
          .del();

        if (deleted > 0) {
          logger.info('Cleaned up old rate limit records', { deleted });
        }
      } catch (error) {
        logger.error('Rate limit cleanup failed', { error });
      }
    }, 24 * 60 * 60 * 1000); // Executar diariamente
  }

  // Métodos para configuração dinâmica
  public async setUserLimit(
    userId: number,
    maxEmailsPerHour?: number,
    maxEmailsPerDay?: number
  ): Promise<void> {
    try {
      await db('rate_limit_configs')
        .insert({
          identifier: userId.toString(),
          type: 'user',
          max_emails_per_hour: maxEmailsPerHour,
          max_emails_per_day: maxEmailsPerDay,
          is_active: true
        })
        .onConflict(['identifier', 'type'])
        .merge();

      logger.info('User rate limit configured', {
        userId,
        maxEmailsPerHour,
        maxEmailsPerDay
      });
    } catch (error) {
      logger.error('Failed to set user limit', { error, userId });
    }
  }

  public async setIPLimit(
    ipAddress: string,
    maxConnections?: number,
    maxAuthAttempts?: number
  ): Promise<void> {
    try {
      await db('rate_limit_configs')
        .insert({
          identifier: ipAddress,
          type: 'ip',
          max_connections: maxConnections,
          max_auth_attempts: maxAuthAttempts,
          is_active: true
        })
        .onConflict(['identifier', 'type'])
        .merge();

      logger.info('IP rate limit configured', {
        ipAddress,
        maxConnections,
        maxAuthAttempts
      });
    } catch (error) {
      logger.error('Failed to set IP limit', { error, ipAddress });
    }
  }

  public async getRateLimitStats(): Promise<any> {
    try {
      const now = new Date();
      const hour = new Date(now.getTime() - 3600000);

      const [connectionStats, authStats, emailStats] = await Promise.all([
        db('rate_limit_logs')
          .where('type', 'connection')
          .where('window_start', '>=', hour)
          .sum('count as total')
          .first(),
        db('rate_limit_logs')
          .where('type', 'auth')
          .where('window_start', '>=', hour)
          .sum('count as total')
          .first(),
        db('rate_limit_logs')
          .where('type', 'email')
          .where('window_start', '>=', hour)
          .sum('count as total')
          .first()
      ]);

      return {
        last_hour: {
          connections: parseInt(connectionStats?.total || 0),
          auth_attempts: parseInt(authStats?.total || 0),
          emails_sent: parseInt(emailStats?.total || 0)
        },
        timestamp: now.toISOString()
      };
    } catch (error) {
      logger.error('Failed to get rate limit stats', { error });
      return {
        last_hour: {
          connections: 0,
          auth_attempts: 0,
          emails_sent: 0
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  // Método para reset manual de limites (para emergências)
  public async resetUserLimits(userId: number): Promise<void> {
    try {
      const userKey = `email:user:${userId}`;
      
      await db('rate_limit_logs')
        .where('key', userKey)
        .del();

      logger.info('User rate limits reset', { userId });
    } catch (error) {
      logger.error('Failed to reset user limits', { error, userId });
    }
  }

  public async resetIPLimits(ipAddress: string): Promise<void> {
    try {
      await db('rate_limit_logs')
        .where('ip_address', ipAddress)
        .del();

      logger.info('IP rate limits reset', { ipAddress });
    } catch (error) {
      logger.error('Failed to reset IP limits', { error, ipAddress });
    }
  }
}