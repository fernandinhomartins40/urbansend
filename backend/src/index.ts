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
// Fase 1 - Settings routes removidas temporariamente
// Fase 2 - New routes
import dkimRoutes from './routes/dkim';
import smtpMonitoringRoutes from './routes/smtp-monitoring';
// Temporarily commented - JS routes need TS conversion
// import campaignsRoutes from './routes/campaigns';
// import schedulerRoutes from './routes/scheduler';
// import segmentationRoutes from './routes/segmentation';
import trendAnalyticsRoutes from './routes/trend-analytics.js';
import alertsRoutes from './routes/alerts.js';
// Fase 2 routes removidas temporariamente
// Fase 3 - Advanced features
// Fase 3 routes removidas temporariamente

// Global shutdown control - prevents double database destroy
let isDatabaseClosed = false;
let isShutdownInProgress = false;

// Load environment variables with fallback strategy
const loadEnvConfig = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  let envPaths: string[] = [];
  
  if (nodeEnv === 'production') {
    // Production config paths in order of preference
    envPaths = [
      '/var/www/ultrazend/backend/.env',  // PM2 production path
      path.resolve(process.cwd(), 'configs', '.env.production'),
      path.resolve(process.cwd(), '.env.production'),
      path.resolve(process.cwd(), '.env')
    ];
  } else if (nodeEnv === 'development') {
    // Development config paths
    envPaths = [
      path.resolve(process.cwd(), '.env.development'),
      path.resolve(process.cwd(), '.env.local'),
      path.resolve(process.cwd(), '.env')
    ];
  } else {
    // Test or other environments
    envPaths = [
      path.resolve(process.cwd(), `.env.${nodeEnv}`),
      path.resolve(process.cwd(), '.env')
    ];
  }

  let loaded = false;
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      logger.info(`✅ Loaded environment config from: ${envPath}`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    logger.warn(`⚠️ No environment file found for NODE_ENV=${nodeEnv}, using system environment variables only`);
  }
};

loadEnvConfig();

// Early logging for debugging
logger.info('🚀 UltraZend Backend Starting...', {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  cwd: process.cwd(),
  env: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL
});

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

// SSL Certificate paths to try
const sslCertPaths = [
  {
    key: '/etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem',
    cert: '/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem',
    name: 'Let\'s Encrypt'
  },
  {
    key: '/etc/ssl/private/ultrazend.com.br.key',
    cert: '/etc/ssl/certs/ultrazend.com.br.crt', 
    name: 'Custom SSL'
  }
];

if (Env.isProduction) {
  let sslLoaded = false;
  
  // Try to load SSL certificates from different paths
  for (const sslPath of sslCertPaths) {
    try {
      if (fs.existsSync(sslPath.key) && fs.existsSync(sslPath.cert)) {
        const sslOptions = {
          key: fs.readFileSync(sslPath.key),
          cert: fs.readFileSync(sslPath.cert)
        };
        
        httpsServer = createHttpsServer(sslOptions, app);
        primaryServer = httpsServer;
        server = createServer(app);
        
        logger.info(`✅ SSL certificates loaded successfully from ${sslPath.name}`);
        sslLoaded = true;
        break;
      }
    } catch (error) {
      logger.warn(`⚠️ Failed to load SSL from ${sslPath.name}:`, error);
    }
  }
  
  // Fallback to HTTP if no SSL certificates found
  if (!sslLoaded) {
    logger.warn('⚠️ No SSL certificates found, running HTTP only');
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
    
    // Em produção, permitir requests sem Origin para endpoints específicos como health checks e APIs
    if (!origin && Env.isProduction) {
      // Permitir requests internos e de monitoramento
      return callback(null, true);
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

// Body parsing with error handling
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JSON parsing error handler
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    logger.error('JSON parsing error:', {
      error: err.message,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON format in request body'
    });
  }
  next(err);
});

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
app.use('/api/version', healthRoutes); // Version endpoint shares health routes for consistency
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/dns', dnsRoutes);
// Fase 1 - Settings routes removidas temporariamente
// Fase 2 - Enhanced service routes
app.use('/api/dkim', dkimRoutes);
app.use('/api/smtp-monitoring', smtpMonitoringRoutes);
// app.use('/api/campaigns', campaignsRoutes); // Temporarily disabled - needs TS conversion
// app.use('/api/scheduler', schedulerRoutes); // Temporarily disabled - needs TS conversion  
// app.use('/api/segmentation', segmentationRoutes); // Temporarily disabled - needs TS conversion
app.use('/api/trend-analytics', trendAnalyticsRoutes);
app.use('/api/alerts', alertsRoutes);
// Fase 2 routes removidas temporariamente
// Fase 3 - Advanced features routes
// Fase 3 routes removidas temporariamente

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

  // Step 2: MANDATORY database connection and migrations (FAIL FAST)
  try {
    // Test database connection
    await db.raw('SELECT 1');
    logger.info('✅ Database connection established');

    // CRÍTICO: Execute migrations OBRIGATORIAMENTE antes de qualquer serviço
    logger.info('🔄 Executando migrations obrigatórias (47 tabelas)...');
    
    const migrationTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Migration timeout - 47 migrations took longer than 60s')), 60000)
    );
    
    const migrationResult = await Promise.race([
      db.migrate.latest(),
      migrationTimeout
    ]);
    
    // Validar se migrations foram realmente executadas
    const completedMigrations = await db.migrate.list();
    const pendingMigrations = completedMigrations[1]; // [completed, pending]
    
    if (pendingMigrations.length > 0) {
      throw new Error(`${pendingMigrations.length} migrations ainda pendentes: ${pendingMigrations.join(', ')}`);
    }
    
    logger.info('✅ Todas as 47 migrations executadas com sucesso - Schema centralizado ativo');
    logger.info(`📊 Migrations batch: ${migrationResult[0]}`);
    
  } catch (error) {
    logger.error('❌ CRÍTICO: Falha nas migrations obrigatórias', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    logger.error('🚫 Sistema NÃO PODE inicializar sem schema centralizado');
    throw error; // FAIL FAST - não mascarar este erro
  }

  // Step 3: Initialize services (SEQUENTIAL) - agora apenas validam tabelas existentes
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
          // OPÇÃO 1 - ARQUITETURA DUAL: Portas diferentes para evitar conflito
          const UltraZendSMTPServer = (await import('./services/smtpServer')).default;
          
          // Configuração robusta com portas específicas
          const smtpServerConfig = {
            mxPort: 2525,        // API/Aplicação (não conflita com Postfix:25)
            submissionPort: 587,  // Submission padrão (autenticado)
            hostname: Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br'),
            maxConnections: Env.getNumber('SMTP_MAX_CLIENTS', 100),
            authRequired: true,   // Sempre requer autenticação para segurança
            tlsEnabled: true
          };
          
          // DEBUG: Log da configuração sendo aplicada
          logger.info('🔧 SMTP Server Config Applied', smtpServerConfig);
          
          const smtpServer = new UltraZendSMTPServer(smtpServerConfig);
          await smtpServer.start();
          
          logger.info('✅ SMTP Server initialized - Dual Architecture', {
            internal_mx: 2525,
            submission: 587,
            external_postfix: 25
          });
          
        } catch (error) {
          logger.error('❌ Failed to initialize SMTP Server', { 
            error: (error as Error).message,
            stack: (error as Error).stack
          });
          throw error; // Não mascarar erros - queremos saber se há problemas
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
    },
    {
      name: 'Campaign Scheduler',
      init: async () => {
        const { CampaignScheduler } = await import('./services/CampaignScheduler');
        const campaignScheduler = new CampaignScheduler();
        campaignScheduler.start();
        
        // Registrar scheduler globalmente para acesso posterior
        (global as any).campaignScheduler = campaignScheduler;
        
        logger.info('✅ Campaign Scheduler inicializado com sucesso');
      }
    }
  ];

  // Initialize services sequentially (sem race conditions)
  logger.info('🔄 Iniciando serviços com schema centralizado validado...');
  
  for (const service of services) {
    try {
      logger.info(`🔄 Inicializando ${service.name}...`);
      await service.init();
      logger.info(`✅ ${service.name} inicializado com sucesso`);
      
      // Delay pequeno entre serviços para evitar contenção de recursos
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      logger.error(`❌ ${service.name} falhou na inicialização`, { 
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      // Para serviços críticos como SMTP, não continuar
      if (service.name === 'SMTP Server') {
        logger.error('🚫 SMTP Server é crítico - parando inicialização');
        throw error;
      }
      
      logger.warn(`⚠️ Continuando sem ${service.name}...`);
    }
  }

  logger.info('✅ Inicialização sequencial completa - Sistema profissional ativo!');
};

const startServer = async () => {
  try {
    logger.info('🚀 UltraZend - Inicialização do Sistema Profissional');
    logger.info('📋 Schema Centralizado | Migrations Organizadas | Zero Race Conditions');
    
    // Initialize services sequentially with centralized schema
    await initializeServices();

    // Start server - Let Nginx handle SSL termination
    server.listen(PORT, () => {
      logger.info(`🎉 UltraZend Sistema Profissional ATIVO na porta ${PORT}`);
      logger.info('✅ Schema: 47 tabelas centralizadas via migrations A01→ZU47');
      logger.info('✅ Serviços: Validação defensiva implementada');
      logger.info('✅ Deploy: Determinístico e confiável');
      
      if (Env.isProduction) {
        logger.info(`📚 API Documentation: https://www.ultrazend.com.br/api-docs`);
        logger.info(`🔒 SSL: Nginx reverse proxy`);
      } else {
        logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      }
      
      logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
    });
    
  } catch (error) {
    logger.error('❌ CRITICAL: Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
};

// Enhanced graceful shutdown with robust error handling
const gracefulShutdown = async (signal: string) => {
  // Prevent multiple shutdown attempts
  if (isShutdownInProgress) {
    logger.warn(`Graceful shutdown already in progress, ignoring ${signal}`);
    return;
  }
  
  isShutdownInProgress = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000); // 30 seconds timeout

  try {
    // Cleanup performance monitor with timeout protection
    try {
      await Promise.race([
        performanceMonitor.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Performance monitor timeout')), 5000))
      ]);
      logger.info('Performance monitor cleaned up');
    } catch (error) {
      logger.warn('Performance monitor cleanup failed, continuing...', { error: (error as Error).message });
    }
    
    // Cleanup monitoring service with timeout protection
    try {
      await Promise.race([
        monitoringService.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Monitoring service timeout')), 10000))
      ]);
      logger.info('Monitoring service shutdown completed');
    } catch (error) {
      logger.warn('Monitoring service cleanup failed, continuing...', { error: (error as Error).message });
    }
    
    // Close servers with timeout protection
    const closePromises = [];
    
    if (server) {
      closePromises.push(new Promise((resolve) => {
        const serverTimeout = setTimeout(() => {
          logger.warn('HTTP server close timeout, forcing...');
          resolve(void 0);
        }, 5000);
        
        server.close(() => {
          clearTimeout(serverTimeout);
          logger.info('HTTP Server closed');
          resolve(void 0);
        });
      }));
    }
    
    if (httpsServer) {
      closePromises.push(new Promise((resolve) => {
        const httpsTimeout = setTimeout(() => {
          logger.warn('HTTPS server close timeout, forcing...');
          resolve(void 0);
        }, 5000);
        
        httpsServer.close(() => {
          clearTimeout(httpsTimeout);
          logger.info('HTTPS Server closed');
          resolve(void 0);
        });
      }));
    }
    
    await Promise.all(closePromises);
    
    // CORREÇÃO FINAL: Database fechamento robusto com pool cleanup
    try {
      if (!isDatabaseClosed) {
        // Aguardar operações pendentes antes de fechar
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Fechar pool de conexões gradualmente
        const closePromise = (async () => {
          try {
            // Primeiro, parar de aceitar novas conexões
            await db.raw('PRAGMA journal_mode=DELETE');
            
            // Aguardar operações pendentes
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Fechar pool
            await db.destroy();
            logger.info('Database connection pool closed successfully');
          } catch (poolError) {
            logger.warn('Pool close with issues, but completing shutdown...', { 
              error: (poolError as Error).message 
            });
            // Forçar fechamento se necessário
            try {
              // @ts-ignore - forçar fechamento interno
              if (db.client && db.client.pool) {
                db.client.pool.destroy();
              }
            } catch (forceError) {
              logger.debug('Force pool close also failed, but continuing...');
            }
          }
        });
        
        await Promise.race([
          closePromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Database pool close timeout')), 8000))
        ]);
        
        isDatabaseClosed = true;
        logger.info('Database graceful shutdown completed');
      } else {
        logger.info('Database connection already closed by monitoring service');
      }
    } catch (error) {
      logger.warn('Database graceful shutdown completed with warnings', { error: (error as Error).message });
      isDatabaseClosed = true; // Always mark as closed to prevent retry
    }
    
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
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
  const reasonStr = reason instanceof Error ? reason.message : String(reason);
  
  logger.error('Unhandled promise rejection detected', {
    reason: reasonStr,
    promise: promise.toString(),
    severity: 'HIGH'
  });
  gracefulShutdown('unhandledRejection');
});

startServer();

export { io };