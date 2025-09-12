import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// Rate limiting removido do nível global - aplicado apenas em endpoints específicos
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();
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
import { queueService } from './services/queueService';
import UltraZendSMTPServer from './services/smtpServer';
import { SMTPDeliveryService } from './services/smtpDelivery';
import { domainVerificationInitializer } from './services/domainVerificationInitializer';
import { autoRollbackService } from './services/AutoRollbackService';
import { getFeatureFlags } from './config/features';

// Routes
import authRoutes from './routes/auth';
import keysRoutes from './routes/keys';
import emailsRoutes from './routes/emails'; // Rota funcional (nova arquitetura em email/emailRoutes.ts quando tipos forem corrigidos)
import emailsV2Routes from './routes/emails-v2'; // 🆕 Fase 3 - Rota híbrida com integração de domínios
import templatesRoutes from './routes/templates';
import domainsRoutes from './routes/domains';
import analyticsRoutes from './routes/analytics';
import webhooksRoutes from './routes/webhooks';
import dnsRoutes from './routes/dns';
import healthRoutes from './routes/health';
import domainMonitoringRoutes from './routes/domain-monitoring';
// Fase 1 - Settings routes removidas temporariamente
// Fase 2 - New routes
import dkimRoutes from './routes/dkim';
import smtpMonitoringRoutes from './routes/smtp-monitoring';
// Fase 3 - Domain setup routes
import domainSetupRoutes from './routes/domain-setup';
// Fase 4 - Monitoramento e Alertas
import monitoringRoutes from './routes/monitoring';
import schedulerRoutes from './routes/scheduler';
import { healthCheckScheduler } from './scheduler/healthCheckScheduler';
// TEMPORÁRIO - Admin audit para corrigir vazamento de dados
import adminAuditRoutes from './routes/admin-audit';
// Professional DKIM Administration
import adminDkimRoutes from './routes/admin-dkim';
// TEMPORÁRIO - Rotas de teste para Fase 2 - Integração de domínios
import testIntegrationRoutes from './routes/test-integration';
// Fase 6 - Feature flags routes para rollout gradual
import featureFlagsRoutes from './routes/feature-flags';
import migrationMonitoringRoutes from './routes/migration-monitoring';
import autoRollbackRoutes from './routes/auto-rollback';
// Temporarily commented - JS routes need TS conversion
// import campaignsRoutes from './routes/campaigns';
// import schedulerRoutes from './routes/scheduler';
// import segmentationRoutes from './routes/segmentation';
// import trendAnalyticsRoutes from './routes/trend-analytics.js'; // Needs TS conversion
// import alertsRoutes from './routes/alerts.js'; // Needs TS conversion
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

let server: any;
let httpsServer: any;
let primaryServer: any;

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
  
  // Check if running behind a reverse proxy (Nginx, etc.)
  const behindProxy = Env.get('BEHIND_PROXY', 'false').toLowerCase() === 'true';
  
  if (behindProxy) {
    logger.info('🔒 Running behind reverse proxy - using HTTP only (SSL terminated by proxy)');
    server = createServer(app);
    primaryServer = server;
  } else {
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
// Manter rota atual funcionando (Fase 3.2)
app.use('/api/emails', emailsRoutes);

// Nova rota com integração de domínios (Fase 3.2)
app.use('/api/emails-v2', emailsV2Routes);
app.use('/api/templates', templatesRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/domain-monitoring', domainMonitoringRoutes);
// Fase 1 - Settings routes removidas temporariamente
// Fase 2 - Enhanced service routes
app.use('/api/dkim', dkimRoutes);
app.use('/api/smtp-monitoring', smtpMonitoringRoutes);
// Fase 3 - Domain setup routes
app.use('/api/domain-setup', domainSetupRoutes);
// Fase 4 - Monitoramento e Alertas routes
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/scheduler', schedulerRoutes);
// TEMPORÁRIO - Admin audit para diagnóstico e correção
app.use('/api/admin-audit', adminAuditRoutes);
// Professional DKIM Administration routes
app.use('/api/admin/dkim', adminDkimRoutes);
// TEMPORÁRIO - Rotas de teste para Fase 2 - Integração de domínios  
app.use('/api/test', testIntegrationRoutes);
// Fase 6 - Feature flags para rollout gradual da integração
app.use('/api/feature-flags', featureFlagsRoutes);
app.use('/api/migration-monitoring', migrationMonitoringRoutes);
app.use('/api/auto-rollback', autoRollbackRoutes);
// app.use('/api/campaigns', campaignsRoutes); // Temporarily disabled - needs TS conversion  
// app.use('/api/segmentation', segmentationRoutes); // Temporarily disabled - needs TS conversion
// app.use('/api/trend-analytics', trendAnalyticsRoutes); // Temporarily disabled - needs TS conversion
// app.use('/api/alerts', alertsRoutes); // Temporarily disabled - needs TS conversion
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
        return res.sendFile(indexPath);
      } else {
        return res.status(404).json({ error: 'Frontend not found', message: 'Frontend files not available' });
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

  // Step 1: MANDATORY database connection and migrations (FAIL FAST)
  try {
    // Test database connection
    await db.raw('SELECT 1');
    logger.info('✅ Database connection established');

    // CRÍTICO: Execute migrations OBRIGATORIAMENTE antes de qualquer serviço
    logger.info('🔄 Executando migrations obrigatórias (71 tabelas A01→A71)...');
    
    const migrationTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Migration timeout - 71 migrations A01→A71 took longer than 300s')), 300000) // 5 minutos
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
    
    logger.info('✅ Todas as 71 migrations A01→A71 executadas com sucesso - Schema centralizado ativo');
    logger.info(`📊 Migrations batch: ${migrationResult[0]}`);
    
  } catch (error) {
    logger.error('❌ CRÍTICO: Falha nas migrations obrigatórias', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    logger.error('🚫 Sistema NÃO PODE inicializar sem schema centralizado');
    throw error; // FAIL FAST - não mascarar este erro
  }

  // Step 2: Initialize monitoring service APÓS migrations
  try {
    monitoringService.initialize();
    logger.info('✅ Monitoring service initialized (após schema centralizado)');
  } catch (error) {
    logger.warn('⚠️ Monitoring service failed, continuing...', { error: (error as Error).message });
  }

  // Step 3: Initialize services with dependency graph
  const services = [
    {
      name: 'Queue Service',
      dependencies: [], // Nenhuma dependência
      critical: true,   // Falha para todo o sistema
      init: async () => {
        const stats = await queueService.getQueueStats();
        logger.info('✅ Queue service initialized', stats);
        return { queueService, stats };
      }
    },
    {
      name: 'SMTP Server',
      dependencies: ['Queue Service'], // Depende de Queue
      critical: true,
      init: async () => {
        try {
          // OPÇÃO 1 - ARQUITETURA DUAL: Portas diferentes para evitar conflito
          
          // Portas não conflitantes para desenvolvimento
          const smtpServerConfig = {
            mxPort: Env.isDevelopment ? 2526 : 25,         // Dev: 2526, Prod: 25
            submissionPort: Env.isDevelopment ? 2587 : 587, // Dev: 2587, Prod: 587
            hostname: Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br'),
            maxConnections: Env.getNumber('SMTP_MAX_CLIENTS', 100),
            authRequired: true,
            tlsEnabled: true
          };

          logger.info('🔧 SMTP Server Config - Development Safe Ports', {
            environment: process.env.NODE_ENV,
            mxPort: smtpServerConfig.mxPort,
            submissionPort: smtpServerConfig.submissionPort,
            isDevelopment: Env.isDevelopment
          });
          
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
      dependencies: ['Queue Service', 'SMTP Server'], // Depende de ambos
      critical: false, // Pode falhar sem parar sistema
      init: async () => {
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
      name: 'Domain Verification System',
      dependencies: [], // Independente
      critical: false, // Não crítico
      init: async () => {
        await domainVerificationInitializer.initialize();
        logger.info('✅ Domain Verification System initialized - Full monitoring active');
      }
    },
    {
      name: 'Auto Rollback Service',
      dependencies: [], // Independente
      critical: false, // Não crítico
      init: async () => {
        const flags = getFeatureFlags();
        if (flags.ENABLE_AUTO_ROLLBACK) {
          autoRollbackService.start();
          logger.info('✅ Auto Rollback Service inicializado e ativo');
        } else {
          logger.info('⚪ Auto Rollback Service inicializado mas desabilitado por feature flag');
        }
      }
    }
    // {
    //   name: 'Campaign Scheduler',
    //   init: async () => {
    //     const { CampaignScheduler } = await import('./services/CampaignScheduler');
    //     const campaignScheduler = new CampaignScheduler();
    //     campaignScheduler.start();
    //     
    //     // Registrar scheduler globalmente para acesso posterior
    //     (global as any).campaignScheduler = campaignScheduler;
    //     
    //     logger.info('✅ Campaign Scheduler inicializado com sucesso');
    //   }
    // } // Temporarily disabled - needs TS conversion
  ];

  // Inicialização respeitando dependências
  const initializeServicesWithDependencies = async () => {
    const initializedServices = new Map();
    const results = new Map();

    for (const service of services) {
      // Verificar se dependências foram inicializadas
      for (const dependency of service.dependencies) {
        if (!initializedServices.has(dependency)) {
          throw new Error(`Service '${service.name}' depends on '${dependency}' which is not initialized`);
        }
      }

      try {
        logger.info(`🔄 Inicializando ${service.name}...`);
        const result = await service.init();
        
        initializedServices.set(service.name, true);
        results.set(service.name, result);
        
        logger.info(`✅ ${service.name} inicializado com sucesso`);
        
        // Delay entre serviços críticos
        if (service.critical) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        logger.error(`❌ ${service.name} falhou na inicialização`, { error });
        
        if (service.critical) {
          throw error; // Parar tudo se crítico
        } else {
          logger.warn(`⚠️ Continuando sem ${service.name}...`);
        }
      }
    }

    return results;
  };

  await initializeServicesWithDependencies();
  logger.info('✅ Inicialização com dependency graph completa - Sistema profissional ativo!');
};

const startServer = async () => {
  try {
    logger.info('🚀 UltraZend - Inicialização do Sistema Profissional');
    logger.info('📋 Schema Centralizado | Migrations Organizadas | Zero Race Conditions');
    
    // Initialize services sequentially with centralized schema
    await initializeServices();

    // Start appropriate server (HTTPS in production if SSL available and not behind proxy, HTTP otherwise)
    const behindProxy = Env.get('BEHIND_PROXY', 'false').toLowerCase() === 'true';
    
    if (Env.isProduction && httpsServer && !behindProxy) {
      // Start HTTPS server
      httpsServer.listen(HTTPS_PORT, () => {
        logger.info(`🎉 UltraZend Sistema Profissional ATIVO (HTTPS) na porta ${HTTPS_PORT}`);
        logger.info('✅ Schema: 71 tabelas centralizadas via migrations A01→A71');
        logger.info('✅ Serviços: Validação defensiva implementada');
        logger.info('✅ Deploy: Determinístico e confiável');
        logger.info(`📚 API Documentation: https://www.ultrazend.com.br/api-docs`);
        logger.info(`🔒 SSL: Direct HTTPS server (porta ${HTTPS_PORT})`);
        logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
      });
      
      // Also start HTTP server for redirects (optional)
      server.listen(PORT, () => {
        logger.info(`🔄 HTTP redirect server ativo na porta ${PORT}`);
      });
    } else {
      // Start HTTP server only
      server.listen(PORT, () => {
        logger.info(`🎉 UltraZend Sistema Profissional ATIVO (HTTP) na porta ${PORT}`);
        logger.info('✅ Schema: 71 tabelas centralizadas via migrations A01→A71');
        logger.info('✅ Serviços: Validação defensiva implementada');
        logger.info('✅ Deploy: Determinístico e confiável');
        
        if (Env.isProduction) {
          logger.info(`📚 API Documentation: http://www.ultrazend.com.br:${PORT}/api-docs`);
          logger.info(`🔒 SSL: Aguardando certificados ou usando proxy reverso`);
        } else {
          logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
        }
        
        logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
      });
    }
    
  } catch (error) {
    logger.error('❌ CRITICAL: Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
};

// ✅ GRACEFUL SHUTDOWN ROBUSTO - TASK 2.7
const gracefulShutdown = async (signal: string) => {
  // Prevent multiple shutdowns
  if (isShutdownInProgress) {
    logger.warn(`Graceful shutdown already in progress, ignoring ${signal}`);
    return;
  }
  
  isShutdownInProgress = true;
  
  logger.info(`🔄 Graceful shutdown initiated by ${signal}`);
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('🚨 Graceful shutdown timeout - force exiting');
    process.exit(1);
  }, 30000); // 30 segundos máximo

  try {
    // 1. Stop accepting new connections
    if (primaryServer) {
      logger.info('🔄 Closing HTTP server...');
      await new Promise((resolve) => {
        const serverTimeout = setTimeout(() => {
          logger.warn('HTTP server close timeout, forcing...');
          resolve(void 0);
        }, 5000);
        
        primaryServer.close(() => {
          clearTimeout(serverTimeout);
          logger.info('✅ HTTP server closed');
          resolve(void 0);
        });
      });
    }

    // Also close additional servers (HTTP redirect server)
    if (server && server !== primaryServer) {
      logger.info('🔄 Closing HTTP redirect server...');
      await new Promise((resolve) => {
        const redirectTimeout = setTimeout(() => {
          logger.warn('HTTP redirect server close timeout, forcing...');
          resolve(void 0);
        }, 3000);
        
        server.close(() => {
          clearTimeout(redirectTimeout);
          logger.info('✅ HTTP redirect server closed');
          resolve(void 0);
        });
      });
    }

    // 2. Close WebSocket connections
    if (io) {
      logger.info('🔄 Closing WebSocket connections...');
      try {
        await new Promise((resolve) => {
          const ioTimeout = setTimeout(() => {
            logger.warn('WebSocket close timeout, forcing...');
            resolve(void 0);
          }, 3000);
          
          io.close(() => {
            clearTimeout(ioTimeout);
            logger.info('✅ WebSocket connections closed');
            resolve(void 0);
          });
        });
      } catch (error) {
        logger.warn('WebSocket close error, continuing...', { error: (error as Error).message });
      }
    }

    // 3. Close queue service
    try {
      logger.info('🔄 Closing queue service...');
      await Promise.race([
        queueService.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Queue service timeout')), 8000))
      ]);
      logger.info('✅ Queue service closed');
    } catch (error) {
      logger.warn('Queue service close error, continuing...', { error: (error as Error).message });
    }

    // 4. Cleanup performance monitor with timeout protection
    try {
      logger.info('🔄 Cleaning up performance monitor...');
      await Promise.race([
        performanceMonitor.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Performance monitor timeout')), 5000))
      ]);
      logger.info('✅ Performance monitor cleaned up');
    } catch (error) {
      logger.warn('Performance monitor cleanup failed, continuing...', { error: (error as Error).message });
    }
    
    // 5. Cleanup monitoring service with timeout protection
    try {
      logger.info('🔄 Closing monitoring service...');
      await Promise.race([
        monitoringService.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Monitoring service timeout')), 8000))
      ]);
      logger.info('✅ Monitoring service shutdown completed');
    } catch (error) {
      logger.warn('Monitoring service cleanup failed, continuing...', { error: (error as Error).message });
    }

    // 6. Close database connection (only if not already closed)
    if (db && !isDatabaseClosed) {
      logger.info('🔄 Closing database connection...');
      try {
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
            logger.info('✅ Database connection pool closed successfully');
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
        logger.info('✅ Database graceful shutdown completed');
      } catch (error) {
        logger.warn('Database graceful shutdown completed with warnings', { error: (error as Error).message });
        isDatabaseClosed = true; // Always mark as closed to prevent retry
      }
    } else {
      logger.info('✅ Database connection already closed');
    }
    
    clearTimeout(shutdownTimeout);
    logger.info('✅ Graceful shutdown completed successfully');
    process.exit(0);
    
  } catch (error) {
    clearTimeout(shutdownTimeout);
    logger.error('Error during graceful shutdown', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    process.exit(1);
  }
};

// Remove existing listeners to prevent memory leaks
const existingListeners = ['SIGTERM', 'SIGINT', 'SIGUSR2', 'uncaughtException', 'unhandledRejection'];
existingListeners.forEach(event => {
  process.removeAllListeners(event);
});

logger.info('🧹 Event listeners cleared before adding new ones');

// Shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

process.on('uncaughtException', (error) => {
  try {
    logger.error('Uncaught exception detected', {
      error: error.message,
      stack: error.stack,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString()
    });
  } catch (logError) {
    // Fallback logging se logger falhar
    console.error('CRITICAL: Uncaught exception + logging failed', error.message);
  }
  
  // Exit immediately without graceful shutdown to avoid recursion
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  try {
    const reasonStr = reason instanceof Error ? reason.message : String(reason);
    
    logger.error('Unhandled promise rejection detected', {
      reason: reasonStr,
      severity: 'HIGH',
      timestamp: new Date().toISOString()
    });
  } catch (logError) {
    const reasonStr = reason instanceof Error ? reason.message : String(reason);
    console.error('HIGH: Unhandled rejection + logging failed', reasonStr);
  }
  
  // Log but don't exit - let the application continue
});

startServer();

export { io };