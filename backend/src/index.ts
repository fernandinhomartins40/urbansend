/**
 * UltraZend Enterprise API Server
 * 
 * Production-ready Node.js/Express application with:
 * - Enterprise-grade architecture and middleware chain
 * - Comprehensive security, logging, and monitoring
 * - Environment-aware configuration management
 * - Robust error handling and graceful shutdown
 * - Health checks and observability
 * - Performance optimization and rate limiting
 * 
 * @version 1.0.0
 * @author UltraZend Engineering Team
 */

import express, { Application } from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import path from 'path';

// Enterprise Configuration and Environment
import { env } from './config/environment';
import { logger, httpLoggerMiddleware } from './config/logger.enterprise';

// Enterprise Middleware Suite
import { correlationIdMiddleware, CorrelatedRequest } from './middleware/correlationId';
import { 
  generalRateLimit, 
  authRateLimit, 
  registrationRateLimit,
  passwordResetRateLimit,
  verificationResendRateLimit,
  emailSendRateLimit,
  apiKeyRateLimit
} from './middleware/rateLimiting.enterprise';
import { 
  errorHandler, 
  notFoundHandler, 
  setupGlobalErrorHandlers,
  asyncHandler 
} from './middleware/errorHandler.enterprise';
import {
  healthCheck,
  livenessCheck,
  readinessCheck,
  trackRequestMetrics
} from './middleware/healthCheck.enterprise';
import {
  securityMiddleware,
  sanitizeRequest,
  additionalSecurityHeaders,
  attackDetection,
  ipFilter,
  requestSizeLimit,
  cspViolationReporter
} from './middleware/security.enterprise';

// Standard Middleware
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Database and Services
import db from './config/database';
import { setupSwagger } from './config/swagger';
import UltraZendSMTPServer from './services/smtpServer';
import SMTPDeliveryService from './services/smtpDelivery';
import './services/queueService'; // Initialize queue processors

// Application Routes
import authRoutes from './routes/auth';
import keysRoutes from './routes/keys';
import emailsRoutes from './routes/emails';
import templatesRoutes from './routes/templates';
import domainsRoutes from './routes/domains';
import analyticsRoutes from './routes/analytics';
import webhooksRoutes from './routes/webhooks';
import dnsRoutes from './routes/dns';

/**
 * Enterprise Application Class
 * Encapsulates the entire application lifecycle with proper separation of concerns
 */
class UltraZendServer {
  private app: Application;
  private httpServer: any;
  private httpsServer: any;
  private redirectServer: any;
  private io: SocketIOServer;
  private smtpServer: UltraZendSMTPServer;
  private smtpDelivery: SMTPDeliveryService;
  
  constructor() {
    // Initialize environment configuration first
    env.initialize();
    env.validateCriticalConfig();
    
    // Setup global error handlers
    setupGlobalErrorHandlers();
    
    // Initialize Express application
    this.app = express();
    
    // Configure application
    this.configureApplication();
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
    
    // Initialize servers and services
    this.initializeServers();
    this.initializeServices();
    
    logger.info('UltraZend Server initialized successfully', {
      environment: env.config.NODE_ENV,
      version: process.env.npm_package_version,
      node: process.version,
      platform: process.platform
    });
  }
  
  /**
   * Configure Express application settings
   */
  private configureApplication(): void {
    // Trust proxy configuration for proper IP detection and security
    const trustProxyConfig = env.getTrustProxyConfig();
    this.app.set('trust proxy', trustProxyConfig);
    
    // Disable x-powered-by header for security
    this.app.disable('x-powered-by');
    
    // Set view engine (if needed for emails/templates)
    this.app.set('view engine', 'ejs');
    
    // Configure Express settings
    this.app.set('env', env.config.NODE_ENV);
    this.app.set('case sensitive routing', true);
    this.app.set('strict routing', false);
    
    logger.info('Application configuration completed', {
      trustProxy: trustProxyConfig,
      environment: env.config.NODE_ENV
    });
  }
  
  /**
   * Configure middleware chain in optimal order
   * Order is critical for security and functionality
   */
  private configureMiddleware(): void {
    logger.info('Configuring middleware chain...');
    
    // 1. CORRELATION ID - Must be first to track all requests
    this.app.use(correlationIdMiddleware);
    
    // 2. REQUEST METRICS TRACKING
    this.app.use(trackRequestMetrics);
    
    // 3. SECURITY MIDDLEWARE - Early security filtering
    this.app.use(ipFilter);
    this.app.use(attackDetection);
    this.app.use(requestSizeLimit('10mb'));
    
    // 4. HELMET SECURITY HEADERS
    this.app.use(securityMiddleware());
    this.app.use(additionalSecurityHeaders);
    
    // 5. CORS CONFIGURATION - After security, before rate limiting
    const corsConfig = env.getCorsConfig();
    this.app.use('/api', cors(corsConfig));
    
    // 6. GENERAL RATE LIMITING - Apply to all requests
    this.app.use(generalRateLimit);
    
    // 7. REQUEST PARSING MIDDLEWARE
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        // Store raw body for webhook signature verification
        (req as any).rawBody = buf.toString('utf8');
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));
    
    // 8. COOKIE PARSING - After body parsing
    this.app.use(cookieParser(env.config.COOKIE_SECRET));
    
    // 9. REQUEST SANITIZATION - After parsing, before routes
    this.app.use(sanitizeRequest);
    
    // 10. HTTP REQUEST LOGGING - After all parsing
    this.app.use(httpLoggerMiddleware);
    
    logger.info('Middleware chain configured successfully');
  }
  
  /**
   * Configure application routes with proper organization
   */
  private configureRoutes(): void {
    logger.info('Configuring application routes...');
    
    // Health Check Endpoints (no rate limiting for monitoring)
    this.app.get('/health', asyncHandler(healthCheck));
    this.app.get('/health/live', asyncHandler(livenessCheck));
    this.app.get('/health/ready', asyncHandler(readinessCheck));
    
    // Security Reporting Endpoints
    this.app.post('/api/security/csp-report', 
      express.json({ type: 'application/csp-report' }), 
      cspViolationReporter
    );
    
    // API Routes with specific rate limiting
    this.app.use('/api/auth/login', authRateLimit);
    this.app.use('/api/auth/register', registrationRateLimit);
    this.app.use('/api/auth/forgot-password', passwordResetRateLimit);
    this.app.use('/api/auth/reset-password', passwordResetRateLimit);
    this.app.use('/api/auth/resend-verification', verificationResendRateLimit);
    
    // Email sending endpoints
    this.app.use('/api/emails/send', emailSendRateLimit);
    
    // API key endpoints
    this.app.use('/api/keys', apiKeyRateLimit);
    
    // Main API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/keys', keysRoutes);
    this.app.use('/api/emails', emailsRoutes);
    this.app.use('/api/templates', templatesRoutes);
    this.app.use('/api/domains', domainsRoutes);
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api/webhooks', webhooksRoutes);
    this.app.use('/api/dns', dnsRoutes);
    
    // API Documentation (only if enabled)
    if (env.config.ENABLE_SWAGGER) {
      setupSwagger(this.app);
      logger.info('API documentation enabled at /api-docs');
    }
    
    // Static file serving and SPA routing
    this.configureStaticServing();
    
    logger.info('Routes configured successfully');
  }
  
  /**
   * Configure static file serving and SPA routing
   */
  private configureStaticServing(): void {
    if (env.isProduction) {
      const frontendPath = path.resolve(__dirname, '../../frontend');
      
      if (fs.existsSync(frontendPath)) {
        logger.info(`Serving frontend from: ${frontendPath}`);
        
        // Serve static files with caching headers
        this.app.use(express.static(frontendPath, {
          maxAge: '1d',
          etag: true,
          lastModified: true,
          setHeaders: (res, path) => {
            if (path.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
          }
        }));
        
        // SPA routing - serve index.html for non-API routes
        this.app.get('*', (req, res) => {
          // Don't serve index.html for API routes or health checks
          if (req.path.startsWith('/api/') || 
              req.path.startsWith('/health') || 
              req.path.startsWith('/docs')) {
            return; // Let it fall through to 404 handler
          }
          
          const indexPath = path.join(frontendPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).json({ 
              error: 'Frontend not found', 
              message: 'Frontend files not available' 
            });
          }
        });
      } else {
        logger.warn(`Frontend directory not found at: ${frontendPath}`);
        
        // Fallback route for missing frontend
        this.app.get('/', (req, res) => {
          res.json({
            name: 'UltraZend API Server',
            version: process.env.npm_package_version,
            status: 'OK',
            environment: env.config.NODE_ENV,
            frontend: 'Not available - frontend files not found',
            endpoints: {
              api: '/api/',
              docs: env.config.ENABLE_SWAGGER ? '/api-docs' : 'disabled',
              health: '/health'
            },
            timestamp: new Date().toISOString()
          });
        });
      }
    } else {
      // Development mode - show API info
      this.app.get('/', (req, res) => {
        res.json({
          name: 'UltraZend API Server',
          version: process.env.npm_package_version,
          status: 'OK',
          mode: 'development',
          environment: env.config.NODE_ENV,
          endpoints: {
            api: '/api/',
            docs: '/api-docs',
            health: '/health'
          },
          configuration: {
            cors: env.getCorsConfig().origin,
            rateLimit: env.getRateLimitConfig(),
            database: !!env.config.DATABASE_URL,
            smtp: !!env.config.SMTP_HOST
          },
          timestamp: new Date().toISOString()
        });
      });
    }
  }
  
  /**
   * Configure error handling middleware (must be last)
   */
  private configureErrorHandling(): void {
    // 404 handler for unmatched routes
    this.app.use(notFoundHandler);
    
    // Global error handler (must be last middleware)
    this.app.use(errorHandler);
    
    logger.info('Error handling configured');
  }
  
  /**
   * Initialize HTTP/HTTPS servers and WebSocket
   */
  private initializeServers(): void {
    const config = env.config;
    
    if (env.isProduction) {
      try {
        // Load SSL certificates
        const sslOptions = {
          key: fs.readFileSync(config.SSL_KEY_PATH || '/etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem'),
          cert: fs.readFileSync(config.SSL_CERT_PATH || '/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem')
        };
        
        // Create HTTPS server
        this.httpsServer = createHttpsServer(sslOptions, this.app);
        
        // Create HTTP server for internal access
        this.httpServer = createServer(this.app);
        
        // Create HTTP to HTTPS redirect server
        this.redirectServer = createServer((req, res) => {
          const host = req.headers.host?.replace(/:\\d+/, '');
          const redirectUrl = `https://${host}${req.url}`;
          
          res.writeHead(301, { 
            'Location': redirectUrl,
            'Content-Type': 'text/plain'
          });
          res.end(`Redirecting to ${redirectUrl}`);
        });
        
        // Initialize WebSocket on HTTPS server
        this.io = new SocketIOServer(this.httpsServer, {
          cors: env.getCorsConfig(),
          transports: ['websocket', 'polling'],
          pingTimeout: 60000,
          pingInterval: 25000
        });
        
        logger.info('HTTPS server configuration completed');
        
      } catch (error) {
        logger.error('SSL certificates not found, using HTTP only', { error });
        
        // Fallback to HTTP only
        this.httpServer = createServer(this.app);
        this.io = new SocketIOServer(this.httpServer, {
          cors: env.getCorsConfig()
        });
      }
    } else {
      // Development: HTTP only
      this.httpServer = createServer(this.app);
      this.io = new SocketIOServer(this.httpServer, {
        cors: env.getCorsConfig()
      });
    }
    
    // Configure WebSocket connection handling
    this.configureWebSocket();
    
    // Make io available to routes
    this.app.set('io', this.io);
  }
  
  /**
   * Configure WebSocket connection handling
   */
  private configureWebSocket(): void {
    this.io.on('connection', (socket) => {
      const clientInfo = {
        socketId: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        timestamp: new Date().toISOString()
      };
      
      logger.info('WebSocket client connected', clientInfo);
      
      // Handle authentication if needed
      socket.on('authenticate', (token) => {
        // Implement JWT authentication for WebSocket if needed
        logger.debug('WebSocket authentication attempt', { 
          socketId: socket.id,
          hasToken: !!token 
        });
      });
      
      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          ...clientInfo,
          reason,
          disconnectedAt: new Date().toISOString()
        });
      });
      
      // Handle errors
      socket.on('error', (error) => {
        logger.error('WebSocket error', {
          ...clientInfo,
          error: error.message
        });
      });
    });
  }
  
  /**
   * Initialize SMTP and email services
   */
  private initializeServices(): void {
    this.smtpServer = new UltraZendSMTPServer();
    this.smtpDelivery = new SMTPDeliveryService();
    
    logger.info('Services initialized');
  }
  
  /**
   * Start the server and all services
   */
  public async start(): Promise<void> {
    try {
      // Test database connection first
      await this.testDatabaseConnection();
      
      // Run database migrations
      await this.runDatabaseMigrations();
      
      // Start HTTP/HTTPS servers
      await this.startHttpServers();
      
      // Start SMTP server
      await this.startSMTPServer();
      
      // Start background services
      this.startBackgroundServices();
      
      logger.info('🚀 UltraZend Server started successfully', {
        environment: env.config.NODE_ENV,
        ports: {
          http: env.config.PORT,
          https: env.config.HTTPS_PORT
        },
        features: {
          ssl: !!this.httpsServer,
          websocket: true,
          smtp: true,
          swagger: env.config.ENABLE_SWAGGER
        }
      });
      
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }
  
  /**
   * Test database connection
   */
  private async testDatabaseConnection(): Promise<void> {
    try {
      await db.raw('SELECT 1');
      logger.info('✅ Database connection successful');
    } catch (error) {
      logger.error('❌ Database connection failed', { error });
      throw error;
    }
  }
  
  /**
   * Run database migrations
   */
  private async runDatabaseMigrations(): Promise<void> {
    try {
      const [batchNo, migrations] = await db.migrate.latest();
      logger.info('Database migrations completed', { 
        batch: batchNo,
        migrationsRun: migrations.length 
      });
    } catch (error) {
      logger.error('Database migrations failed', { error });
      throw error;
    }
  }
  
  /**
   * Start HTTP and HTTPS servers
   */
  private async startHttpServers(): Promise<void> {
    const config = env.config;
    
    return new Promise((resolve, reject) => {
      let serversStarted = 0;
      const totalServers = this.httpsServer ? 3 : 1; // HTTP, HTTPS, Redirect OR just HTTP
      
      const checkComplete = () => {
        serversStarted++;
        if (serversStarted === totalServers) {
          resolve();
        }
      };
      
      if (this.httpsServer) {
        // Start HTTPS server
        this.httpsServer.listen(config.HTTPS_PORT, (err: any) => {
          if (err) return reject(err);
          logger.info(`🔒 HTTPS Server listening on port ${config.HTTPS_PORT}`);
          checkComplete();
        });
        
        // Start HTTP server (internal access)
        this.httpServer.listen(config.PORT, (err: any) => {
          if (err) return reject(err);
          logger.info(`🔧 HTTP Server (internal) listening on port ${config.PORT}`);
          checkComplete();
        });
        
        // Start HTTP redirect server
        this.redirectServer.listen(80, (err: any) => {
          if (err) return reject(err);
          logger.info(`↩️  HTTP Redirect Server listening on port 80`);
          checkComplete();
        });
        
      } else {
        // Start HTTP server only
        this.httpServer.listen(config.PORT, (err: any) => {
          if (err) return reject(err);
          logger.info(`🚀 HTTP Server listening on port ${config.PORT}`);
          checkComplete();
        });
      }
    });
  }
  
  /**
   * Start SMTP server
   */
  private async startSMTPServer(): Promise<void> {
    try {
      await this.smtpServer.start();
      logger.info('📧 SMTP Server started successfully');
    } catch (error) {
      logger.error('Failed to start SMTP server', { error });
      // Don't fail the entire application if SMTP fails
    }
  }
  
  /**
   * Start background services
   */
  private startBackgroundServices(): void {
    // Email queue processor
    const processEmailQueue = async () => {
      try {
        await this.smtpDelivery.processEmailQueue();
      } catch (error) {
        logger.error('Email queue processing error', { error });
      }
    };
    
    setInterval(processEmailQueue, 30000); // Every 30 seconds
    logger.info('📬 Email queue processor started (30s intervals)');
    
    // Health check scheduling (if needed)
    // Additional background tasks can be added here
  }
  
  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Initiating graceful shutdown...');
    
    const shutdownPromises: Promise<void>[] = [];
    
    // Close HTTP servers
    if (this.httpServer) {
      shutdownPromises.push(new Promise(resolve => {
        this.httpServer.close(() => {
          logger.info('HTTP Server closed');
          resolve();
        });
      }));
    }
    
    if (this.httpsServer) {
      shutdownPromises.push(new Promise(resolve => {
        this.httpsServer.close(() => {
          logger.info('HTTPS Server closed');
          resolve();
        });
      }));
    }
    
    if (this.redirectServer) {
      shutdownPromises.push(new Promise(resolve => {
        this.redirectServer.close(() => {
          logger.info('Redirect Server closed');
          resolve();
        });
      }));
    }
    
    // Close WebSocket server
    if (this.io) {
      shutdownPromises.push(new Promise(resolve => {
        this.io.close(() => {
          logger.info('WebSocket Server closed');
          resolve();
        });
      }));
    }
    
    // Wait for all servers to close
    await Promise.all(shutdownPromises);
    
    // Close database connections
    await db.destroy();
    logger.info('Database connections closed');
    
    logger.info('✅ Graceful shutdown completed');
  }
}

// Create and start the server
const server = new UltraZendServer();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal');
  await server.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal');
  await server.shutdown();
  process.exit(0);
});

// Start the server
server.start().catch(error => {
  logger.error('Failed to start UltraZend Server', { error });
  process.exit(1);
});

// Export for testing
export { server as ultraZendServer };