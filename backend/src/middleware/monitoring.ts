import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../services/monitoringService';
import { logger } from '../config/logger';

interface MonitoringRequest extends Request {
  startTime?: number;
  requestId?: string;
  userId?: string;
}

/**
 * Middleware para instrumentação de métricas Prometheus
 */
export const metricsMiddleware = () => {
  return (req: MonitoringRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    req.startTime = startTime;

    // Incrementar contador de requests em andamento
    monitoringService.incrementHttpRequestsInFlight();

    // Capturar o final da resposta
    const originalEnd = res.end;
    res.end = function(this: Response, ...args: any[]) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Extrair informações da requisição
      const method = req.method;
      const route = req.route?.path || req.path || 'unknown';
      const statusCode = res.statusCode;
      const userId = req.userId || (req as any).user?.id;

      // Registrar métricas
      monitoringService.recordHttpRequest(method, route, statusCode, userId);
      monitoringService.recordHttpRequestDuration(method, route, statusCode, duration);
      monitoringService.decrementHttpRequestsInFlight();

      // Log estruturado para requisições
      logger.info('HTTP Request completed', {
        requestId: req.requestId,
        userId: req.userId,
        method,
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        performance: {
          responseTime: duration,
          memoryUsage: process.memoryUsage()
        }
      });

      return originalEnd.apply(this, args);
    };

    next();
  };
};

/**
 * Middleware para health check endpoint
 */
export const healthCheckMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      try {
        const healthStatus = await monitoringService.getHealthStatus();
        
        const statusCode = healthStatus.overall ? 200 : 503;
        
        res.status(statusCode).json({
          status: healthStatus.overall ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: healthStatus.services,
          version: process.env.APP_VERSION || '1.0.0',
          uptime: process.uptime(),
          environment: process.env.NODE_ENV || 'development'
        });
        
        return;
      } catch (error) {
        logger.error('Health check failed', { error });
        
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        return;
      }
    }

    next();
  };
};

/**
 * Middleware para endpoint de métricas Prometheus
 */
export const metricsEndpointMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/metrics') {
      try {
        const metrics = monitoringService.getMetrics();
        
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics);
        
        return;
      } catch (error) {
        logger.error('Failed to generate metrics', { error });
        
        res.status(500).json({
          error: 'Failed to generate metrics',
          timestamp: new Date().toISOString()
        });
        
        return;
      }
    }

    next();
  };
};

/**
 * Middleware para instrumentação de operações de banco de dados
 */
export const databaseMetricsMiddleware = (operation: string, table: string) => {
  return (next: Function) => {
    return async (...args: any[]) => {
      const startTime = Date.now();
      
      try {
        const result = await next(...args);
        const duration = Date.now() - startTime;
        
        monitoringService.recordDatabaseQuery(operation, table, duration);
        
        // Log para queries lentas (> 1 segundo)
        if (duration > 1000) {
          logger.warn('Slow database query detected', {
            operation,
            table,
            duration: `${duration}ms`,
            performance: {
              queryTime: duration
            }
          });
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        monitoringService.recordDatabaseQuery(`${operation}_error`, table, duration);
        
        logger.error('Database query failed', {
          operation,
          table,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        throw error;
      }
    };
  };
};

/**
 * Middleware para instrumentação de operações Redis
 */
export const redisMetricsMiddleware = (operation: string) => {
  return (next: Function) => {
    return async (...args: any[]) => {
      const startTime = Date.now();
      
      try {
        const result = await next(...args);
        const duration = Date.now() - startTime;
        
        monitoringService.recordRedisOperation(operation, duration);
        
        // Log para operações lentas (> 500ms)
        if (duration > 500) {
          logger.warn('Slow Redis operation detected', {
            operation,
            duration: `${duration}ms`,
            performance: {
              operationTime: duration
            }
          });
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        monitoringService.recordRedisOperation(`${operation}_error`, duration);
        
        logger.error('Redis operation failed', {
          operation,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        throw error;
      }
    };
  };
};

/**
 * Middleware para rate limiting com métricas
 */
export const rateLimitMetricsMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    
    res.json = function(obj: any) {
      // Se for um erro de rate limit, registrar métrica
      if (res.statusCode === 429) {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent'),
          security: {
            action: 'rate_limit_exceeded',
            outcome: 'blocked',
            riskLevel: 'medium'
          }
        });
      }
      
      return originalJson.call(this, obj);
    };
    
    next();
  };
};

/**
 * Wrapper para funções que devem ser instrumentadas
 */
export const instrumentFunction = <T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  options: {
    recordMetrics?: boolean;
    logErrors?: boolean;
    logSlowOperations?: boolean;
    slowThreshold?: number;
  } = {}
): T => {
  const {
    recordMetrics = true,
    logErrors = true,
    logSlowOperations = true,
    slowThreshold = 1000
  } = options;

  return ((...args: any[]) => {
    const startTime = Date.now();
    
    try {
      const result = fn(...args);
      
      // Se for uma Promise, instrumentar o resultado
      if (result instanceof Promise) {
        return result
          .then((value) => {
            const duration = Date.now() - startTime;
            
            if (logSlowOperations && duration > slowThreshold) {
              logger.warn(`Slow operation detected: ${name}`, {
                operation: name,
                duration: `${duration}ms`,
                performance: {
                  operationTime: duration
                }
              });
            }
            
            return value;
          })
          .catch((error) => {
            const duration = Date.now() - startTime;
            
            if (logErrors) {
              logger.error(`Operation failed: ${name}`, {
                operation: name,
                duration: `${duration}ms`,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
            
            throw error;
          });
      }
      
      // Para operações síncronas
      const duration = Date.now() - startTime;
      
      if (logSlowOperations && duration > slowThreshold) {
        logger.warn(`Slow operation detected: ${name}`, {
          operation: name,
          duration: `${duration}ms`,
          performance: {
            operationTime: duration
          }
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (logErrors) {
        logger.error(`Operation failed: ${name}`, {
          operation: name,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      throw error;
    }
  }) as T;
};