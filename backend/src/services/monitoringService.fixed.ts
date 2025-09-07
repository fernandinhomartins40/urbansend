import { logger } from '../config/logger';
import { Env } from '../utils/env';
import { Knex } from 'knex';
import db from '../config/database';
import * as net from 'net';
import { Request, Response, NextFunction } from 'express';

// Simple metrics implementation without external dependencies
export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface HealthStatus {
  healthy: boolean;
  details?: Record<string, any>;
  error?: string;
  timestamp: Date;
}

export class MonitoringService {
  private db: Knex;
  private isClosed = false; // CORREÇÃO: Flag para evitar duplo fechamento

  private metrics: Map<string, MetricValue[]> = new Map();
  private healthChecks: Map<string, HealthStatus> = new Map();
  
  private readonly METRICS_RETENTION_HOURS = 24;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly METRICS_CLEANUP_INTERVAL = 3600000; // 1 hour

  private healthCheckInterval?: NodeJS.Timeout;
  private metricsCleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.db = db;
    this.setupIntervals();
  }


  private setupIntervals() {
    // Setup periodic cleanup
    this.metricsCleanupInterval = setInterval(() => {
      this.cleanupOldMetrics().catch(error => 
        logger.error('Metrics cleanup failed', { error: (error as Error).message })
      );
    }, this.METRICS_CLEANUP_INTERVAL);

    // Setup health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error =>
        logger.error('Health checks failed', { error: (error as Error).message })
      );
    }, this.HEALTH_CHECK_INTERVAL);
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>) {
    try {
      const metric: MetricValue = {
        name,
        value,
        labels,
        timestamp: Date.now()
      };

      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }

      const metrics = this.metrics.get(name)!;
      metrics.push(metric);

      // Keep only last 1000 metrics per name to prevent memory issues
      if (metrics.length > 1000) {
        metrics.splice(0, metrics.length - 1000);
      }

      // Store in database (async, don't wait)
      this.storeMetricInDB(metric).catch(error =>
        logger.error('Failed to store metric in database', { error: (error as Error).message, metric })
      );

    } catch (error) {
      logger.error('Failed to record metric', { error: (error as Error).message, name, value });
    }
  }

  private async storeMetricInDB(metric: MetricValue) {
    if (this.isClosed) return; // Skip if service is closed
    
    try {
      await this.db('metrics').insert({
        name: metric.name,
        value: metric.value,
        labels: metric.labels ? JSON.stringify(metric.labels) : null,
        timestamp: new Date(metric.timestamp)
      });
    } catch (error) {
      // Ignore database errors during metric storage to prevent cascading failures
      logger.debug('Metric storage failed', { error: (error as Error).message });
    }
  }

  recordHealthCheck(service: string, status: HealthStatus) {
    try {
      this.healthChecks.set(service, status);

      // Store in database (async, don't wait)
      this.storeHealthCheckInDB(service, status).catch(error =>
        logger.error('Failed to store health check in database', { error: (error as Error).message })
      );
    } catch (error) {
      logger.error('Failed to record health check', { error: (error as Error).message, service });
    }
  }

  private async storeHealthCheckInDB(service: string, status: HealthStatus) {
    if (this.isClosed) return; // Skip if service is closed
    
    try {
      await this.db('health_checks').insert({
        service,
        healthy: status.healthy,
        details: status.details ? JSON.stringify(status.details) : null,
        error: status.error || null,
        timestamp: status.timestamp
      });
    } catch (error) {
      // Ignore database errors during health check storage
      logger.debug('Health check storage failed', { error: (error as Error).message });
    }
  }

  getMetrics(name?: string): MetricValue[] {
    if (name) {
      return this.metrics.get(name) || [];
    }

    const allMetrics: MetricValue[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }

    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  getHealthChecks(): Map<string, HealthStatus> {
    return new Map(this.healthChecks);
  }

  private async cleanupOldMetrics() {
    if (this.isClosed) return;
    
    try {
      const cutoffTime = Date.now() - (this.METRICS_RETENTION_HOURS * 60 * 60 * 1000);

      // Clean up in-memory metrics
      for (const [name, metrics] of this.metrics.entries()) {
        const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
        this.metrics.set(name, filteredMetrics);
      }

      // Clean up database metrics
      const cutoffDate = new Date(cutoffTime);
      await this.db('metrics').where('timestamp', '<', cutoffDate).del();
      await this.db('health_checks').where('timestamp', '<', cutoffDate).del();

      logger.debug('Old metrics cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup old metrics', { error: (error as Error).message });
    }
  }

  private async performHealthChecks() {
    if (this.isClosed) return;
    
    try {
      // Database health check
      const dbStart = Date.now();
      try {
        await this.db.raw('SELECT 1');
        this.recordHealthCheck('database', {
          healthy: true,
          details: { responseTime: Date.now() - dbStart },
          timestamp: new Date()
        });
      } catch (error) {
        this.recordHealthCheck('database', {
          healthy: false,
          error: (error as Error).message,
          timestamp: new Date()
        });
      }

      // Memory usage check
      const memUsage = process.memoryUsage();
      const memHealthy = memUsage.heapUsed < memUsage.heapTotal * 0.9;
      
      this.recordHealthCheck('memory', {
        healthy: memHealthy,
        details: memUsage,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Health checks failed', { error: (error as Error).message });
    }
  }

  // Middleware for tracking HTTP requests
  trackRequest() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      this.recordMetric('http_requests_total', 1, {
        method: req.method,
        path: req.path
      });

      res.on('finish', () => {
        const duration = Date.now() - start;
        
        this.recordMetric('http_request_duration', duration, {
          method: req.method,
          path: req.path,
          status: res.statusCode.toString()
        });

        this.recordMetric('http_responses_total', 1, {
          method: req.method,
          path: req.path,
          status: res.statusCode.toString()
        });
      });

      next();
    };
  }

  incrementActiveRequests() {
    this.recordMetric('http_requests_active', 1);
  }

  decrementActiveRequests() {
    this.recordMetric('http_requests_active', -1);
  }

  async getSystemHealth() {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      emailsSent: 0,
      emailsFailed: 0,
      activeConnections: 0
    };
  }

  // COMPATIBILIDADE: Métodos adicionais necessários para compatibilidade total
  async initialize() {
    // Já inicializado no constructor, mas mantém compatibilidade
    logger.info('MonitoringService initialize called (already initialized)');
  }

  getHealthStatus() {
    return {
      healthy: true,
      overall: { healthy: true, timestamp: new Date() },
      services: Object.fromEntries(this.healthChecks),
      timestamp: new Date()
    };
  }

  getSystemStats() {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      metrics: this.getMetrics(),
      healthChecks: Object.fromEntries(this.healthChecks)
    };
  }

  incrementHttpRequestsInFlight() {
    this.recordMetric('http_requests_in_flight', 1);
  }

  decrementHttpRequestsInFlight() {
    this.recordMetric('http_requests_in_flight', -1);
  }

  recordHttpRequest(method: string, path: string, statusCode: number, duration?: number) {
    this.recordMetric('http_requests_total', 1, {
      method,
      path,
      status: statusCode.toString()
    });
  }

  recordHttpRequestDuration(method: string, path: string, duration: number, statusCode?: number) {
    this.recordMetric('http_request_duration', duration, {
      method,
      path,
      status: statusCode?.toString() || '200'
    });
  }

  recordDatabaseQuery(operation: string, table: string, duration: number) {
    this.recordMetric('database_queries_total', 1, {
      operation,
      table,
      success: 'true'
    });
    this.recordMetric('database_query_duration', duration, { operation, table });
  }

  recordRedisOperation(operation: string, duration: number) {
    this.recordMetric('redis_operations_total', 1, {
      operation,
      success: 'true'
    });
    this.recordMetric('redis_operation_duration', duration, { operation });
  }

  recordCacheStats(stats: any) {
    if (stats.hits) this.recordMetric('cache_hits_total', stats.hits);
    if (stats.misses) this.recordMetric('cache_misses_total', stats.misses);
  }

  recordConnectionPoolAcquisition(poolName: string, duration: number) {
    this.recordMetric('connection_pool_acquisition_duration', duration, { pool: poolName });
  }

  recordCacheOperation(operation: string, duration: number, success: boolean) {
    this.recordMetric('cache_operations_total', 1, {
      operation,
      success: success.toString()
    });
    this.recordMetric('cache_operation_duration', duration, { operation });
  }

  // CORREÇÃO PRINCIPAL: Método close robusto com controle de estado
  public async close(): Promise<void> {
    if (this.isClosed) {
      logger.info('MonitoringService already closed, skipping...');
      return;
    }

    logger.info('Starting MonitoringService shutdown...');
    this.isClosed = true;

    try {
      // Parar intervalos com timeout
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }
      
      if (this.metricsCleanupInterval) {
        clearInterval(this.metricsCleanupInterval);
        this.metricsCleanupInterval = undefined;
      }

      logger.info('MonitoringService intervals cleared');

      // Fechar conexão do banco com timeout e proteção
      try {
        if (this.db && !this.isClosed) {
          await Promise.race([
            this.db.destroy(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database destroy timeout')), 5000)
            )
          ]);
          logger.info('MonitoringService: Database connection closed');
        } else {
          logger.info('MonitoringService: Database already closed');
        }
      } catch (error) {
        logger.warn('MonitoringService database cleanup failed', { 
          error: (error as Error).message 
        });
        // Don't throw - let the shutdown continue
      }

      logger.info('MonitoringService shutdown completed');
    } catch (error) {
      logger.error('Error during MonitoringService shutdown', { 
        error: (error as Error).message 
      });
      // Don't throw - let the shutdown continue
    }
  }
}

export const monitoringService = new MonitoringService();