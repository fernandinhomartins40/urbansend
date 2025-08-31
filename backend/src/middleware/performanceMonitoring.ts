import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
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

  constructor() {
    this.startCleanupInterval();
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

  public destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
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

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, cleaning up performance monitor...');
  performanceMonitor.destroy();
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, cleaning up performance monitor...');
  performanceMonitor.destroy();
});