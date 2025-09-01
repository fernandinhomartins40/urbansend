import { Request, Response, NextFunction } from 'express';
import NodeCache from 'node-cache';
import { Pool } from 'generic-pool';
import { createTransport, Transporter } from 'nodemailer';
import { logger } from '../config/logger';
import { monitoringService } from '../services/monitoringService';
import { Env } from '../utils/env';

interface PerformanceMetrics {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
  userId?: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

interface SlowRequestAlert {
  threshold: number;
  count: number;
  lastAlert: Date;
}

class PerformanceMonitor {
  private requestMetrics: PerformanceMetrics[] = [];
  private slowRequestAlert: SlowRequestAlert = {
    threshold: 5000, // 5 seconds
    count: 0,
    lastAlert: new Date(0)
  };
  private maxMetricsHistory = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private cache: NodeCache;
  private smtpConnectionPool: Pool<Transporter>;
  private databaseConnectionPool: Pool<any>;
  private initialized: boolean = false;

  constructor() {
    this.cache = new NodeCache({ 
      stdTTL: 300, // 5 minutes default TTL
      checkperiod: 60, // Check every minute for expired keys
      useClones: false, // Better performance - return references
      deleteOnExpire: true,
      maxKeys: 10000 // Prevent memory leaks
    });
    
    this.initializeConnectionPools();
    this.startCleanupInterval();
    this.setupCacheMetrics();
  }

  private initializeConnectionPools() {
    // SMTP Connection Pool
    this.smtpConnectionPool = this.createSMTPPool();
    
    // Database Connection Pool (para futuras otimizações)
    this.databaseConnectionPool = this.createDatabasePool();
    
    this.initialized = true;
    logger.info('Performance monitor initialized', {
      smtpPoolSize: {
        max: 10,
        min: 2
      },
      cacheConfig: {
        stdTTL: 300,
        maxKeys: 10000
      }
    });
  }

  private createSMTPPool(): Pool<Transporter> {
    const factory = {
      create: async (): Promise<Transporter> => {
        const transporter = createTransport({
          pool: true,
          maxConnections: 20,
          maxMessages: 1000,
          rateLimit: 50, // 50 emails per second per connection
          host: Env.get('SMTP_HOST', 'localhost'),
          port: Env.getNumber('SMTP_PORT', 587),
          secure: false,
          auth: Env.get('SMTP_USERNAME') ? {
            user: Env.get('SMTP_USERNAME'),
            pass: Env.get('SMTP_PASSWORD')
          } : undefined,
          tls: {
            rejectUnauthorized: false
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
          name: Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br')
        });

        // Verificar se a conexão funciona
        try {
          await transporter.verify();
        } catch (error) {
          logger.warn('SMTP connection verification failed, but creating anyway', { error });
        }
        
        logger.debug('SMTP connection created', {
          host: Env.get('SMTP_HOST', 'localhost'),
          port: Env.getNumber('SMTP_PORT', 587)
        });

        return transporter;
      },
      
      destroy: async (transport: Transporter): Promise<void> => {
        try {
          transport.close();
          logger.debug('SMTP connection destroyed');
        } catch (error) {
          logger.warn('Error destroying SMTP connection', { error });
        }
      },
      
      validate: async (transport: Transporter): Promise<boolean> => {
        try {
          return transport.isIdle();
        } catch {
          return false;
        }
      }
    };

    const opts = {
      max: 10, // Maximum pool size
      min: 2,  // Minimum pool size
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 300000, // 5 minutes
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      maxWaitingClients: 50,
      testOnBorrow: true,
      testOnReturn: false
    };

    return new Pool(factory, opts);
  }

  private createDatabasePool(): Pool<any> {
    // Placeholder para pool de conexões de banco
    // Pode ser implementado futuramente para PostgreSQL/MySQL
    const factory = {
      create: async () => {
        // Retorna um objeto vazio por enquanto
        return {};
      },
      destroy: async () => {
        // Cleanup
      }
    };

    const opts = {
      max: 5,
      min: 1,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000
    };

    return new Pool(factory, opts);
  }

  private setupCacheMetrics() {
    // Atualizar métricas de cache a cada 30 segundos
    setInterval(() => {
      const stats = this.cache.getStats();
      
      if (monitoringService && monitoringService.recordCacheStats) {
        monitoringService.recordCacheStats({
          hits: stats.hits,
          misses: stats.misses,
          keys: stats.keys,
          ksize: stats.ksize,
          vsize: stats.vsize
        });
      }

      // Log estatísticas se houver atividade
      if (stats.hits + stats.misses > 0) {
        const hitRate = (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2);
        
        logger.info('Cache performance stats', {
          hitRate: `${hitRate}%`,
          totalKeys: stats.keys,
          memoryUsage: {
            keySize: `${Math.round(stats.ksize / 1024)}KB`,
            valueSize: `${Math.round(stats.vsize / 1024)}KB`
          }
        });
      }
    }, 30000);
  }

  private startCleanupInterval() {
    // Clean up old metrics every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 5 * 60 * 1000);
  }

  private cleanupOldMetrics() {
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
    this.requestMetrics = this.requestMetrics.filter(
      metric => metric.timestamp > cutoffTime
    );

    // Keep only the most recent metrics if we have too many
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics = this.requestMetrics
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.maxMetricsHistory);
    }

    logger.debug('Cleaned up performance metrics', {
      remainingMetrics: this.requestMetrics.length,
      cutoffTime: cutoffTime.toISOString()
    });
  }

  public recordMetric(metric: PerformanceMetrics) {
    this.requestMetrics.push(metric);

    // Check for slow requests
    if (metric.responseTime > this.slowRequestAlert.threshold) {
      this.handleSlowRequest(metric);
    }

    // Log performance metric
    if (Env.get('LOG_LEVEL') === 'debug' || metric.responseTime > 2000) {
      logger.info('Request performance metric', {
        method: metric.method,
        url: metric.url,
        statusCode: metric.statusCode,
        responseTime: metric.responseTime,
        memoryMB: Math.round(metric.memoryUsage.heapUsed / 1024 / 1024),
        timestamp: metric.timestamp.toISOString()
      });
    }
  }

  private handleSlowRequest(metric: PerformanceMetrics) {
    this.slowRequestAlert.count++;
    const now = new Date();
    
    // Alert only once per hour for slow requests
    const hoursSinceLastAlert = (now.getTime() - this.slowRequestAlert.lastAlert.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastAlert >= 1) {
      logger.warn('Slow request detected', {
        method: metric.method,
        url: metric.url,
        responseTime: metric.responseTime,
        threshold: this.slowRequestAlert.threshold,
        slowRequestCount: this.slowRequestAlert.count,
        memoryMB: Math.round(metric.memoryUsage.heapUsed / 1024 / 1024),
        timestamp: metric.timestamp.toISOString()
      });

      this.slowRequestAlert.lastAlert = now;
      this.slowRequestAlert.count = 0;
    }
  }

  public getMetrics(timeRange: number = 60): {
    averageResponseTime: number;
    totalRequests: number;
    errorRate: number;
    slowRequests: number;
    requestsPerMinute: number;
    memoryUsage: {
      current: number;
      average: number;
      peak: number;
    };
    topEndpoints: Array<{
      endpoint: string;
      count: number;
      averageTime: number;
    }>;
  } {
    const cutoffTime = new Date(Date.now() - (timeRange * 60 * 1000));
    const recentMetrics = this.requestMetrics.filter(
      metric => metric.timestamp > cutoffTime
    );

    if (recentMetrics.length === 0) {
      return {
        averageResponseTime: 0,
        totalRequests: 0,
        errorRate: 0,
        slowRequests: 0,
        requestsPerMinute: 0,
        memoryUsage: {
          current: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          average: 0,
          peak: 0
        },
        topEndpoints: []
      };
    }

    const totalResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    const errorRequests = recentMetrics.filter(m => m.statusCode >= 400);
    const slowRequests = recentMetrics.filter(m => m.responseTime > this.slowRequestAlert.threshold);

    // Memory statistics
    const memoryValues = recentMetrics.map(m => m.memoryUsage.heapUsed / 1024 / 1024);
    const averageMemory = memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length;
    const peakMemory = Math.max(...memoryValues);

    // Top endpoints
    const endpointCounts: Record<string, { count: number; totalTime: number }> = {};
    
    recentMetrics.forEach(metric => {
      const endpoint = `${metric.method} ${metric.url}`;
      if (!endpointCounts[endpoint]) {
        endpointCounts[endpoint] = { count: 0, totalTime: 0 };
      }
      endpointCounts[endpoint].count++;
      endpointCounts[endpoint].totalTime += metric.responseTime;
    });

    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, data]) => ({
        endpoint,
        count: data.count,
        averageTime: Math.round(data.totalTime / data.count)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      averageResponseTime: Math.round(totalResponseTime / recentMetrics.length),
      totalRequests: recentMetrics.length,
      errorRate: Math.round((errorRequests.length / recentMetrics.length) * 100),
      slowRequests: slowRequests.length,
      requestsPerMinute: Math.round(recentMetrics.length / timeRange),
      memoryUsage: {
        current: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        average: Math.round(averageMemory),
        peak: Math.round(peakMemory)
      },
      topEndpoints
    };
  }

  public getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    metrics: any;
  } {
    const metrics = this.getMetrics(5); // Last 5 minutes
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check response time
    if (metrics.averageResponseTime > 5000) {
      status = 'critical';
      issues.push(`High average response time: ${metrics.averageResponseTime}ms`);
    } else if (metrics.averageResponseTime > 2000) {
      status = 'warning';
      issues.push(`Elevated response time: ${metrics.averageResponseTime}ms`);
    }

    // Check error rate
    if (metrics.errorRate > 20) {
      status = 'critical';
      issues.push(`High error rate: ${metrics.errorRate}%`);
    } else if (metrics.errorRate > 5) {
      if (status !== 'critical') status = 'warning';
      issues.push(`Elevated error rate: ${metrics.errorRate}%`);
    }

    // Check memory usage
    if (metrics.memoryUsage.current > 1024) { // 1GB
      status = 'critical';
      issues.push(`High memory usage: ${metrics.memoryUsage.current}MB`);
    } else if (metrics.memoryUsage.current > 512) { // 512MB
      if (status !== 'critical') status = 'warning';
      issues.push(`Elevated memory usage: ${metrics.memoryUsage.current}MB`);
    }

    // Check slow requests
    if (metrics.slowRequests > 10) {
      if (status !== 'critical') status = 'warning';
      issues.push(`Multiple slow requests: ${metrics.slowRequests} in last 5 minutes`);
    }

    return {
      status,
      issues,
      metrics
    };
  }

  /**
   * Obter conexão SMTP do pool
   */
  public async getSMTPConnection(): Promise<Transporter> {
    if (!this.initialized) {
      throw new Error('Performance monitor not initialized');
    }

    const startTime = Date.now();
    
    try {
      const connection = await this.smtpConnectionPool.acquire();
      const acquisitionTime = Date.now() - startTime;
      
      if (monitoringService && monitoringService.recordConnectionPoolAcquisition) {
        monitoringService.recordConnectionPoolAcquisition('smtp', acquisitionTime);
      }
      
      if (acquisitionTime > 5000) {
        logger.warn('Slow SMTP connection acquisition', {
          acquisitionTime: `${acquisitionTime}ms`,
          poolStats: {
            size: this.smtpConnectionPool.size,
            available: this.smtpConnectionPool.available,
            borrowed: this.smtpConnectionPool.borrowed,
            pending: this.smtpConnectionPool.pending,
            max: this.smtpConnectionPool.max,
            min: this.smtpConnectionPool.min
          }
        });
      }
      
      return connection;
    } catch (error) {
      logger.error('Failed to acquire SMTP connection from pool', {
        error: error instanceof Error ? error.message : 'Unknown error',
        acquisitionTime: `${Date.now() - startTime}ms`,
        poolStats: {
          size: this.smtpConnectionPool.size,
          available: this.smtpConnectionPool.available,
          borrowed: this.smtpConnectionPool.borrowed,
          pending: this.smtpConnectionPool.pending
        }
      });
      throw error;
    }
  }

  /**
   * Retornar conexão SMTP ao pool
   */
  public async releaseSMTPConnection(connection: Transporter): Promise<void> {
    try {
      await this.smtpConnectionPool.release(connection);
    } catch (error) {
      logger.error('Failed to release SMTP connection to pool', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Tentar destruir a conexão problema
      try {
        await this.smtpConnectionPool.destroy(connection);
      } catch (destroyError) {
        logger.error('Failed to destroy problematic SMTP connection', {
          error: destroyError instanceof Error ? destroyError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Cache com métricas
   */
  public cacheGet<T>(key: string): T | undefined {
    const startTime = Date.now();
    const value = this.cache.get<T>(key);
    const duration = Date.now() - startTime;
    
    if (monitoringService && monitoringService.recordCacheOperation) {
      monitoringService.recordCacheOperation('get', duration, value !== undefined);
    }
    
    return value;
  }

  public cacheSet(key: string, value: any, ttl?: number): boolean {
    const startTime = Date.now();
    const result = this.cache.set(key, value, ttl || 300);
    const duration = Date.now() - startTime;
    
    if (monitoringService && monitoringService.recordCacheOperation) {
      monitoringService.recordCacheOperation('set', duration, result);
    }
    
    return result;
  }

  public cacheDel(keys: string | string[]): number {
    const startTime = Date.now();
    const result = this.cache.del(keys);
    const duration = Date.now() - startTime;
    
    if (monitoringService && monitoringService.recordCacheOperation) {
      monitoringService.recordCacheOperation('del', duration, result > 0);
    }
    
    return result;
  }

  public cacheFlush(): void {
    const startTime = Date.now();
    this.cache.flushAll();
    const duration = Date.now() - startTime;
    
    if (monitoringService && monitoringService.recordCacheOperation) {
      monitoringService.recordCacheOperation('flush', duration, true);
    }
    
    logger.info('Cache flushed', { duration: `${duration}ms` });
  }

  /**
   * Obter estatísticas de performance completas
   */
  public getPerformanceStats() {
    const cacheStats = this.cache.getStats();
    const memUsage = process.memoryUsage();
    
    return {
      cache: {
        hitRate: cacheStats.hits + cacheStats.misses > 0 
          ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(2) + '%'
          : '0%',
        keys: cacheStats.keys,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        memoryUsage: {
          keySize: `${Math.round(cacheStats.ksize / 1024)}KB`,
          valueSize: `${Math.round(cacheStats.vsize / 1024)}KB`
        }
      },
      connectionPools: {
        smtp: {
          size: this.smtpConnectionPool.size,
          available: this.smtpConnectionPool.available,
          borrowed: this.smtpConnectionPool.borrowed,
          pending: this.smtpConnectionPool.pending,
          max: this.smtpConnectionPool.max,
          min: this.smtpConnectionPool.min
        }
      },
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
      uptime: `${Math.round(process.uptime())}s`,
      cpuUsage: process.cpuUsage()
    };
  }

  public async destroy() {
    logger.info('Cleaning up performance monitor resources');
    
    try {
      // Limpar intervalo de cleanup
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      // Limpar cache
      this.cache.flushAll();
      this.cache.close();
      
      // Fechar connection pools
      if (this.initialized) {
        await this.smtpConnectionPool.drain();
        await this.smtpConnectionPool.clear();
        
        await this.databaseConnectionPool.drain();
        await this.databaseConnectionPool.clear();
      }
      
      logger.info('Performance monitor cleanup completed');
    } catch (error) {
      logger.error('Error during performance monitor cleanup', { error });
    }
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Performance monitoring middleware
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();
  const startCpuUsage = process.cpuUsage();
  const startMemory = process.memoryUsage();

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    // Record the performance metric
    const metric: PerformanceMetrics = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: Math.round(responseTime * 100) / 100, // Round to 2 decimal places
      timestamp: new Date(),
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: (req as any).userId, // If user authentication middleware sets this
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(startCpuUsage)
    };

    performanceMonitor.recordMetric(metric);

    // Call original end method
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
};

// Middleware to add performance metrics endpoint
export const performanceReportMiddleware = (req: Request, res: Response) => {
  const timeRange = parseInt(req.query.timeRange as string) || 60; // Default 60 minutes
  
  try {
    const metrics = performanceMonitor.getMetrics(timeRange);
    const health = performanceMonitor.getHealthStatus();
    
    res.json({
      timeRange: `${timeRange} minutes`,
      timestamp: new Date().toISOString(),
      health: health.status,
      issues: health.issues,
      metrics,
      system: {
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        environment: Env.get('NODE_ENV'),
        memoryLimit: process.env.NODE_OPTIONS?.includes('--max-old-space-size') ? 
          process.env.NODE_OPTIONS.match(/--max-old-space-size=(\d+)/)?.[1] + 'MB' : 'default'
      }
    });
  } catch (error) {
    logger.error('Error generating performance report', { error });
    res.status(500).json({
      error: 'Failed to generate performance report',
      message: (error as Error).message
    });
  }
};

// Middleware factory para usar em rotas específicas
export const createPerformanceMiddleware = (options: {
  enableCache?: boolean;
  cacheTTL?: number;
  logSlowRequests?: boolean;
  slowThreshold?: number;
} = {}) => {
  const {
    enableCache = true,
    cacheTTL = 300,
    logSlowRequests = true,
    slowThreshold = 2000
  } = options;

  return performanceMiddleware;
};

// Helper para instrumentar funções
export const instrumentAsyncFunction = <T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  options: {
    useCache?: boolean;
    cacheKeyGenerator?: (...args: any[]) => string;
    cacheTTL?: number;
    logPerformance?: boolean;
    slowThreshold?: number;
  } = {}
): T => {
  const {
    useCache = false,
    cacheKeyGenerator,
    cacheTTL = 300,
    logPerformance = true,
    slowThreshold = 1000
  } = options;

  return (async (...args: any[]) => {
    const startTime = Date.now();
    const cacheKey = useCache && cacheKeyGenerator ? cacheKeyGenerator(...args) : null;
    
    // Verificar cache se habilitado
    if (useCache && cacheKey) {
      const cached = performanceMonitor.cacheGet(cacheKey);
      if (cached !== undefined) {
        if (logPerformance) {
          logger.debug(`Cache hit for function: ${name}`, {
            function: name,
            cacheKey,
            duration: `${Date.now() - startTime}ms`
          });
        }
        return cached;
      }
    }
    
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      
      // Salvar no cache se habilitado
      if (useCache && cacheKey && result !== undefined) {
        performanceMonitor.cacheSet(cacheKey, result, cacheTTL);
      }
      
      if (logPerformance) {
        const logLevel = duration > slowThreshold ? 'warn' : 'debug';
        logger[logLevel](`Function execution completed: ${name}`, {
          function: name,
          duration: `${duration}ms`,
          cached: false,
          performance: {
            executionTime: duration,
            wasSlowOperation: duration > slowThreshold
          }
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`Function execution failed: ${name}`, {
        function: name,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }) as T;
};

// Helper para gerar ID de requisição
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, cleaning up performance monitor...');
  performanceMonitor.destroy();
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, cleaning up performance monitor...');
  performanceMonitor.destroy();
});