import { Application, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './environment';
import { logger } from './logger';
import { performanceMiddleware } from '../middleware/performanceMonitoring';
import { monitoringService } from '../services/monitoringService';
import { securityManager } from '../services/securityManager';
import { performanceMonitor } from '../middleware/performanceMonitoring';
import { Database } from 'sqlite3';

/**
 * Production-ready Express.js configuration
 * Includes security hardening, performance optimizations, and monitoring
 */

export interface ProductionConfig {
  compression: {
    enabled: boolean;
    level: number;
    threshold: number;
    filter: (req: Request, res: Response) => boolean;
  };
  
  security: {
    helmet: {
      contentSecurityPolicy: {
        directives: Record<string, string[]>;
        reportOnly: boolean;
      };
      hsts: {
        maxAge: number;
        includeSubDomains: boolean;
        preload: boolean;
      };
    };
    trustProxy: boolean | number | string;
    rateLimiting: {
      enabled: boolean;
      windowMs: number;
      max: number;
    };
  };
  
  monitoring: {
    performance: boolean;
    health: boolean;
    metrics: boolean;
  };
  
  logging: {
    requests: boolean;
    errors: boolean;
    performance: boolean;
  };
}

class ProductionConfigManager {
  private config: ProductionConfig;
  private shutdownInProgress = false;
  private shutdownTimeout = 30000; // 30 seconds
  private servers: Server[] = [];
  private database: Database | null = null;
  
  constructor() {
    this.config = this.createProductionConfig();
    this.validateEnvironment();
  }
  
  private createProductionConfig(): ProductionConfig {
    const envConfig = env.config;
    
    return {
      compression: {
        enabled: true,
        level: 6, // Balanced compression level
        threshold: 1024, // Only compress responses > 1KB
        filter: (req: Request, res: Response) => {
          // Don't compress responses with this request header
          if (req.headers['x-no-compression']) {
            return false;
          }
          
          // Use compression filter
          return compression.filter(req, res);
        }
      },
      
      security: {
        helmet: {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'", 'https://apis.google.com'],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
              childSrc: ["'none'"],
              workerSrc: ["'none'"],
              manifestSrc: ["'self'"],
              prefetchSrc: ["'self'"],
              upgradeInsecureRequests: []
            },
            reportOnly: envConfig.CSP_REPORT_ONLY
          },
          hsts: {
            maxAge: envConfig.HSTS_MAX_AGE,
            includeSubDomains: true,
            preload: true
          }
        },
        trustProxy: env.getTrustProxyConfig(),
        rateLimiting: {
          enabled: true,
          windowMs: envConfig.RATE_LIMIT_WINDOW_MS,
          max: envConfig.RATE_LIMIT_MAX_REQUESTS
        }
      },
      
      monitoring: {
        performance: envConfig.ENABLE_METRICS,
        health: true,
        metrics: envConfig.ENABLE_METRICS
      },
      
      logging: {
        requests: envConfig.LOG_LEVEL === 'debug',
        errors: true,
        performance: envConfig.ENABLE_METRICS
      }
    };
  }
  
  /**
   * Validate production environment configuration
   */
  private validateEnvironment(): void {
    logger.info('Validating production environment configuration...');

    // Required environment variables
    const requiredEnvVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'DATABASE_URL',
      'SMTP_HOSTNAME',
      'DOMAIN',
      'PUBLIC_URL',
      'NODE_ENV'
    ];

    // Recommended environment variables
    const recommendedEnvVars = [
      'REDIS_HOST',
      'REDIS_PORT',
      'SMTP_HOST',
      'SMTP_PORT',
      'FRONTEND_URL',
      'LOG_LEVEL',
      'API_RATE_LIMIT_WINDOW_MS',
      'API_RATE_LIMIT_MAX_REQUESTS'
    ];

    // Check required variables
    const missingRequired = requiredEnvVars.filter(env => !process.env[env]);
    if (missingRequired.length > 0) {
      logger.error('Missing required environment variables for production', { 
        missing: missingRequired,
        severity: 'CRITICAL' 
      });
      process.exit(1);
    }

    // Check recommended variables
    const missingRecommended = recommendedEnvVars.filter(env => !process.env[env]);
    if (missingRecommended.length > 0) {
      logger.warn('Missing recommended environment variables', { 
        missing: missingRecommended,
        impact: 'Some features may not work optimally'
      });
    }

    // Validate JWT secrets length
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    
    if (jwtSecret && jwtSecret.length < 32) {
      logger.error('JWT_SECRET deve ter pelo menos 32 caracteres para segurança adequada');
      process.exit(1);
    }

    if (jwtRefreshSecret && jwtRefreshSecret.length < 32) {
      logger.error('JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres para segurança adequada');
      process.exit(1);
    }

    // Validate URLs
    try {
      if (process.env.PUBLIC_URL) new URL(process.env.PUBLIC_URL);
      if (process.env.FRONTEND_URL) new URL(process.env.FRONTEND_URL);
    } catch (error) {
      logger.error('URLs inválidas detectadas', { error: error.message });
      process.exit(1);
    }

    // Check if running as root (not recommended)
    if (process.getuid && process.getuid() === 0) {
      logger.warn('Aplicação rodando como root - não recomendado para produção', {
        security: {
          risk: 'HIGH',
          recommendation: 'Use um usuário não-privilegiado'
        }
      });
    }

    logger.info('Environment validation completed successfully');
  }

  /**
   * Configure performance optimizations
   */
  public configurePerformanceOptimizations(): void {
    logger.info('Configuring production performance optimizations...');

    // Configure optimal thread pool size
    const numCPUs = require('os').cpus().length;
    const maxWorkers = Math.min(numCPUs, 8);
    process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || maxWorkers.toString();
    
    // Configure HTTP keep-alive
    const http = require('http');
    http.globalAgent.keepAlive = true;
    http.globalAgent.keepAliveMsecs = 1000;
    http.globalAgent.maxSockets = 50;
    http.globalAgent.maxFreeSockets = 10;

    const https = require('https');
    https.globalAgent.keepAlive = true;
    https.globalAgent.keepAliveMsecs = 1000;
    https.globalAgent.maxSockets = 50;
    https.globalAgent.maxFreeSockets = 10;

    logger.info('Performance optimizations configured', {
      threadPoolSize: process.env.UV_THREADPOOL_SIZE,
      availableCPUs: numCPUs,
      keepAliveEnabled: true
    });
  }

  /**
   * Apply production configuration to Express app
   */
  public async configureApp(app: Application): Promise<void> {
    try {
      logger.info('Applying production configuration...');
      
      // Trust proxy configuration
      if (this.config.security.trustProxy !== false) {
        app.set('trust proxy', this.config.security.trustProxy);
        logger.info('Trust proxy configured', { trustProxy: this.config.security.trustProxy });
      }
      
      // Security headers with Helmet
      await this.configureHelmet(app);
      
      // Compression middleware
      if (this.config.compression.enabled) {
        app.use(compression({
          level: this.config.compression.level,
          threshold: this.config.compression.threshold,
          filter: this.config.compression.filter
        }));
        logger.info('Compression middleware enabled', {
          level: this.config.compression.level,
          threshold: this.config.compression.threshold
        });
      }
      
      // Performance monitoring
      if (this.config.monitoring.performance) {
        app.use(performanceMiddleware);
        logger.info('Performance monitoring enabled');
      }
      
      // Security middleware
      await this.configureSecurityMiddleware(app);
      
      // Health check endpoints
      this.configureHealthEndpoints(app);
      
      // Error handling for production
      this.configureProductionErrorHandler(app);
      
      logger.info('Production configuration applied successfully');
      
    } catch (error) {
      logger.error('Failed to apply production configuration', { error });
      throw error;
    }
  }
  
  private async configureHelmet(app: Application): Promise<void> {
    const helmetConfig = this.config.security.helmet;
    
    app.use(helmet({
      contentSecurityPolicy: {
        directives: helmetConfig.contentSecurityPolicy.directives,
        reportOnly: helmetConfig.contentSecurityPolicy.reportOnly
      },
      hsts: {
        maxAge: helmetConfig.hsts.maxAge,
        includeSubDomains: helmetConfig.hsts.includeSubDomains,
        preload: helmetConfig.hsts.preload
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'same-origin' },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      ieNoOpen: true,
      dnsPrefetchControl: { allow: false },
      crossOriginEmbedderPolicy: false // Disable for API compatibility
    }));
    
    logger.info('Helmet security headers configured', {
      hsts: helmetConfig.hsts,
      cspReportOnly: helmetConfig.contentSecurityPolicy.reportOnly
    });
  }
  
  private async configureSecurityMiddleware(app: Application): Promise<void> {
    // IP validation middleware
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const clientIP = req.ip;
        const validation = await securityManager.validateMXConnection(clientIP);
        
        if (!validation.allowed) {
          logger.warn('Request blocked by security validation', {
            ip: clientIP,
            reason: validation.reason,
            userAgent: req.get('User-Agent')
          });
          
          return res.status(403).json({
            error: 'Access denied',
            message: 'Your request has been blocked for security reasons'
          });
        }
        
        next();
      } catch (error) {
        logger.error('Security middleware error', { error, ip: req.ip });
        next(); // Don't block legitimate requests due to security service errors
      }
    });
    
    logger.info('Security middleware configured');
  }
  
  private configureHealthEndpoints(app: Application): Promise<void> {
    // Detailed health check endpoint
    app.get('/health', async (req: Request, res: Response) => {
      try {
        const healthStatus = await monitoringService.getHealthStatus();
        const systemStats = monitoringService.getSystemStats();
        
        const isHealthy = healthStatus.overall === 'healthy';
        const statusCode = isHealthy ? 200 : 503;
        
        res.status(statusCode).json({
          status: healthStatus.overall,
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          version: process.env.npm_package_version || 'unknown',
          services: healthStatus.services,
          system: systemStats,
          environment: env.config.NODE_ENV
        });
      } catch (error) {
        logger.error('Health check endpoint error', { error });
        res.status(503).json({
          status: 'error',
          message: 'Health check failed',
          error: (error as Error).message
        });
      }
    });
    
    // Simple liveness probe
    app.get('/health/live', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
    });
    
    // Readiness probe
    app.get('/health/ready', async (req: Request, res: Response) => {
      try {
        const healthStatus = await monitoringService.getHealthStatus();
        const isReady = healthStatus.overall !== 'critical';
        
        res.status(isReady ? 200 : 503).json({
          status: isReady ? 'ready' : 'not-ready',
          timestamp: new Date().toISOString(),
          services: healthStatus.services
        });
      } catch (error) {
        res.status(503).json({
          status: 'not-ready',
          error: (error as Error).message
        });
      }
    });
    
    logger.info('Health check endpoints configured');
    return Promise.resolve();
  }
  
  private configureProductionErrorHandler(app: Application): void {
    // 404 handler
    app.use('*', (req: Request, res: Response) => {
      logger.warn('Route not found', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.originalUrl
      });
    });
    
    // Global error handler
    app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled application error', {
        error: error.message,
        stack: env.isDevelopment ? error.stack : undefined,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Don't expose internal errors in production
      const message = env.isProduction ? 'Internal server error' : error.message;
      
      res.status(500).json({
        error: 'Internal Server Error',
        message,
        requestId: (req as any).correlationId || 'unknown'
      });
    });
    
    logger.info('Production error handlers configured');
  }
  
  /**
   * Register servers for graceful shutdown
   */
  public registerServers(servers: Server | Server[], database?: Database): void {
    this.servers = Array.isArray(servers) ? servers : [servers];
    this.database = database || null;
    
    logger.info('Servers registered for graceful shutdown', {
      serverCount: this.servers.length,
      hasDatabaseConnection: !!database
    });
  }

  /**
   * Configure enhanced graceful shutdown handlers
   */
  public configureGracefulShutdown(): void {
    const gracefulShutdown = (signal: string) => {
      if (this.shutdownInProgress) {
        logger.warn(`Received ${signal} during shutdown, forcing exit`);
        process.exit(1);
      }

      this.shutdownInProgress = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      // Set a timeout for forceful shutdown
      const shutdownTimer = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, this.shutdownTimeout);
      
      // Perform graceful shutdown
      this.performGracefulShutdown()
        .then(() => {
          clearTimeout(shutdownTimer);
          logger.info('Graceful shutdown completed successfully');
          process.exit(0);
        })
        .catch((error) => {
          clearTimeout(shutdownTimer);
          logger.error('Error during graceful shutdown', { error: error.message });
          process.exit(1);
        });
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception detected', { 
        error: error.message, 
        stack: error.stack,
        severity: 'CRITICAL'
      });
      
      if (!this.shutdownInProgress) {
        gracefulShutdown('uncaughtException');
      }
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection detected', { 
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: promise.toString(),
        severity: 'HIGH'
      });
      
      if (!this.shutdownInProgress) {
        gracefulShutdown('unhandledRejection');
      }
    });
    
    logger.info('Enhanced graceful shutdown handlers configured');
  }

  /**
   * Execute graceful shutdown sequence
   */
  private async performGracefulShutdown(): Promise<void> {
    const shutdownSteps: Array<{ name: string; action: () => Promise<void> }> = [];

    // 1. Stop accepting new connections
    if (this.servers.length > 0) {
      shutdownSteps.push({
        name: 'Stop accepting new connections',
        action: async () => {
          await Promise.all(
            this.servers.map(server => 
              new Promise<void>((resolve) => {
                server.close(() => resolve());
              })
            )
          );
          logger.info('All servers stopped accepting new connections');
        }
      });
    }

    // 2. Cleanup performance monitor
    shutdownSteps.push({
      name: 'Cleanup performance monitor',
      action: async () => {
        await performanceMonitor.destroy();
        logger.info('Performance monitor cleaned up');
      }
    });

    // 3. Stop monitoring service
    shutdownSteps.push({
      name: 'Shutdown monitoring service',
      action: async () => {
        await monitoringService.close();
        logger.info('Monitoring service shutdown completed');
      }
    });

    // 4. Close database connection
    if (this.database) {
      shutdownSteps.push({
        name: 'Close database connection',
        action: async () => {
          await new Promise<void>((resolve, reject) => {
            this.database!.close((err) => {
              if (err) {
                logger.error('Error closing database connection', { error: err.message });
                reject(err);
              } else {
                logger.info('Database connection closed');
                resolve();
              }
            });
          });
        }
      });
    }

    // 5. Cleanup security manager
    if (securityManager && typeof securityManager.cleanup === 'function') {
      shutdownSteps.push({
        name: 'Cleanup security manager',
        action: async () => {
          await securityManager.cleanup();
          logger.info('Security manager cleaned up');
        }
      });
    }

    // Execute steps sequentially with timeout
    for (const step of shutdownSteps) {
      try {
        logger.info(`Graceful shutdown step: ${step.name}`);
        await Promise.race([
          step.action(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`${step.name} timeout`)), 5000)
          )
        ]);
      } catch (error) {
        logger.error(`Graceful shutdown step failed: ${step.name}`, { 
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with next steps even if one fails
      }
    }
  }

  /**
   * Setup automated health checks
   */
  public setupAutomatedHealthChecks(): void {
    logger.info('Setting up automated health checks...');

    // System health monitoring
    setInterval(async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const memoryUsagePercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

        // Memory alerts
        if (memoryUsagePercent > 90) {
          logger.error('Critical memory usage detected', {
            memoryUsed: `${memoryUsedMB}MB`,
            memoryUsage: `${memoryUsagePercent}%`,
            alert: {
              type: 'HIGH_MEMORY_USAGE',
              severity: 'CRITICAL',
              threshold: '90%'
            }
          });
        } else if (memoryUsagePercent > 80) {
          logger.warn('High memory usage detected', {
            memoryUsed: `${memoryUsedMB}MB`,
            memoryUsage: `${memoryUsagePercent}%`,
            alert: {
              type: 'HIGH_MEMORY_USAGE',
              severity: 'WARNING',
              threshold: '80%'
            }
          });
        }

        // Uptime monitoring
        const uptime = process.uptime();
        if (uptime > 24 * 60 * 60 && uptime < 24 * 60 * 60 + 300) {
          logger.info('Application has been running for 24 hours', {
            uptime: `${Math.round(uptime / 3600)}h`,
            recommendation: 'Consider scheduled restart for optimal performance'
          });
        }

      } catch (error) {
        logger.error('Error during automated health check', { error: error.message });
      }
    }, 60000); // Every minute

    logger.info('Automated health checks configured');
  }
  
  /**
   * Get comprehensive production configuration
   */
  public getProductionConfig() {
    return {
      environment: process.env.NODE_ENV,
      port: process.env.PORT || 3001,
      httpsPort: process.env.HTTPS_PORT || 443,
      domain: process.env.DOMAIN,
      publicUrl: process.env.PUBLIC_URL,
      frontendUrl: process.env.FRONTEND_URL,
      database: {
        url: process.env.DATABASE_URL,
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10')
      },
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD ? '[REDACTED]' : undefined,
        db: parseInt(process.env.REDIS_DB || '0')
      },
      smtp: {
        hostname: process.env.SMTP_HOSTNAME,
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        username: process.env.SMTP_USERNAME,
        secure: process.env.SMTP_SECURE === 'true'
      },
      security: {
        jwtSecret: process.env.JWT_SECRET ? '[REDACTED]' : undefined,
        jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ? '[REDACTED]' : undefined,
        rateLimiting: {
          windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000'),
          maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '1000')
        }
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json'
      },
      monitoring: {
        enabled: true,
        metricsPath: '/metrics',
        healthPath: '/health'
      }
    };
  }

  /**
   * Get current production configuration
   */
  public getConfig(): ProductionConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const productionConfig = new ProductionConfigManager();

// Helper function to quickly apply complete production configuration
export async function configureProductionApp(
  app: Application, 
  servers?: Server | Server[], 
  database?: Database
): Promise<void> {
  // Apply performance optimizations
  productionConfig.configurePerformanceOptimizations();
  
  // Configure the Express app
  await productionConfig.configureApp(app);
  
  // Register servers for graceful shutdown
  if (servers) {
    productionConfig.registerServers(servers, database);
  }
  
  // Setup graceful shutdown handlers
  productionConfig.configureGracefulShutdown();
  
  // Setup automated health checks
  productionConfig.setupAutomatedHealthChecks();
  
  logger.info('Complete production configuration applied', {
    hasServers: !!servers,
    hasDatabase: !!database,
    environment: process.env.NODE_ENV
  });
}