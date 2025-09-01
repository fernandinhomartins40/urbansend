import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

// import 'reflect-metadata'; // Required for Inversify
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { performanceMiddleware, performanceMonitor } from './middleware/performanceMonitoring';
import { metricsMiddleware, healthCheckMiddleware, metricsEndpointMiddleware } from './middleware/monitoring';
import { monitoringService } from './services/monitoringService';
// import { configureProductionApp } from './config/production';
// import { EmailServiceFactory } from './services/EmailServiceFactory';
import { logger } from './config/logger';
import { setupSwagger } from './config/swagger';
import { Env } from './utils/env';
import db from './config/database';
import UltraZendSMTPServer from './services/smtpServer';
import { SMTPDeliveryService } from './services/smtpDelivery';
import './services/queueService'; // Initialize queue processors

// Routes
import authRoutes from './routes/auth';
import keysRoutes from './routes/keys';
import emailsRoutes from './routes/emails';
import templatesRoutes from './routes/templates';
import domainsRoutes from './routes/domains';
import analyticsRoutes from './routes/analytics';
import webhooksRoutes from './routes/webhooks';
import dnsRoutes from './routes/dns';
import healthRoutes from './routes/health';

// Load environment variables from configs directory
const configPath = path.resolve(process.cwd(), 'configs', '.env.production');
dotenv.config({ path: configPath });

// Fallback to development if production config doesn't exist
if (process.env.NODE_ENV !== 'production') {
  dotenv.config(); // This loads .env from root for development
}

// CORS allowed origins - load from environment variables for security
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
  [
    ...(Env.isDevelopment ? ['http://localhost:5173', 'http://localhost:3000'] : []),
    'https://ultrazend.com.br',
    'https://www.ultrazend.com.br'
  ];

const app = express();

// Configure trust proxy for rate limiting compatibility
app.set('trust proxy', 1);

// Server Configuration
const PORT = Env.getNumber('PORT', 3001); // HTTP port for development/internal
const HTTPS_PORT = Env.getNumber('HTTPS_PORT', 443); // HTTPS port for production

let server;
let httpsServer;
let primaryServer; // The server that Socket.io will use

if (Env.isProduction) {
  try {
    // Load SSL certificates from Let's Encrypt
    const sslOptions = {
      key: fs.readFileSync('/etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem'),
      cert: fs.readFileSync('/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem')
    };
    
    // Create HTTPS server with the Express app
    httpsServer = createHttpsServer(sslOptions, app);
    primaryServer = httpsServer;
    
    // Create HTTP server that serves the app on port 3001 (for internal/debug)
    server = createServer(app);
    
    logger.info('✅ SSL certificates loaded successfully');
    
  } catch (error) {
    logger.error('❌ SSL certificates not found, using HTTP only', error);
    server = createServer(app);
    primaryServer = server;
  }
} else {
  // Development: only HTTP server
  server = createServer(app);
  primaryServer = server;
}

const io = new Server(primaryServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      childSrc: ["'none'"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: Env.isProduction ? [] : null
    },
    reportOnly: false
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
}));

// CORS configuration - secure implementation
app.use('/api', cors({
  origin: (origin: string | undefined, callback: Function) => {
    // In development, allow requests with no origin (like Postman, mobile apps)
    if (!origin && Env.isDevelopment) {
      return callback(null, true);
    }
    
    // In production, ALWAYS require origin header for API routes
    if (!origin && Env.isProduction) {
      logger.warn('CORS: Request blocked - missing origin header', { 
        timestamp: new Date().toISOString() 
      });
      return callback(new Error('Origin header é obrigatório'));
    }
    
    // Check if origin is in allowed list
    if (origin && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Log blocked request for security monitoring
    logger.warn('CORS: Blocked request from unauthorized origin', { 
      origin, 
      allowedOrigins,
      timestamp: new Date().toISOString() 
    });
    
    return callback(new Error('Não permitido pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  // Security headers
  optionsSuccessStatus: 200,
  preflightContinue: false,
  // Prevent credential leaks
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Env.getNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
  max: Env.getNumber('RATE_LIMIT_MAX_REQUESTS', 500), // Increased from 100 to 500
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip failing requests to avoid issues with proxy setup
  skip: (req) => {
    // Skip rate limiting in development environment
    if (Env.isDevelopment) {
      return true;
    }
    // Skip rate limiting if there are issues with IP detection
    return false;
  },
});

app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Monitoring middleware (before all other routes)
app.use(healthCheckMiddleware());
app.use(metricsEndpointMiddleware());
app.use(metricsMiddleware());

// Performance monitoring middleware (after body parsers, before routes)
app.use(performanceMiddleware);

// Cookie parsing with secure settings
app.use(cookieParser(Env.get('COOKIE_SECRET', 'fallback-secret')));

// Logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check endpoint with performance monitoring
app.get('/health', async (_req, res) => {
  try {
    const healthStatus = await monitoringService.getHealthStatus();
    const performanceStats = performanceMonitor.getPerformanceStats();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: Env.get('NODE_ENV', 'development'),
      services: healthStatus,
      performance: performanceStats
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Performance statistics endpoint
app.get('/api/performance', async (req, res) => {
  try {
    const performanceStats = performanceMonitor.getPerformanceStats();
    const systemStats = await monitoringService.getSystemStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      performance: performanceStats,
      system: systemStats,
      uptime: Math.round(process.uptime())
    });
  } catch (error) {
    logger.error('Error getting performance stats', { error });
    res.status(500).json({
      error: 'Failed to get performance statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/dns', dnsRoutes);

// Swagger documentation
setupSwagger(app);

// Serve static frontend files in production
if (Env.isProduction) {
  const frontendPath = path.resolve(__dirname, '../../frontend');
  
  // Check if frontend directory exists
  if (fs.existsSync(frontendPath)) {
    logger.info(`Serving frontend from: ${frontendPath}`);
    
    // Configure MIME types for static files
    app.use(express.static(frontendPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.mjs')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.jsx')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.ts')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.tsx')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (path.endsWith('.html')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (path.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else if (path.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        } else if (path.endsWith('.woff') || path.endsWith('.woff2')) {
          res.setHeader('Content-Type', 'font/woff2');
        } else if (path.endsWith('.ttf')) {
          res.setHeader('Content-Type', 'font/ttf');
        } else if (path.endsWith('.eot')) {
          res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
        }
      }
    }));
    
    // Handle client-side routing (SPA)
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/') || req.path.startsWith('/docs')) {
        return res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} not found` });
      }
      
      const indexPath = path.join(frontendPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ error: 'Frontend not found', message: 'Frontend files not available' });
      }
    });
  } else {
    logger.warn(`Frontend directory not found at: ${frontendPath}`);
    
    // Fallback route for missing frontend
    app.get('/', (req, res) => {
      res.json({
        message: 'UltraZend API Server',
        status: 'OK',
        frontend: 'Not available - frontend files not found',
        api: '/api/',
        docs: '/api-docs',
        timestamp: new Date().toISOString()
      });
    });
  }
} else {
  // Development mode - show API info
  app.get('/', (req, res) => {
    res.json({
      message: 'UltraZend API Server - Development',
      status: 'OK',
      mode: 'development',
      api: '/api/',
      docs: '/api-docs',
      timestamp: new Date().toISOString()
    });
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('Client connected to WebSocket', { socketId: socket.id });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected from WebSocket', { socketId: socket.id });
  });
});

// Make io available in request object
app.set('io', io);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Database connection and server start
const startServer = async () => {
  try {
    // Apply production configuration if in production
    if (Env.isProduction) {
      logger.info('Applying production configuration...');
      // await configureProductionApp(app, [server, httpsServer].filter(Boolean), db.client);
    }

    // Initialize monitoring service
    monitoringService.initialize();
    logger.info('Monitoring service initialized');

    // Initialize EmailServiceFactory (resolves circular dependencies)
    // EmailServiceFactory.initialize();
    // logger.info('EmailServiceFactory initialized');

    // Test database connection
    await db.raw('SELECT 1');
    logger.info('Database connected successfully');

    // Run migrations
    await db.migrate.latest();
    logger.info('Database migrations completed');

    // Start servers
    if (Env.isProduction) {
      if (httpsServer) {
        // Production with SSL: Start HTTPS server on port 443
        httpsServer.listen(HTTPS_PORT, () => {
          logger.info(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
          logger.info(`📚 API Documentation available at https://www.ultrazend.com.br/api-docs`);
          logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'production')}`);
        });
        
        // Also start HTTP server on port 3001 (internal/debug access)
        server.listen(PORT, () => {
          logger.info(`🔧 HTTP Server (internal) running on port ${PORT}`);
        });
        
        // Create HTTP redirect server on port 80
        const redirectServer = createServer((req, res) => {
          const host = req.headers.host?.replace(/:\d+/, ''); // Remove port from host
          const redirectUrl = `https://${host}${req.url}`;
          
          res.writeHead(301, { 
            'Location': redirectUrl,
            'Content-Type': 'text/plain'
          });
          res.end(`Redirecting to ${redirectUrl}`);
        });
        
        redirectServer.listen(80, () => {
          logger.info(`↩️  HTTP Redirect Server running on port 80 → HTTPS`);
        });
      } else {
        // Production without SSL certificates: HTTP only on configured port
        server.listen(PORT, () => {
          logger.info(`🚀 HTTP Server running on port ${PORT} (SSL certificates not found)`);
          logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
        });
      }
    } else {
      // Development: HTTP only
      server.listen(PORT, () => {
        logger.info(`🚀 HTTP Server running on port ${PORT}`);
        logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
        logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
      });
    }

    // Verificar Redis connection para queues
    try {
      const { QueueService } = await import('./services/queueService');
      const queueService = new QueueService();
      const stats = await queueService.getQueueStats();
      logger.info('📊 Queue service initialized successfully', stats);
    } catch (error) {
      logger.warn('⚠️ Queue service not available, running without Redis queues', { error: error instanceof Error ? error.message : error });
    }

    // Start SMTP server
    const smtpServer = new UltraZendSMTPServer();
    await smtpServer.start();

    // Start email queue processor
    const smtpDelivery = new SMTPDeliveryService();
    
    // Process email queue every 30 seconds
    const processQueue = async () => {
      try {
        await smtpDelivery.processEmailQueue();
      } catch (error) {
        logger.error('Error in queue processing:', error);
      }
    };
    
    // Start queue processor
    setInterval(processQueue, 30000); // Process every 30 seconds
    logger.info('📧 Email queue processor started (30s intervals)');
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Enhanced graceful shutdown with performance monitoring cleanup
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Cleanup performance monitor
    await performanceMonitor.destroy();
    logger.info('Performance monitor cleaned up');
    
    // Shutdown monitoring service
    await monitoringService.close();
    logger.info('Monitoring service shutdown completed');
    
    const closePromises = [];
    
    if (server) {
      closePromises.push(new Promise((resolve) => {
        server.close(() => {
          logger.info('HTTP Server closed');
          resolve(void 0);
        });
      }));
    }
    
    if (httpsServer) {
      closePromises.push(new Promise((resolve) => {
        httpsServer.close(() => {
          logger.info('HTTPS Server closed');
          resolve(void 0);
        });
      }));
    }
    
    await Promise.all(closePromises);
    
    // Close database connection
    await db.destroy();
    logger.info('Database connection closed');
    
    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
};

// Enhanced shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception detected', {
    error: error.message,
    stack: error.stack,
    severity: 'CRITICAL'
  });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection detected', {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: promise.toString(),
    severity: 'HIGH'
  });
  gracefulShutdown('unhandledRejection');
});

startServer();

export { io };