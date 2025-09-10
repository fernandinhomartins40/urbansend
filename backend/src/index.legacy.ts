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

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
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

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: Env.get('NODE_ENV', 'development')
  });
});

// API Routes
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
    app.use(express.static(frontendPath));
    
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

    // 🔧 INITIALIZE TENANT-AWARE SERVICES (SEQUENTIAL)
    logger.info('🔄 Starting tenant-aware service initialization...');

    // Step 1: Initialize Tenant Context Service
    try {
      const { TenantContextService } = await import('./services/TenantContextService');
      const tenantService = new TenantContextService();
      logger.info('✅ Tenant Context Service initialized');
    } catch (error) {
      logger.warn('⚠️ Tenant Context Service failed, continuing...', { error: (error as Error).message });
    }

    // Step 2: Initialize Tenant Queue Manager
    try {
      const { TenantQueueManager } = await import('./services/TenantQueueManager');
      const queueManager = new TenantQueueManager();
      logger.info('✅ Tenant Queue Manager initialized');
    } catch (error) {
      logger.warn('⚠️ Tenant Queue Manager failed, continuing...', { error: (error as Error).message });
    }

    // Step 3: Start SMTP server
    try {
      const smtpServer = new UltraZendSMTPServer();
      await smtpServer.start();
      logger.info('✅ SMTP Server initialized');
    } catch (error) {
      logger.warn('⚠️ SMTP Server failed, continuing...', { error: (error as Error).message });
    }

    // Step 4: Initialize Tenant-Aware Queue Processor
    try {
      const { startQueueProcessor } = await import('./workers/queueProcessor');
      
      // 🔥 NOVO: Usar o QueueProcessor tenant-aware em vez do global
      setTimeout(async () => {
        try {
          await startQueueProcessor();
          logger.info('✅ Tenant-aware queue processor started');
        } catch (error) {
          logger.error('Error starting tenant queue processor:', error);
        }
      }, 2000); // Delay para garantir que outros serviços estejam prontos
    } catch (error) {
      logger.warn('⚠️ Tenant-aware queue processor failed, continuing...', { error: (error as Error).message });
    }

    // Step 5: Initialize Email Worker
    try {
      const { EmailWorker } = await import('./workers/emailWorker');
      const emailWorker = new EmailWorker();
      
      // 🔥 NOVO: Start tenant-aware email worker
      setTimeout(() => {
        emailWorker.start();
        logger.info('✅ Tenant-aware email worker started');
      }, 3000);
    } catch (error) {
      logger.warn('⚠️ Email Worker failed, continuing...', { error: (error as Error).message });
    }

    logger.info('✅ All tenant-aware services initialization completed');
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Shutting down gracefully');
  
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
  
  Promise.all(closePromises).then(() => {
    db.destroy();
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();

export { io };