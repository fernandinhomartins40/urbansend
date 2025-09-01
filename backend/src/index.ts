import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// Rate limiting removido do nível global - aplicado apenas em endpoints específicos
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { performanceMiddleware, performanceMonitor } from './middleware/performanceMonitoring';
import { metricsMiddleware, healthCheckMiddleware, metricsEndpointMiddleware } from './middleware/monitoring';
import { monitoringService } from './services/monitoringService';
import { logger } from './config/logger';
import { setupSwagger } from './config/swagger';
import { Env } from './utils/env';
import db from './config/database';

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

// Load environment variables
const configPath = path.resolve(process.cwd(), 'configs', '.env.production');
dotenv.config({ path: configPath });

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// CORS allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
  [
    ...(Env.isDevelopment ? ['http://localhost:5173', 'http://localhost:3000'] : []),
    'https://ultrazend.com.br',
    'https://www.ultrazend.com.br'
  ];

const app = express();

// Server Configuration
const PORT = Env.getNumber('PORT', 3001);
const HTTPS_PORT = Env.getNumber('HTTPS_PORT', 443);

let server;
let httpsServer;
let primaryServer;

if (Env.isProduction) {
  try {
    const sslOptions = {
      key: fs.readFileSync('/etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem'),
      cert: fs.readFileSync('/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem')
    };
    
    httpsServer = createHttpsServer(sslOptions, app);
    primaryServer = httpsServer;
    server = createServer(app);
    
    logger.info('✅ SSL certificates loaded successfully');
  } catch (error) {
    logger.error('❌ SSL certificates not found, using HTTP only', error);
    server = createServer(app);
    primaryServer = server;
  }
} else {
  server = createServer(app);
  primaryServer = server;
}

const io = new Server(primaryServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Configure trust proxy
app.set('trust proxy', 1);

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

// CORS configuration
app.use('/api', cors({
  origin: (origin: string | undefined, callback: Function) => {
    if (!origin && Env.isDevelopment) {
      return callback(null, true);
    }
    
    if (!origin && Env.isProduction) {
      logger.warn('CORS: Request blocked - missing origin header', { 
        timestamp: new Date().toISOString() 
      });
      return callback(new Error('Origin header é obrigatório'));
    }
    
    if (origin && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
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
  optionsSuccessStatus: 200,
  preflightContinue: false,
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
}));

// Rate limiting removido do nível global
// Agora aplicado apenas em endpoints específicos que precisam de proteção

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Monitoring middleware
app.use(healthCheckMiddleware());
app.use(metricsEndpointMiddleware());
app.use(metricsMiddleware());
app.use(performanceMiddleware);

// Cookie parsing
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

// Health check endpoint
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
  
  if (fs.existsSync(frontendPath)) {
    logger.info(`Serving frontend from: ${frontendPath}`);
    
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
    
    app.get('*', (req, res) => {
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

app.set('io', io);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// 🔧 SEQUENTIAL INITIALIZATION TO AVOID DATABASE LOCKS
const initializeServices = async () => {
  logger.info('🔄 Starting sequential service initialization...');

  // Step 1: Initialize basic monitoring
  try {
    monitoringService.initialize();
    logger.info('✅ Monitoring service initialized');
  } catch (error) {
    logger.warn('⚠️ Monitoring service failed, continuing...', { error: (error as Error).message });
  }

  // Step 2: Test database connection and run migrations
  try {
    await db.raw('SELECT 1');
    logger.info('✅ Database connected successfully');

    await db.migrate.latest();
    logger.info('✅ Database migrations completed');
  } catch (error) {
    logger.error('❌ Database initialization failed', { error: (error as Error).message });
    throw error;
  }

  // Step 3: Initialize services that need database tables (SEQUENTIAL)
  const services = [
    {
      name: 'Queue Service',
      init: async () => {
        const { QueueService } = await import('./services/queueService');
        const queueService = new QueueService();
        const stats = await queueService.getQueueStats();
        logger.info('✅ Queue service initialized', stats);
      }
    },
    {
      name: 'SMTP Server',
      init: async () => {
        try {
          const UltraZendSMTPServer = (await import('./services/smtpServer')).default;
          const smtpServer = new UltraZendSMTPServer();
          await smtpServer.start();
          logger.info('✅ SMTP Server initialized');
        } catch (error) {
          if ((error as any).code === 'EADDRINUSE') {
            logger.warn('⚠️ SMTP ports already in use, continuing without SMTP server...', { 
              error: (error as Error).message 
            });
          } else {
            throw error;
          }
        }
      }
    },
    {
      name: 'Email Queue Processor',
      init: async () => {
        const { SMTPDeliveryService } = await import('./services/smtpDelivery');
        const smtpDelivery = new SMTPDeliveryService();
        
        const processQueue = async () => {
          try {
            await smtpDelivery.processEmailQueue();
          } catch (error) {
            logger.error('Error in queue processing:', error);
          }
        };
        
        setInterval(processQueue, 30000);
        logger.info('✅ Email queue processor started (30s intervals)');
      }
    }
  ];

  // Initialize services sequentially with delay to prevent locks
  for (const service of services) {
    try {
      await service.init();
      // Small delay between service initializations
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      logger.warn(`⚠️ ${service.name} failed to initialize, continuing...`, { 
        error: (error as Error).message 
      });
    }
  }

  logger.info('✅ All services initialization completed');
};

const startServer = async () => {
  try {
    // Initialize services sequentially
    await initializeServices();

    // Start servers
    if (Env.isProduction) {
      if (httpsServer) {
        httpsServer.listen(HTTPS_PORT, () => {
          logger.info(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
          logger.info(`📚 API Documentation available at https://www.ultrazend.com.br/api-docs`);
          logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'production')}`);
        });
        
        server.listen(PORT, () => {
          logger.info(`🔧 HTTP Server (internal) running on port ${PORT}`);
        });
        
        const redirectServer = createServer((req, res) => {
          const host = req.headers.host?.replace(/:\d+/, '');
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
        server.listen(PORT, () => {
          logger.info(`🚀 HTTP Server running on port ${PORT} (SSL certificates not found)`);
          logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
        });
      }
    } else {
      server.listen(PORT, () => {
        logger.info(`🚀 HTTP Server running on port ${PORT}`);
        logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
        logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
      });
    }
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Enhanced graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    await performanceMonitor.destroy();
    logger.info('Performance monitor cleaned up');
    
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
    
    await db.destroy();
    logger.info('Database connection closed');
    
    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
};

// Shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

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