import winston from 'winston';
import path from 'path';
import { Env } from '../utils/env';

const logLevel = Env.get('LOG_LEVEL', 'info');
const logFilePath = Env.get('LOG_FILE_PATH', path.join(__dirname, '../../logs/app.log'));

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'urbansend-backend' },
  transports: [
    new winston.transports.File({ filename: logFilePath }),
    new winston.transports.File({ 
      filename: path.join(path.dirname(logFilePath), 'error.log'), 
      level: 'error' 
    }),
  ],
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