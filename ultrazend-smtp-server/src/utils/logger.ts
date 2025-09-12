/**
 * @ultrazend/smtp-server - Logger
 * Sistema de logging para servidor SMTP
 */

import winston from 'winston';

export class Logger {
  private logger: winston.Logger;

  constructor(level: string = 'info') {
    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'ultrazend-smtp-server' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({ 
          filename: 'smtp-server-error.log', 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: 'smtp-server.log' 
        })
      ]
    });
  }

  info(message: string, meta?: object): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: object): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: object): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: object): void {
    this.logger.debug(message, meta);
  }
}

// Export singleton instance
export const logger = new Logger();