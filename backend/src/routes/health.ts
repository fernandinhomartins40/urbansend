import { Router, Request, Response } from 'express';
import { logger } from '../config/logger';
import db from '../config/database';
import { Env } from '../utils/env';
import IORedis from 'ioredis';
import { performanceReportMiddleware } from '../middleware/performanceMonitoring';

const router = Router();

interface HealthCheck {
  service: string;
  status: 'healthy' | 'warning' | 'critical';
  message?: string;
  responseTime?: number;
  details?: any;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  uptime: number;
  version: string;
  buildNumber: string;
  services: HealthCheck[];
  metrics: {
    memory: {
      used: number;
      free: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    database: {
      connections: number;
      responseTime: number;
    };
    queue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
}

// Helper function to check database health
async function checkDatabaseHealth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await db.raw('SELECT 1');
    const responseTime = Date.now() - start;
    
    return {
      service: 'database',
      status: responseTime < 100 ? 'healthy' : 'warning',
      message: `Database responding in ${responseTime}ms`,
      responseTime,
      details: {
        type: 'sqlite3',
        connectionPool: true
      }
    };
  } catch (error) {
    return {
      service: 'database',
      status: 'critical',
      message: `Database connection failed: ${(error as Error).message}`,
      responseTime: Date.now() - start
    };
  }
}

// Helper function to check Redis health
async function checkRedisHealth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const redis = new IORedis({
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getNumber('REDIS_PORT', 6379),
      db: Env.getNumber('REDIS_DB', 0),
      connectTimeout: 5000,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });

    await redis.ping();
    const responseTime = Date.now() - start;
    
    const info = await redis.info('memory');
    await redis.disconnect();
    
    return {
      service: 'redis',
      status: responseTime < 50 ? 'healthy' : 'warning',
      message: `Redis responding in ${responseTime}ms`,
      responseTime,
      details: {
        memory: info.includes('used_memory:') ? info.match(/used_memory:(\d+)/)?.[1] : 'unknown'
      }
    };
  } catch (error) {
    return {
      service: 'redis',
      status: 'warning',
      message: `Redis connection failed: ${(error as Error).message}`,
      responseTime: Date.now() - start,
      details: {
        note: 'Redis is optional for basic functionality'
      }
    };
  }
}

// Helper function to check SMTP health
async function checkSMTPHealth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Import SMTP service dynamically to avoid circular dependencies
    const { default: SMTPDelivery } = await import('../services/smtpDelivery');
    const smtpDelivery = new SMTPDelivery();
    
    // Test SMTP connection without sending email
    const testResult = await smtpDelivery.testConnection();
    const responseTime = Date.now() - start;
    
    return {
      service: 'smtp',
      status: testResult ? 'healthy' : 'warning',
      message: testResult ? `SMTP server accessible in ${responseTime}ms` : 'SMTP connection test failed',
      responseTime,
      details: {
        hostname: Env.get('SMTP_HOSTNAME', 'localhost'),
        port: Env.get('SMTP_SERVER_PORT', '25')
      }
    };
  } catch (error) {
    return {
      service: 'smtp',
      status: 'warning',
      message: `SMTP health check failed: ${(error as Error).message}`,
      responseTime: Date.now() - start
    };
  }
}

// Helper function to check DKIM health
async function checkDKIMHealth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { default: DKIMService } = await import('../services/dkimService');
    const dkimService = new DKIMService();
    
    // Test DKIM key generation and signing
    const dnsRecord = dkimService.getDNSRecord();
    const publicKey = dkimService.getDKIMPublicKey();
    
    const responseTime = Date.now() - start;
    
    return {
      service: 'dkim',
      status: publicKey.length > 200 ? 'healthy' : 'warning',
      message: `DKIM service ready in ${responseTime}ms`,
      responseTime,
      details: {
        selector: Env.get('DKIM_SELECTOR', 'default'),
        domain: Env.get('DKIM_DOMAIN', 'localhost'),
        keyLength: publicKey.length,
        dnsRecord: dnsRecord.name
      }
    };
  } catch (error) {
    return {
      service: 'dkim',
      status: 'critical',
      message: `DKIM service failed: ${(error as Error).message}`,
      responseTime: Date.now() - start
    };
  }
}

// Helper function to get system metrics
function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
  const usedMemory = memoryUsage.heapUsed;
  
  return {
    memory: {
      used: Math.round(usedMemory / 1024 / 1024), // MB
      free: Math.round((totalMemory - usedMemory) / 1024 / 1024), // MB
      total: Math.round(totalMemory / 1024 / 1024), // MB
      percentage: Math.round((usedMemory / totalMemory) * 100)
    },
    cpu: {
      usage: process.cpuUsage().system / 1000000 // Convert to seconds
    },
    database: {
      connections: 1, // SQLite is single connection
      responseTime: 0 // Will be updated by database health check
    },
    queue: {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    }
  };
}

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns comprehensive health status of all ULTRAZEND services
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, critical]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Uptime in seconds
 *                 version:
 *                   type: string
 *                 services:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       service:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [healthy, warning, critical]
 *                       message:
 *                         type: string
 *                       responseTime:
 *                         type: number
 *       503:
 *         description: System is unhealthy
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    logger.info('Health check requested', {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    // Run all health checks in parallel
    const healthChecks = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkSMTPHealth(),
      checkDKIMHealth()
    ]);

    const services: HealthCheck[] = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceNames = ['database', 'redis', 'smtp', 'dkim'];
        return {
          service: serviceNames[index],
          status: 'critical' as const,
          message: `Health check failed: ${result.reason?.message || 'Unknown error'}`
        };
      }
    });

    // Update database response time in metrics
    const metrics = getSystemMetrics();
    const dbHealthCheck = services.find(s => s.service === 'database');
    if (dbHealthCheck?.responseTime) {
      metrics.database.responseTime = dbHealthCheck.responseTime;
    }

    // Determine overall system health
    let systemStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    const criticalServices = services.filter(s => s.status === 'critical');
    const warningServices = services.filter(s => s.status === 'warning');
    
    if (criticalServices.length > 0) {
      // Database or DKIM critical = system critical
      if (criticalServices.some(s => ['database', 'dkim'].includes(s.service))) {
        systemStatus = 'critical';
      } else {
        systemStatus = 'degraded';
      }
    } else if (warningServices.length > 0) {
      systemStatus = 'degraded';
    }

    const healthResponse: SystemHealth = {
      status: systemStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: Env.get('APP_VERSION', '1.0.0'),
      buildNumber: Env.get('BUILD_NUMBER', 'unknown'),
      services,
      metrics
    };

    const responseTime = Date.now() - startTime;
    
    // Log health check result
    logger.info('Health check completed', {
      status: systemStatus,
      responseTime,
      criticalServices: criticalServices.length,
      warningServices: warningServices.length,
      totalServices: services.length
    });

    // Set appropriate HTTP status code
    const httpStatus = systemStatus === 'healthy' ? 200 : 
                      systemStatus === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(healthResponse);

  } catch (error) {
    logger.error('Health check failed completely', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });

    const errorResponse: SystemHealth = {
      status: 'critical',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: Env.get('APP_VERSION', '1.0.0'),
      buildNumber: Env.get('BUILD_NUMBER', 'unknown'),
      services: [{
        service: 'system',
        status: 'critical',
        message: `System health check failed: ${(error as Error).message}`
      }],
      metrics: getSystemMetrics()
    };

    res.status(503).json(errorResponse);
  }
});

/**
 * @swagger
 * /api/health/simple:
 *   get:
 *     summary: Simple health check
 *     description: Returns a simple OK response for basic monitoring
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 */
router.get('/simple', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

/**
 * @swagger
 * /api/health/readiness:
 *   get:
 *     summary: Readiness probe
 *     description: Returns ready status when service is ready to accept traffic
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/readiness', async (req: Request, res: Response) => {
  try {
    // Check if critical services are ready
    await db.raw('SELECT 1');
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      reason: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/health/liveness:
 *   get:
 *     summary: Liveness probe
 *     description: Returns alive status to indicate service is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/liveness', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: Math.floor(process.uptime())
  });
});

/**
 * @swagger
 * /api/health/metrics:
 *   get:
 *     summary: Performance metrics
 *     description: Returns performance metrics and system statistics
 *     tags: [Health]
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: integer
 *           default: 60
 *         description: Time range in minutes for metrics calculation
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeRange:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 health:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 metrics:
 *                   type: object
 */
router.get('/metrics', performanceReportMiddleware);

export default router;