import { logger as baseLogger } from './logger';
import { Env } from '../utils/env';

/**
 * Sistema de logging otimizado para Fase 3
 * Implementa throttling, sampling e conditional logging para melhorar performance
 */

interface LogEntry {
  level: string;
  message: string;
  data?: any;
  timestamp: number;
  count?: number;
}

interface ThrottleConfig {
  maxLogsPerSecond: number;
  burstSize: number;
  windowMs: number;
}

interface SamplingConfig {
  rate: number; // 0.0 to 1.0 (percentage of logs to keep)
  maxPerMinute: number;
}

class OptimizedLogger {
  private static instance: OptimizedLogger;
  private throttleCounters = new Map<string, { count: number; lastReset: number }>();
  private samplingCounters = new Map<string, { count: number; logged: number; lastReset: number }>();
  private recentLogs = new Map<string, LogEntry>();
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout;

  // Configurações por nível de log
  private readonly configs = {
    debug: {
      throttle: { maxLogsPerSecond: 10, burstSize: 50, windowMs: 1000 } as ThrottleConfig,
      sampling: { rate: 0.1, maxPerMinute: 100 } as SamplingConfig,
      enabled: !Env.isProduction // Debug desabilitado em produção
    },
    info: {
      throttle: { maxLogsPerSecond: 50, burstSize: 100, windowMs: 1000 } as ThrottleConfig,
      sampling: { rate: 0.5, maxPerMinute: 300 } as SamplingConfig,
      enabled: true
    },
    warn: {
      throttle: { maxLogsPerSecond: 20, burstSize: 50, windowMs: 1000 } as ThrottleConfig,
      sampling: { rate: 0.9, maxPerMinute: 200 } as SamplingConfig,
      enabled: true
    },
    error: {
      throttle: { maxLogsPerSecond: 100, burstSize: 200, windowMs: 1000 } as ThrottleConfig,
      sampling: { rate: 1.0, maxPerMinute: 1000 } as SamplingConfig,
      enabled: true // Errors sempre habilitados
    }
  };

  private constructor() {
    // Buffer flush a cada 5 segundos
    this.flushInterval = setInterval(() => {
      this.flushLogBuffer();
    }, 5000);
    
    // Cleanup de contadores antigos a cada minuto
    setInterval(() => {
      this.cleanupCounters();
    }, 60000);
  }

  static getInstance(): OptimizedLogger {
    if (!OptimizedLogger.instance) {
      OptimizedLogger.instance = new OptimizedLogger();
    }
    return OptimizedLogger.instance;
  }

  /**
   * Log debug otimizado
   */
  debug(message: string, data?: any, context?: string): void {
    this.logWithOptimization('debug', message, data, context);
  }

  /**
   * Log info otimizado
   */
  info(message: string, data?: any, context?: string): void {
    this.logWithOptimization('info', message, data, context);
  }

  /**
   * Log warn otimizado
   */
  warn(message: string, data?: any, context?: string): void {
    this.logWithOptimization('warn', message, data, context);
  }

  /**
   * Log error otimizado (sempre passa, mas pode ser throttled)
   */
  error(message: string, data?: any, context?: string): void {
    this.logWithOptimization('error', message, data, context);
  }

  /**
   * Logging condicional - só loga se condição for verdadeira
   */
  debugIf(condition: boolean, message: string, data?: any, context?: string): void {
    if (condition) {
      this.debug(message, data, context);
    }
  }

  infoIf(condition: boolean, message: string, data?: any, context?: string): void {
    if (condition) {
      this.info(message, data, context);
    }
  }

  warnIf(condition: boolean, message: string, data?: any, context?: string): void {
    if (condition) {
      this.warn(message, data, context);
    }
  }

  /**
   * Log com sampling - para logs de alta frequência
   */
  debugSample(message: string, data?: any, context?: string, sampleRate: number = 0.01): void {
    if (Math.random() < sampleRate) {
      this.debug(message, data, context);
    }
  }

  infoSample(message: string, data?: any, context?: string, sampleRate: number = 0.1): void {
    if (Math.random() < sampleRate) {
      this.info(message, data, context);
    }
  }

  /**
   * Log agregado - agrupa logs similares
   */
  infoAggregate(key: string, message: string, data?: any, windowMs: number = 60000): void {
    const existing = this.recentLogs.get(key);
    const now = Date.now();

    if (existing && (now - existing.timestamp) < windowMs) {
      // Atualizar contador
      existing.count = (existing.count || 1) + 1;
      existing.data = { ...existing.data, ...data };
    } else {
      // Nova entrada
      this.recentLogs.set(key, {
        level: 'info',
        message,
        data,
        timestamp: now,
        count: 1
      });

      // Agendar flush deste agregado
      setTimeout(() => {
        this.flushAggregate(key);
      }, windowMs);
    }
  }

  /**
   * Log de performance - só loga se o tempo exceder threshold
   */
  logPerformance(operation: string, durationMs: number, threshold: number = 1000, data?: any): void {
    if (durationMs > threshold) {
      this.warn(`Slow operation: ${operation}`, {
        duration: durationMs,
        threshold,
        ...data
      }, 'performance');
    } else {
      // Log sample de operações normais
      this.debugSample(`Operation completed: ${operation}`, {
        duration: durationMs,
        ...data
      }, 'performance', 0.01);
    }
  }

  /**
   * Medir e logar performance de função
   */
  async measureAndLog<T>(
    operation: string,
    fn: () => Promise<T> | T,
    threshold: number = 1000
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.logPerformance(operation, duration, threshold);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`Operation failed: ${operation}`, {
        duration,
        error: error instanceof Error ? error.message : String(error)
      }, 'performance');
      throw error;
    }
  }

  /**
   * Log principal com otimizações
   */
  private logWithOptimization(
    level: keyof typeof this.configs,
    message: string,
    data?: any,
    context?: string
  ): void {
    const config = this.configs[level];
    
    // Verificar se está habilitado
    if (!config.enabled) {
      return;
    }

    // Gerar chave única para throttling
    const throttleKey = `${level}:${context || 'default'}:${message.substring(0, 50)}`;
    
    // Aplicar throttling
    if (!this.shouldLogThrottled(throttleKey, config.throttle)) {
      return;
    }

    // Aplicar sampling
    if (!this.shouldLogSampled(throttleKey, config.sampling)) {
      return;
    }

    // Otimizar dados antes de logar
    const optimizedData = this.optimizeLogData(data);

    // Adicionar ao buffer ou logar diretamente
    if (level === 'error') {
      // Errors são imediatos
      this.logDirectly(level, message, optimizedData, context);
    } else {
      // Outros níveis vão para buffer
      this.addToBuffer(level, message, optimizedData, context);
    }
  }

  /**
   * Verificar throttling
   */
  private shouldLogThrottled(key: string, config: ThrottleConfig): boolean {
    const now = Date.now();
    let counter = this.throttleCounters.get(key);

    if (!counter || (now - counter.lastReset) > config.windowMs) {
      // Reset counter
      counter = { count: 1, lastReset: now };
      this.throttleCounters.set(key, counter);
      return true;
    }

    counter.count++;
    
    // Permitir burst inicial, depois aplicar rate limit
    if (counter.count <= config.burstSize) {
      return true;
    }

    const elapsed = now - counter.lastReset;
    const allowedCount = Math.floor((elapsed / 1000) * config.maxLogsPerSecond) + config.burstSize;
    
    return counter.count <= allowedCount;
  }

  /**
   * Verificar sampling
   */
  private shouldLogSampled(key: string, config: SamplingConfig): boolean {
    const now = Date.now();
    let counter = this.samplingCounters.get(key);

    if (!counter || (now - counter.lastReset) > 60000) { // Reset a cada minuto
      counter = { count: 1, logged: 0, lastReset: now };
      this.samplingCounters.set(key, counter);
    } else {
      counter.count++;
    }

    // Verificar limite máximo por minuto
    if (counter.logged >= config.maxPerMinute) {
      return false;
    }

    // Verificar sampling rate
    if (Math.random() <= config.rate) {
      counter.logged++;
      return true;
    }

    return false;
  }

  /**
   * Otimizar dados de log para evitar serialização custosa
   */
  private optimizeLogData(data: any): any {
    if (!data) return data;

    // Limitar profundidade de objetos
    if (typeof data === 'object' && data !== null) {
      try {
        // Converter para JSON e truncar se muito grande
        const jsonStr = JSON.stringify(data);
        if (jsonStr.length > 5000) {
          return { 
            ...data, 
            _truncated: true, 
            _originalSize: jsonStr.length,
            _excerpt: jsonStr.substring(0, 500)
          };
        }
      } catch (error) {
        return { _serializationError: 'Failed to serialize log data' };
      }
    }

    return data;
  }

  /**
   * Adicionar ao buffer
   */
  private addToBuffer(level: string, message: string, data?: any, context?: string): void {
    this.logBuffer.push({
      level,
      message,
      data,
      timestamp: Date.now()
    });

    // Flush se buffer muito grande
    if (this.logBuffer.length > 100) {
      this.flushLogBuffer();
    }
  }

  /**
   * Log direto (bypass buffer)
   */
  private logDirectly(level: string, message: string, data?: any, context?: string): void {
    const logData = context ? { context, ...data } : data;
    
    switch (level) {
      case 'debug':
        baseLogger.debug(message, logData);
        break;
      case 'info':
        baseLogger.info(message, logData);
        break;
      case 'warn':
        baseLogger.warn(message, logData);
        break;
      case 'error':
        baseLogger.error(message, logData);
        break;
    }
  }

  /**
   * Flush do buffer de logs
   */
  private flushLogBuffer(): void {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = this.logBuffer.splice(0);
    
    // Agrupar por nível para batch logging
    const groupedLogs = logsToFlush.reduce((acc, log) => {
      if (!acc[log.level]) acc[log.level] = [];
      acc[log.level].push(log);
      return acc;
    }, {} as Record<string, LogEntry[]>);

    // Log em batch por nível
    for (const [level, logs] of Object.entries(groupedLogs)) {
      if (logs.length === 1) {
        this.logDirectly(level, logs[0].message, logs[0].data);
      } else {
        this.logDirectly(level, `Batch log (${logs.length} entries)`, {
          entries: logs.map(log => ({
            message: log.message,
            data: log.data
          }))
        });
      }
    }
  }

  /**
   * Flush de log agregado
   */
  private flushAggregate(key: string): void {
    const entry = this.recentLogs.get(key);
    if (!entry) return;

    this.recentLogs.delete(key);

    if (entry.count && entry.count > 1) {
      this.logDirectly(entry.level, `${entry.message} (occurred ${entry.count} times)`, entry.data);
    } else {
      this.logDirectly(entry.level, entry.message, entry.data);
    }
  }

  /**
   * Limpeza de contadores antigos
   */
  private cleanupCounters(): void {
    const now = Date.now();
    
    // Limpar throttle counters antigos
    for (const [key, counter] of this.throttleCounters.entries()) {
      if (now - counter.lastReset > 300000) { // 5 minutos
        this.throttleCounters.delete(key);
      }
    }

    // Limpar sampling counters antigos
    for (const [key, counter] of this.samplingCounters.entries()) {
      if (now - counter.lastReset > 300000) { // 5 minutos
        this.samplingCounters.delete(key);
      }
    }
  }

  /**
   * Obter estatísticas do logger
   */
  getStats() {
    return {
      bufferSize: this.logBuffer.length,
      throttleCounters: this.throttleCounters.size,
      samplingCounters: this.samplingCounters.size,
      recentLogs: this.recentLogs.size,
      configs: this.configs
    };
  }

  /**
   * Destruir instância (para testes)
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushLogBuffer();
    this.throttleCounters.clear();
    this.samplingCounters.clear();
    this.recentLogs.clear();
  }
}

// Export singleton instance
export const optimizedLogger = OptimizedLogger.getInstance();

// Convenience exports para compatibilidade
export const logger = {
  debug: (message: string, data?: any, context?: string) => optimizedLogger.debug(message, data, context),
  info: (message: string, data?: any, context?: string) => optimizedLogger.info(message, data, context),
  warn: (message: string, data?: any, context?: string) => optimizedLogger.warn(message, data, context),
  error: (message: string, data?: any, context?: string) => optimizedLogger.error(message, data, context),
  
  // Métodos otimizados
  debugIf: (condition: boolean, message: string, data?: any, context?: string) => optimizedLogger.debugIf(condition, message, data, context),
  infoIf: (condition: boolean, message: string, data?: any, context?: string) => optimizedLogger.infoIf(condition, message, data, context),
  warnIf: (condition: boolean, message: string, data?: any, context?: string) => optimizedLogger.warnIf(condition, message, data, context),
  
  debugSample: (message: string, data?: any, context?: string, sampleRate?: number) => optimizedLogger.debugSample(message, data, context, sampleRate),
  infoSample: (message: string, data?: any, context?: string, sampleRate?: number) => optimizedLogger.infoSample(message, data, context, sampleRate),
  
  infoAggregate: (key: string, message: string, data?: any, windowMs?: number) => optimizedLogger.infoAggregate(key, message, data, windowMs),
  
  logPerformance: (operation: string, durationMs: number, threshold?: number, data?: any) => optimizedLogger.logPerformance(operation, durationMs, threshold, data),
  measureAndLog: <T>(operation: string, fn: () => Promise<T> | T, threshold?: number) => optimizedLogger.measureAndLog(operation, fn, threshold)
};