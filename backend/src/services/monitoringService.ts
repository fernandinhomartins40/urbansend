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

  private metrics: Map<string, MetricValue[]> = new Map();
  private healthChecks: Map<string, HealthStatus> = new Map();
  
  private readonly METRICS_RETENTION_HOURS = 24;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly METRICS_CLEANUP_INTERVAL = 3600000; // 1 hour

  private healthCheckInterval?: NodeJS.Timeout;
  private metricsCleanupInterval?: NodeJS.Timeout;

  constructor(database?: Knex) {
    this.db = database || db;

    this.validateRequiredTables();
    this.startHealthChecks();
    this.startMetricsCleanup();
  }

  private async validateRequiredTables(): Promise<void> {
    try {
      const requiredTables = [
        'system_metrics',
        'health_checks',
        'request_metrics',
        'email_metrics'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await this.db.schema.hasTable(tableName);
        if (!hasTable) {
          throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);
        }
      }

      logger.info('MonitoringService: Todas as tabelas obrigatórias validadas com sucesso');
    } catch (error) {
      logger.error('Erro ao validar tabelas do MonitoringService:', error);
      throw error;
    }
  }

  private startHealthChecks(): void {
    // Health check inicial
    this.performAllHealthChecks();

    // Health checks periódicos
    this.healthCheckInterval = setInterval(() => {
      this.performAllHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);

    logger.info('MonitoringService: Health checks iniciados');
  }

  private startMetricsCleanup(): void {
    this.metricsCleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.METRICS_CLEANUP_INTERVAL);

    logger.info('MonitoringService: Cleanup de métricas iniciado');
  }

  private async performAllHealthChecks(): Promise<void> {
    try {
      // Health checks paralelos
      await Promise.allSettled([
        this.checkSMTPHealth(),
        this.checkRedisHealth(),
        this.checkDatabaseHealth(),
        this.checkSystemHealth()
      ]);
    } catch (error) {
      logger.error('Erro durante health checks:', error);
    }
  }

  private async checkSMTPHealth(): Promise<void> {
    const serviceName = 'smtp';
    const startTime = Date.now();

    try {
      // Verificar se portas SMTP estão abertas
      const [mxPortOpen, submissionPortOpen] = await Promise.all([
        this.checkPort('localhost', 25),
        this.checkPort('localhost', 587)
      ]);

      const responseTime = Date.now() - startTime;
      const healthy = mxPortOpen && submissionPortOpen;
      
      const healthStatus: HealthStatus = {
        healthy,
        details: {
          mxPort: mxPortOpen ? 'open' : 'closed',
          submissionPort: submissionPortOpen ? 'open' : 'closed',
          responseTime: `${responseTime}ms`
        },
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      // Salvar no banco
      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: healthy,
        details: JSON.stringify(healthStatus.details),
        response_time_ms: responseTime
      });

      // Registrar métrica
      await this.recordMetric('smtp_health', healthy ? 1 : 0, { service: serviceName });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const healthStatus: HealthStatus = {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: false,
        error_message: (error as Error).message,
        response_time_ms: responseTime
      });
    }
  }

  private async checkRedisHealth(): Promise<void> {
    const serviceName = 'redis';
    const startTime = Date.now();

    try {
      // Tentar conexão com Redis
      const redisConnected = await this.testRedisConnection();
      const responseTime = Date.now() - startTime;

      const healthStatus: HealthStatus = {
        healthy: redisConnected,
        details: {
          status: redisConnected ? 'connected' : 'disconnected',
          latency: `${responseTime}ms`,
          host: Env.get('REDIS_HOST', 'localhost'),
          port: Env.getNumber('REDIS_PORT', 6379)
        },
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: redisConnected,
        details: JSON.stringify(healthStatus.details),
        response_time_ms: responseTime
      });

      // Registrar métrica
      await this.recordMetric('redis_health', redisConnected ? 1 : 0, { service: serviceName });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const healthStatus: HealthStatus = {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: false,
        error_message: (error as Error).message,
        response_time_ms: responseTime
      });
    }
  }

  private async checkDatabaseHealth(): Promise<void> {
    const serviceName = 'database';
    const startTime = Date.now();

    try {
      // Testar query simples
      await this.db.raw('SELECT 1 as test');
      const responseTime = Date.now() - startTime;

      const healthStatus: HealthStatus = {
        healthy: true,
        details: {
          status: 'connected',
          latency: `${responseTime}ms`,
          type: 'sqlite'
        },
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: true,
        details: JSON.stringify(healthStatus.details),
        response_time_ms: responseTime
      });

      // Registrar métrica
      await this.recordMetric('database_health', 1, { service: serviceName });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const healthStatus: HealthStatus = {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: false,
        error_message: (error as Error).message,
        response_time_ms: responseTime
      });
    }
  }

  private async checkSystemHealth(): Promise<void> {
    const serviceName = 'system';

    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();
      
      const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const memoryUsagePercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

      const healthStatus: HealthStatus = {
        healthy: memoryUsagePercent < 90, // Considera unhealthy se memória > 90%
        details: {
          memory: {
            used: `${memoryUsedMB}MB`,
            total: `${memoryTotalMB}MB`,
            usage: `${memoryUsagePercent}%`
          },
          uptime: `${Math.round(uptime)}s`,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        },
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: healthStatus.healthy,
        details: JSON.stringify(healthStatus.details)
      });

      // Registrar métricas do sistema
      await this.recordMetric('memory_usage_mb', memoryUsedMB);
      await this.recordMetric('memory_usage_percent', memoryUsagePercent);
      await this.recordMetric('system_uptime_seconds', uptime);

    } catch (error) {
      const healthStatus: HealthStatus = {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date()
      };

      this.healthChecks.set(serviceName, healthStatus);

      await this.db('health_checks').insert({
        service_name: serviceName,
        is_healthy: false,
        error_message: (error as Error).message
      });
    }
  }

  private async checkPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 5000;

      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  private async testRedisConnection(): Promise<boolean> {
    try {
      // Tentar conectar na porta Redis
      return await this.checkPort(
        Env.get('REDIS_HOST', 'localhost'),
        Env.getNumber('REDIS_PORT', 6379)
      );
    } catch (error) {
      return false;
    }
  }

  // Métricas públicas
  public async recordMetric(name: string, value: number, labels?: Record<string, string>): Promise<void> {
    try {
      const metric: MetricValue = {
        name,
        value,
        labels,
        timestamp: Date.now()
      };

      // Adicionar à cache em memória
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      
      const metricValues = this.metrics.get(name)!;
      metricValues.push(metric);

      // Manter apenas últimas 1000 medições por métrica
      if (metricValues.length > 1000) {
        metricValues.shift();
      }

      // Salvar no banco
      await this.db('system_metrics').insert({
        metric_name: name,
        metric_value: value,
        labels: labels ? JSON.stringify(labels) : null
      });

    } catch (error) {
      logger.error('Erro ao registrar métrica:', error);
    }
  }

  public async recordEmailSent(userId: number, status: string): Promise<void> {
    await this.recordMetric('emails_sent_total', 1, { user_id: userId.toString(), status });
    
    // Também salvar na tabela específica de email
    await this.db('email_metrics').insert({
      metric_type: 'sent',
      user_id: userId,
      status: status,
      count: 1
    });
  }

  public async recordEmailDelivered(domain: string, mxServer?: string): Promise<void> {
    await this.recordMetric('emails_delivered_total', 1, { domain, mx_server: mxServer || 'unknown' });
    
    await this.db('email_metrics').insert({
      metric_type: 'delivered',
      domain: domain,
      mx_server: mxServer,
      status: 'success',
      count: 1
    });
  }

  public async recordEmailFailed(reason: string, domain: string): Promise<void> {
    await this.recordMetric('emails_failed_total', 1, { reason, domain });
    
    await this.db('email_metrics').insert({
      metric_type: 'failed',
      domain: domain,
      status: reason,
      count: 1
    });
  }

  public async recordSMTPConnection(type: 'mx' | 'submission', result: 'success' | 'failed'): Promise<void> {
    await this.recordMetric('smtp_connections_total', 1, { type, result });
  }

  public async recordResponseTime(method: string, route: string, statusCode: number, duration: number): Promise<void> {
    // Garantir que duration seja um número válido
    const safeDuration = typeof duration === 'number' && !isNaN(duration) ? duration : 0;
    
    await this.recordMetric('http_request_duration_ms', safeDuration, {
      method,
      route,
      status_code: statusCode.toString()
    });

    // Capturar uso de memória durante o request
    const memoryUsage = process.memoryUsage();
    const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    await this.db('request_metrics').insert({
      method: method,
      route: route,
      status_code: statusCode,
      response_time_ms: safeDuration,
      memory_usage_mb: memoryUsedMB
    });
  }

  // Middleware de performance
  public performanceMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();
      const startMemory = process.memoryUsage();

      // Capturar resposta
      const originalSend = res.send;
      res.send = function(data) {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to ms
        const endMemory = process.memoryUsage();
        
        // Log performance
        logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration.toFixed(2)}ms`,
          memoryDelta: `${Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024)}MB`
        });

        // Registrar métricas de forma assíncrona
        setImmediate(async () => {
          try {
            const monitoringService = new MonitoringService();
            await monitoringService.recordResponseTime(
              req.method,
              req.route?.path || req.path,
              res.statusCode,
              duration
            );
          } catch (error) {
            logger.error('Erro ao registrar métrica de response time:', error);
          }
        });

        return originalSend.call(this, data);
      };

      next();
    };
  }

  // API para obter métricas
  public async getMetrics(format: 'json' | 'prometheus' = 'json'): Promise<string> {
    try {
      if (format === 'prometheus') {
        return this.formatPrometheusMetrics();
      }

      // Formato JSON
      const metrics = {};
      for (const [name, values] of this.metrics.entries()) {
        const latestValue = values[values.length - 1];
        if (latestValue) {
          metrics[name] = {
            value: latestValue.value,
            labels: latestValue.labels,
            timestamp: new Date(latestValue.timestamp).toISOString()
          };
        }
      }

      return JSON.stringify(metrics, null, 2);
    } catch (error) {
      logger.error('Erro ao obter métricas:', error);
      return JSON.stringify({ error: 'Failed to get metrics' });
    }
  }

  private formatPrometheusMetrics(): string {
    let output = '';
    
    for (const [name, values] of this.metrics.entries()) {
      const latestValue = values[values.length - 1];
      if (!latestValue) continue;

      output += `# HELP ${name} ${name} metric\n`;
      output += `# TYPE ${name} gauge\n`;
      
      if (latestValue.labels) {
        const labels = Object.entries(latestValue.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        output += `${name}{${labels}} ${latestValue.value}\n`;
      } else {
        output += `${name} ${latestValue.value}\n`;
      }
      
      output += '\n';
    }

    return output;
  }

  public async getHealthStatus(): Promise<Record<string, HealthStatus>> {
    const status = {};
    
    for (const [serviceName, healthStatus] of this.healthChecks.entries()) {
      status[serviceName] = healthStatus;
    }

    return status;
  }

  public async getSystemStats(): Promise<any> {
    try {
      const [emailStats, requestStats, healthStats] = await Promise.all([
        this.getEmailStats(),
        this.getRequestStats(),
        this.getHealthSummary()
      ]);

      return {
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        email: emailStats,
        requests: requestStats,
        health: healthStats
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas do sistema:', error);
      return { error: 'Failed to get system stats' };
    }
  }

  private async getEmailStats(): Promise<any> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const stats: any = await this.db('email_metrics')
      .select(
        this.db.raw('SUM(CASE WHEN metric_type = ? THEN count ELSE 0 END) as sent', ['sent']),
        this.db.raw('SUM(CASE WHEN metric_type = ? THEN count ELSE 0 END) as delivered', ['delivered']),
        this.db.raw('SUM(CASE WHEN metric_type = ? THEN count ELSE 0 END) as failed', ['failed'])
      )
      .where('timestamp', '>', since24h)
      .first();

    return {
      last_24h: {
        sent: stats.sent || 0,
        delivered: stats.delivered || 0,
        failed: stats.failed || 0,
        delivery_rate: stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0
      }
    };
  }

  private async getRequestStats(): Promise<any> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const stats: any = await this.db('request_metrics')
      .select(
        this.db.raw('COUNT(*) as total_requests'),
        this.db.raw('AVG(response_time_ms) as avg_response_time'),
        this.db.raw('MAX(response_time_ms) as max_response_time'),
        this.db.raw('MIN(response_time_ms) as min_response_time'),
        this.db.raw('AVG(memory_usage_mb) as avg_memory_usage')
      )
      .where('timestamp', '>', since24h)
      .first();

    return {
      last_24h: {
        total: stats.total_requests || 0,
        avg_response_time: Math.round(stats.avg_response_time || 0),
        max_response_time: Math.round(stats.max_response_time || 0),
        avg_memory_usage: Math.round(stats.avg_memory_usage || 0)
      }
    };
  }

  private async getHealthSummary(): Promise<any> {
    const healthyServices = Array.from(this.healthChecks.values()).filter(h => h.healthy).length;
    const totalServices = this.healthChecks.size;
    
    return {
      healthy_services: healthyServices,
      total_services: totalServices,
      overall_healthy: healthyServices === totalServices,
      services: Object.fromEntries(this.healthChecks.entries())
    };
  }

  private async cleanupOldMetrics(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - this.METRICS_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
      
      // Cleanup database
      const [metricsDeleted, healthDeleted, requestsDeleted, emailDeleted] = await Promise.all([
        this.db('system_metrics').where('timestamp', '<', cutoffTime).del(),
        this.db('health_checks').where('timestamp', '<', cutoffTime).del(),
        this.db('request_metrics').where('timestamp', '<', cutoffTime).del(),
        this.db('email_metrics').where('timestamp', '<', cutoffTime).del()
      ]);

      // Cleanup in-memory metrics
      const cutoffTimestamp = Date.now() - this.METRICS_RETENTION_HOURS * 60 * 60 * 1000;
      for (const [name, values] of this.metrics.entries()) {
        const filteredValues = values.filter(v => v.timestamp > cutoffTimestamp);
        this.metrics.set(name, filteredValues);
      }

      logger.info('Limpeza de métricas antigas concluída', {
        metricsDeleted: metricsDeleted || 0,
        healthDeleted: healthDeleted || 0,
        requestsDeleted: requestsDeleted || 0,
        emailDeleted: emailDeleted || 0
      });

    } catch (error) {
      logger.error('Erro durante limpeza de métricas:', error);
    }
  }

  // Stub methods para compatibilidade (manter métodos existentes)
  initialize() {
    logger.info('MonitoringService initialized');
  }

  shutdown() {
    logger.info('MonitoringService shutdown');
    this.close();
  }

  incrementEmailsSent() {
    this.recordMetric('emails_sent_total', 1);
  }

  incrementEmailsFailed() {
    this.recordMetric('emails_failed_total', 1);
  }

  recordEmailProcessingTime(duration: number) {
    this.recordMetric('email_processing_duration_ms', duration);
  }

  recordDatabaseQueryTime(duration: number) {
    this.recordMetric('database_query_duration_ms', duration);
  }

  recordDatabaseQuery(operation: string, table: string, duration: number) {
    this.recordMetric('database_query_duration_ms', duration, { operation, table });
  }

  incrementHttpRequestsInFlight() {
    this.recordMetric('http_requests_in_flight', 1);
  }

  decrementHttpRequestsInFlight() {
    this.recordMetric('http_requests_in_flight', -1);
  }

  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.recordResponseTime(method, route, statusCode, duration);
  }

  recordHttpRequestDuration(method: string, route: string, statusCode: number, duration: number) {
    this.recordResponseTime(method, route, statusCode, duration);
  }

  recordRedisOperation(operation: string, duration: number) {
    this.recordMetric('redis_operation_duration_ms', duration, { operation });
  }

  recordCacheStats(stats: { hits: number; misses: number; keys: number; ksize: number; vsize: number }) {
    this.recordMetric('cache_hits_total', stats.hits);
    this.recordMetric('cache_misses_total', stats.misses);
    this.recordMetric('cache_keys_count', stats.keys);
    this.recordMetric('cache_memory_kb', (stats.ksize + stats.vsize) / 1024);
  }

  recordCacheOperation(operation: string, duration: number, success: boolean) {
    this.recordMetric('cache_operation_duration_ms', duration, { operation, success: success.toString() });
  }

  recordConnectionPoolAcquisition(poolType: string, duration: number) {
    this.recordMetric('connection_pool_acquisition_duration_ms', duration, { pool_type: poolType });
  }

  recordResponseSize(method: string, route: string, statusCode: number, size: number) {
    this.recordMetric('http_response_size_bytes', size, {
      method,
      route,
      status_code: statusCode.toString()
    });
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

  public async close(): Promise<void> {
    // Parar intervalos
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.metricsCleanupInterval) {
      clearInterval(this.metricsCleanupInterval);
    }

    // Fechar conexão do banco
    try {
      await this.db.destroy();
      logger.info('MonitoringService: Conexão fechada');
    } catch (error) {
      logger.error('Erro ao fechar conexão do MonitoringService:', error);
      throw error;
    }
  }
}

export const monitoringService = new MonitoringService();