import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from './environment';
import path from 'path';

/**
 * Enterprise Logging System
 * 
 * Features:
 * - Structured JSON logging for production
 * - Human-readable console output for development
 * - Automatic log rotation and retention
 * - Multiple log levels and transports
 * - Correlation ID support
 * - Performance monitoring integration
 * - Security event logging
 * - Error tracking and alerting ready
 */

// Custom log levels for enterprise applications
const customLevels = {
  levels: {
    error: 0,    // System errors, exceptions
    warn: 1,     // Warning conditions
    info: 2,     // General information
    http: 3,     // HTTP request logging
    debug: 4,    // Debug information
    trace: 5     // Detailed trace information
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    trace: 'cyan'
  }
};

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'stack']
  }),
  winston.format.json({
    space: env.isDevelopment ? 2 : 0
  })
);

// Human-readable format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}] ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += '\n' + JSON.stringify(meta, null, 2);
    }
    
    // Add stack trace for errors
    if (stack) {
      log += '\n' + stack;
    }
    
    return log;
  })
);

// Security event format for audit logging
const securityFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
  winston.format.printf((info) => {
    return JSON.stringify({
      ...info,
      type: 'SECURITY_EVENT',
      environment: env.config.NODE_ENV,
      hostname: process.env.HOSTNAME || 'unknown'
    });
  })
);

class EnterpriseLogger {
  private logger: winston.Logger;
  
  constructor() {
    this.logger = this.createLogger();
    this.setupGlobalErrorHandlers();
  }
  
  /**
   * Create winston logger with appropriate transports
   */
  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];
    
    // Console transport - always enabled
    transports.push(
      new winston.transports.Console({
        level: env.config.LOG_LEVEL,
        format: env.isDevelopment ? developmentFormat : structuredFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );
    
    // File transports for production
    if (env.isProduction || env.config.LOG_FILE_PATH) {
      const logDir = path.dirname(env.config.LOG_FILE_PATH || './logs/app.log');
      
      // General application logs with rotation
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: env.config.LOG_MAX_SIZE || '20m',
          maxFiles: env.config.LOG_MAX_FILES || 14,
          level: env.config.LOG_LEVEL,
          format: structuredFormat,
          handleExceptions: true,
          handleRejections: true
        })
      );
      
      // Error-only logs
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: env.config.LOG_MAX_SIZE || '20m',
          maxFiles: env.config.LOG_MAX_FILES || 30,
          level: 'error',
          format: structuredFormat
        })
      );
      
      // Security audit logs
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, 'security-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '10m',
          maxFiles: 90, // Keep security logs longer
          level: 'info',
          format: securityFormat
        })
      );
      
      // HTTP access logs
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, 'access-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '50m',
          maxFiles: 7,
          level: 'http',
          format: structuredFormat
        })
      );
    }
    
    return winston.createLogger({
      levels: customLevels.levels,
      level: env.config.LOG_LEVEL || 'info',
      transports,
      exitOnError: false,
      // Prevent duplicate console logs
      silent: false
    });
  }
  
  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    this.logger.on('error', (error) => {
      console.error('Logger error:', error);
    });
    
    // Handle transport errors
    this.logger.transports.forEach((transport) => {
      transport.on('error', (error) => {
        console.error('Transport error:', error);
      });
    });
  }
  
  /**
   * Standard logging methods with enhanced metadata
   */
  error(message: string, meta: any = {}): void {
    this.logger.error(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'error'
    });
  }
  
  warn(message: string, meta: any = {}): void {
    this.logger.warn(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'warn'
    });
  }
  
  info(message: string, meta: any = {}): void {
    this.logger.info(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'info'
    });
  }
  
  debug(message: string, meta: any = {}): void {
    this.logger.debug(message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'debug'
    });
  }
  
  trace(message: string, meta: any = {}): void {
    this.logger.log('trace', message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'trace'
    });
  }
  
  /**
   * HTTP request logging
   */
  http(message: string, meta: any = {}): void {
    this.logger.log('http', message, {
      ...meta,
      timestamp: new Date().toISOString(),
      level: 'http'
    });
  }
  
  /**
   * Security event logging
   */
  security(event: string, meta: any = {}): void {
    this.logger.info(`SECURITY: ${event}`, {
      ...meta,
      type: 'SECURITY_EVENT',
      event,
      timestamp: new Date().toISOString(),
      environment: env.config.NODE_ENV,
      hostname: process.env.HOSTNAME || 'unknown'
    });
  }
  
  /**
   * Performance logging
   */
  performance(operation: string, duration: number, meta: any = {}): void {
    const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
    
    this.logger.log(level, `PERFORMANCE: ${operation}`, {
      ...meta,
      type: 'PERFORMANCE_EVENT',
      operation,
      duration,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Audit logging for compliance
   */
  audit(action: string, meta: any = {}): void {
    this.logger.info(`AUDIT: ${action}`, {
      ...meta,
      type: 'AUDIT_EVENT',
      action,
      timestamp: new Date().toISOString(),
      environment: env.config.NODE_ENV
    });
  }
  
  /**
   * Business event logging
   */
  business(event: string, meta: any = {}): void {
    this.logger.info(`BUSINESS: ${event}`, {
      ...meta,
      type: 'BUSINESS_EVENT',
      event,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Database operation logging
   */
  database(operation: string, meta: any = {}): void {
    this.logger.debug(`DATABASE: ${operation}`, {
      ...meta,
      type: 'DATABASE_EVENT',
      operation,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * External service logging
   */
  external(service: string, operation: string, meta: any = {}): void {
    this.logger.info(`EXTERNAL: ${service} - ${operation}`, {
      ...meta,
      type: 'EXTERNAL_SERVICE_EVENT',
      service,
      operation,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Create child logger with consistent metadata
   */
  child(metadata: any): EnterpriseLogger {
    const childLogger = Object.create(this);
    const originalMethods = ['error', 'warn', 'info', 'debug', 'trace', 'http'];
    
    originalMethods.forEach(method => {
      childLogger[method] = (message: string, meta: any = {}) => {
        this[method](message, { ...metadata, ...meta });
      };
    });
    
    return childLogger;
  }
  
  /**
   * Get winston logger instance for advanced usage
   */
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}

// Export singleton instance
export const logger = new EnterpriseLogger();

/**
 * Express middleware for HTTP request logging
 */
export const httpLoggerMiddleware = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  const correlationId = req.correlationId || 'unknown';
  
  // Log request start
  logger.http('Request started', {
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  
  // Capture response details
  const originalSend = res.send;
  res.send = function(data: any) {
    const duration = Date.now() - startTime;
    const contentLength = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data || '', 'utf8');
    
    // Log request completion
    logger.http('Request completed', {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      contentLength,
      ip: req.ip,
      userId: req.user?.id
    });
    
    // Performance logging for slow requests
    if (duration > 1000) {
      logger.performance(`${req.method} ${req.path}`, duration, {
        correlationId,
        statusCode: res.statusCode
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Context-aware logger factory
 */
export const createContextLogger = (context: any) => {
  return logger.child(context);
};

// Add colors to winston
winston.addColors(customLevels.colors);

export default logger;