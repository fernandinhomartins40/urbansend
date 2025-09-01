import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { Env } from '../utils/env';

interface LogEntry {
  '@timestamp': string;
  '@version': string;
  level: string;
  service: string;
  environment: string;
  version: string;
  buildNumber: string;
  hostname: string;
  pid: number;
  message: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  request?: {
    method: string;
    url: string;
    ip: string;
    userAgent: string;
    headers?: Record<string, string>;
  };
  response?: {
    statusCode: number;
    contentLength?: number;
  };
  performance?: {
    responseTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
  security?: {
    action: string;
    resource?: string;
    outcome: 'success' | 'failure' | 'blocked';
    reason?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  };
  business?: {
    entity: string;
    action: string;
    entityId?: string;
    metadata?: Record<string, any>;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

const logLevel = Env.get('LOG_LEVEL', 'info');
const logDir = path.join(__dirname, '../../logs');

// Structured JSON format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD[T]HH:mm:ss.SSSZ'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry: LogEntry = {
      '@timestamp': String(timestamp),
      '@version': '1',
      level: level.toUpperCase(),
      service: 'ultrazend-backend',
      environment: Env.get('NODE_ENV', 'development'),
      version: Env.get('APP_VERSION', '1.0.0'),
      buildNumber: Env.get('BUILD_NUMBER', 'unknown'),
      hostname: require('os').hostname(),
      pid: process.pid,
      message: String(message),
      ...meta
    };

    return JSON.stringify(logEntry);
  })
);

// Human-readable format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, requestId, userId, ...meta }) => {
    let logLine = `${timestamp} [${service}]`;
    
    if (requestId) logLine += ` [${requestId}]`;
    if (userId) logLine += ` [user:${userId}]`;
    
    logLine += ` ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logLine += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logLine;
  })
);

// Create transports array
const transports: winston.transport[] = [];

if (Env.isProduction) {
  // Application logs with daily rotation
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'application', 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '100m',
    maxFiles: '30d',
    level: logLevel,
    format: productionFormat,
    auditFile: path.join(logDir, 'application', 'app-audit.json')
  }));

  // Error logs with extended retention
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'errors', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '100m',
    maxFiles: '90d',
    level: 'error',
    format: productionFormat,
    auditFile: path.join(logDir, 'errors', 'error-audit.json')
  }));

  // Security logs with extended retention
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'security', 'security-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '180d', // 6 months retention for security logs
    level: 'info',
    format: productionFormat,
    auditFile: path.join(logDir, 'security', 'security-audit.json')
  }));

  // Performance logs with shorter retention
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'performance', 'perf-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '7d', // Performance logs only kept for 7 days
    level: 'info',
    format: productionFormat,
    auditFile: path.join(logDir, 'performance', 'perf-audit.json')
  }));

  // Business event logs
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'business', 'business-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '100m',
    maxFiles: '365d', // Business logs kept for 1 year
    level: 'info',
    format: productionFormat,
    auditFile: path.join(logDir, 'business', 'business-audit.json')
  }));
} else {
  // Development file transport
  transports.push(new winston.transports.File({
    filename: path.join(logDir, 'app.log'),
    level: logLevel,
    format: productionFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }));

  // Development error transport
  transports.push(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: productionFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }));
}

// Create logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: productionFormat,
  defaultMeta: {
    service: 'ultrazend-backend',
    environment: Env.get('NODE_ENV', 'development'),
    version: Env.get('APP_VERSION', '1.0.0'),
    buildNumber: Env.get('BUILD_NUMBER', 'unknown'),
    hostname: require('os').hostname(),
    pid: process.pid
  },
  transports,
  exitOnError: false, // Don't exit on handled exceptions
  handleExceptions: true,
  handleRejections: true
});

// Console transport for development
if (!Env.isProduction) {
  logger.add(new winston.transports.Console({
    level: logLevel,
    format: developmentFormat,
    handleExceptions: true,
    handleRejections: true
  }));
}

// Structured logging helpers
class Logger {
  static request(requestId: string, method: string, url: string, ip: string, userAgent: string, headers?: Record<string, string>) {
    logger.info('HTTP Request', {
      requestId,
      request: { method, url, ip, userAgent, headers }
    });
  }

  static response(requestId: string, statusCode: number, responseTime: number, contentLength?: number) {
    logger.info('HTTP Response', {
      requestId,
      response: { statusCode, contentLength },
      performance: { 
        responseTime,
        memoryUsage: process.memoryUsage()
      }
    });
  }

  static security(action: string, outcome: 'success' | 'failure' | 'blocked', options: {
    userId?: string;
    requestId?: string;
    resource?: string;
    reason?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    ip?: string;
  } = {}) {
    const level = outcome === 'success' ? 'info' : 'warn';
    logger[level](`Security Event: ${action}`, {
      requestId: options.requestId,
      userId: options.userId,
      security: {
        action,
        resource: options.resource,
        outcome,
        reason: options.reason,
        riskLevel: options.riskLevel || 'low'
      },
      request: options.ip ? { ip: options.ip } : undefined
    });
  }

  static business(entity: string, action: string, options: {
    entityId?: string;
    userId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
  } = {}) {
    logger.info(`Business Event: ${entity}.${action}`, {
      requestId: options.requestId,
      userId: options.userId,
      business: {
        entity,
        action,
        entityId: options.entityId,
        metadata: options.metadata
      }
    });
  }

  static error(message: string, error: Error, options: {
    requestId?: string;
    userId?: string;
    context?: Record<string, any>;
  } = {}) {
    logger.error(message, {
      requestId: options.requestId,
      userId: options.userId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      },
      ...options.context
    });
  }

  static performance(operation: string, duration: number, options: {
    requestId?: string;
    metadata?: Record<string, any>;
  } = {}) {
    logger.info(`Performance: ${operation}`, {
      requestId: options.requestId,
      performance: {
        operation,
        duration,
        memoryUsage: process.memoryUsage()
      },
      ...options.metadata
    });
  }
}

export { logger, Logger };