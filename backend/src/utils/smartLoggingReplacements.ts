import { logger } from '../config/optimizedLogger';

/**
 * Utilitários para substituir padrões de logging ineficientes por otimizados
 * Fornece funções de conveniência para casos comuns de logging
 */

/**
 * Log de início/fim de operação com medição automática de tempo
 */
export function logOperationScope<T>(
  operation: string,
  fn: () => Promise<T> | T,
  context?: string
): Promise<T> {
  return logger.measureAndLog(operation, fn, 1000);
}

/**
 * Log condicional baseado em ambiente
 */
export function logDevelopment(message: string, data?: any): void {
  logger.debugIf(process.env.NODE_ENV === 'development', message, data, 'dev');
}

/**
 * Log de alta frequência com sampling
 */
export function logHighFrequency(message: string, data?: any, sampleRate: number = 0.01): void {
  logger.infoSample(message, data, 'high-freq', sampleRate);
}

/**
 * Log de procesamento de queue com agregação
 */
export function logQueueProcessing(
  jobType: string,
  jobId: string | number,
  status: 'start' | 'complete' | 'failed',
  data?: any
): void {
  const key = `queue-${jobType}-${status}`;
  
  if (status === 'failed') {
    // Erros sempre logados
    logger.error(`Queue job failed: ${jobType}`, {
      jobId,
      jobType,
      ...data
    }, 'queue');
  } else {
    // Sucessos agregados
    logger.infoAggregate(
      key,
      `Queue ${jobType} ${status}`,
      { jobId, jobType, ...data },
      30000 // 30 segundos de janela
    );
  }
}

/**
 * Log de validação com throttling
 */
export function logValidation(
  entity: string,
  field: string,
  isValid: boolean,
  error?: string
): void {
  if (!isValid) {
    logger.warn(`Validation failed: ${entity}.${field}`, {
      entity,
      field,
      error
    }, 'validation');
  } else {
    // Validações bem-sucedidas com sampling baixo
    logger.debugSample(`Validation passed: ${entity}.${field}`, {
      entity,
      field
    }, 'validation', 0.001);
  }
}

/**
 * Log de requisições HTTP com inteligência
 */
export function logHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: number
): void {
  const isError = statusCode >= 400;
  const isSlow = duration > 2000;
  
  if (isError) {
    logger.warn(`HTTP ${statusCode}: ${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      userId
    }, 'http');
  } else if (isSlow) {
    logger.warn(`Slow HTTP request: ${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      userId
    }, 'http-performance');
  } else {
    // Requests normais com sampling
    logger.debugSample(`HTTP ${statusCode}: ${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      userId
    }, 'http', 0.01);
  }
}

/**
 * Log de conexões de database com inteligência
 */
export function logDatabaseOperation(
  operation: string,
  table: string,
  duration: number,
  affectedRows?: number,
  error?: Error
): void {
  if (error) {
    logger.error(`Database error: ${operation} on ${table}`, {
      operation,
      table,
      duration,
      affectedRows,
      error: error.message
    }, 'database');
  } else if (duration > 1000) {
    logger.warn(`Slow database query: ${operation} on ${table}`, {
      operation,
      table,
      duration,
      affectedRows
    }, 'database-performance');
  } else {
    // Queries normais agregadas
    logger.infoAggregate(
      `db-${operation}-${table}`,
      `Database ${operation} on ${table}`,
      { operation, table, duration, affectedRows },
      60000 // 1 minuto
    );
  }
}

/**
 * Log de processamento de emails com context
 */
export function logEmailProcessing(
  emailId: string,
  status: 'queued' | 'processing' | 'sent' | 'failed' | 'bounced',
  recipient: string,
  error?: string,
  metadata?: any
): void {
  const context = 'email-processing';
  
  switch (status) {
    case 'failed':
    case 'bounced':
      logger.error(`Email ${status}: ${emailId}`, {
        emailId,
        recipient,
        error,
        ...metadata
      }, context);
      break;
      
    case 'sent':
      logger.info(`Email sent: ${emailId}`, {
        emailId,
        recipient,
        ...metadata
      }, context);
      break;
      
    case 'processing':
    case 'queued':
      // Estados intermediários com sampling
      logger.debugSample(`Email ${status}: ${emailId}`, {
        emailId,
        recipient,
        ...metadata
      }, context, 0.1);
      break;
  }
}

/**
 * Log de cache operations com inteligência
 */
export function logCacheOperation(
  operation: 'hit' | 'miss' | 'set' | 'delete',
  key: string,
  duration?: number,
  error?: Error
): void {
  if (error) {
    logger.error(`Cache error: ${operation} ${key}`, {
      operation,
      key,
      error: error.message
    }, 'cache');
  } else {
    // Cache operations agregadas por tipo
    logger.infoAggregate(
      `cache-${operation}`,
      `Cache ${operation}`,
      { key, duration },
      30000 // 30 segundos
    );
  }
}

/**
 * Log de conexões externas (SMTP, APIs, etc)
 */
export function logExternalConnection(
  service: string,
  operation: string,
  success: boolean,
  duration: number,
  error?: Error,
  metadata?: any
): void {
  const context = `external-${service}`;
  
  if (!success || error) {
    logger.error(`External ${service} ${operation} failed`, {
      service,
      operation,
      duration,
      error: error?.message,
      ...metadata
    }, context);
  } else if (duration > 5000) {
    logger.warn(`Slow external ${service} ${operation}`, {
      service,
      operation,
      duration,
      ...metadata
    }, context);
  } else {
    // Operações normais com sampling
    logger.debugSample(`External ${service} ${operation} success`, {
      service,
      operation,
      duration,
      ...metadata
    }, context, 0.05);
  }
}

/**
 * Log de métricas de sistema
 */
export function logSystemMetrics(
  metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    queueLength?: number;
    activeConnections?: number;
    [key: string]: any;
  }
): void {
  // Métricas agregadas a cada 5 minutos
  logger.infoAggregate(
    'system-metrics',
    'System metrics',
    metrics,
    300000 // 5 minutos
  );
}

/**
 * Log de autenticação com segurança
 */
export function logAuthentication(
  event: 'login' | 'logout' | 'failed_login' | 'token_refresh',
  userId?: number,
  ip?: string,
  userAgent?: string,
  error?: string
): void {
  const context = 'auth';
  
  // Dados sensíveis são filtrados
  const logData = {
    userId,
    ip: ip ? ip.substring(0, 12) + '***' : undefined, // Mascarar IP parcialmente
    userAgent: userAgent ? userAgent.substring(0, 50) : undefined,
    error
  };
  
  if (event === 'failed_login' || error) {
    logger.warn(`Authentication ${event}`, logData, context);
  } else {
    logger.info(`Authentication ${event}`, logData, context);
  }
}

/**
 * Wrapper para substituir logger.debug em loops
 */
export function logInLoop<T>(
  items: T[],
  logFn: (item: T, index: number) => void,
  sampleRate: number = 0.1,
  maxLogs: number = 10
): void {
  const totalItems = items.length;
  let loggedCount = 0;
  
  items.forEach((item, index) => {
    // Log primeiro, último e alguns no meio
    const shouldLog = index === 0 || 
                     index === totalItems - 1 || 
                     (Math.random() < sampleRate && loggedCount < maxLogs);
    
    if (shouldLog) {
      logFn(item, index);
      loggedCount++;
    }
  });
  
  // Log resumo se necessário
  if (totalItems > maxLogs) {
    logger.debug(`Processed ${totalItems} items (logged ${loggedCount})`, {
      totalItems,
      loggedCount,
      sampleRate
    });
  }
}