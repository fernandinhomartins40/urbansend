/**
 * @ultrazend/smtp-internal - Simple Logger
 * Logger simples com fallback para console
 */

import { LoggerInterface } from '../types';

export class SimpleLogger implements LoggerInterface {
  private enabled: boolean;
  private level: string;

  constructor(options: { enabled?: boolean; level?: string } = {}) {
    this.enabled = options.enabled !== false;
    this.level = options.level || 'info';
  }

  info(message: string, meta?: object): void {
    if (this.enabled && this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  error(message: string, meta?: object): void {
    if (this.enabled && this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  warn(message: string, meta?: object): void {
    if (this.enabled && this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  debug(message: string, meta?: object): void {
    if (this.enabled && this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentIndex = levels.indexOf(this.level);
    const messageIndex = levels.indexOf(level);
    return messageIndex <= currentIndex;
  }
}

// Default logger instance
export const logger = new SimpleLogger();