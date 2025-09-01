import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './config/logger';
import { Env } from './utils/env';
import db from './config/database';

// Routes
import authRoutes from './routes/auth';

dotenv.config();

const app = express();
const PORT = Env.getNumber('PORT', 3001);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    logger.info('Database connected successfully');

    app.listen(PORT, () => {
      logger.info(`🚀 Simple HTTP Server running on port ${PORT}`);
      logger.info(`🔍 Environment: ${Env.get('NODE_ENV', 'development')}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();