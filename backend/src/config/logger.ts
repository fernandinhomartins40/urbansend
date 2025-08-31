import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { Env } from '../utils/env';

const logLevel = Env.get('LOG_LEVEL', 'info');
const logFilePath = Env.get('LOG_FILE_PATH', path.join(__dirname, '../../logs/app.log'));
const logDir = path.dirname(logFilePath);

// Enhanced production logging format with structured data
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS Z'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const logEntry: any = {
      timestamp,
      level: level.toUpperCase(),
      service,
      message,
      ...meta
    };
    
    // Add request context if available
    if (meta.method && meta.url) {
      logEntry.request = {
        method: meta.method,
        url: meta.url,
        ip: meta.ip,
        userAgent: meta.userAgent
      };
    }
    
    // Add performance data if available
    if (meta.responseTime) {
      logEntry.performance = {
        responseTime: meta.responseTime,
        memoryUsage: meta.memoryUsage
      };
    }

    return JSON.stringify(logEntry);
  })
);

// Development format for better readability
const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Production transports with daily rotation
if (Env.isProduction) {
  // Main application log with daily rotation
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'app-%DATE%.log'),
    datePattern: Env.get('LOG_DATE_PATTERN', 'YYYY-MM-DD'),
    maxSize: Env.get('LOG_MAX_SIZE', '100m'),
    maxFiles: Env.get('LOG_MAX_FILES', '30'),
    level: logLevel,
    format: productionFormat
  }));

  // Error log with daily rotation
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: Env.get('LOG_DATE_PATTERN', 'YYYY-MM-DD'),
    maxSize: Env.get('LOG_MAX_SIZE', '100m'),
    maxFiles: Env.get('LOG_MAX_FILES', '30'),
    level: 'error',
    format: productionFormat
  }));

  // Performance log for detailed monitoring
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'performance-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '7', // Keep only 7 days of performance logs
    level: 'info',
    format: productionFormat
  }));

  // Security log for auth and security events
  transports.push(new DailyRotateFile({
    filename: path.join(logDir, 'security-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '90', // Keep security logs longer
    level: 'info',
    format: productionFormat
  }));
} else {
  // Development/staging transports
  transports.push(new winston.transports.File({ 
    filename: logFilePath,
    format: productionFormat
  }));
  
  transports.push(new winston.transports.File({ 
    filename: path.join(logDir, 'error.log'), 
    level: 'error',
    format: productionFormat
  }));
}

const logger = winston.createLogger({
  level: logLevel,
  format: Env.isProduction ? productionFormat : developmentFormat,
  defaultMeta: { 
    service: 'ultrazend-backend',
    environment: Env.get('NODE_ENV'),
    version: Env.get('APP_VERSION', '1.0.0'),
    buildNumber: Env.get('BUILD_NUMBER', 'unknown'),
    hostname: require('os').hostname(),
    pid: process.pid
  },
  transports,
  // Exit on error only in development
  exitOnError: !Env.isProduction
});

if (!Env.isProduction) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export { logger };