import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './config/logger';
import { setupSwagger } from './config/swagger';
import { Env } from './utils/env';
import db from './config/database';
import UrbanSendSMTPServer from './services/smtpServer';
import SMTPDeliveryService from './services/smtpDelivery';
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

dotenv.config();

// CORS allowed origins
const allowedOrigins = [
  'http://localhost:5173',
  'https://urbanmail.com.br',
  'https://www.urbanmail.com.br'
];

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const PORT = Env.getNumber('PORT', 3000);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Env.getNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
  max: Env.getNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 HTTP Server running on port ${PORT}`);
      logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
      logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
    });

    // Start SMTP server
    const smtpServer = new UrbanSendSMTPServer();
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

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    db.destroy();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    db.destroy();
    process.exit(0);
  });
});

startServer();

export { io };