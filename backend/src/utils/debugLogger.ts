/**
 * 🔍 DEBUG LOGGER - FASE 5 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Sistema de logs claros para debugging da integração domínios + emails
 * Fornece logs estruturados para análise de problemas e performance
 */

import { logger } from '../config/logger';
import { performance } from 'perf_hooks';

export interface EmailSendContext {
  userId: number;
  from: string;
  to: string | string[];
  subject: string;
  domain: string;
  requestId: string;
  userAgent?: string;
  ip?: string;
}

export interface DomainValidationContext {
  userId: number;
  domain: string;
  requestId: string;
  validationType: 'email_send' | 'direct_check' | 'batch_validation';
}

export interface PerformanceContext {
  operation: string;
  requestId: string;
  startTime: number;
  userId?: number;
  domain?: string;
}

/**
 * Debug Logger para integração domínios + emails
 */
export class DebugLogger {
  private static instance: DebugLogger;
  
  private constructor() {}
  
  public static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  /**
   * 📧 LOG DE ENVIO DE EMAIL - FASE 3 INTEGRAÇÃO
   */
  public logEmailSendStart(context: EmailSendContext): void {
    logger.info('🚀 EMAIL SEND V2 - Iniciando', {
      requestId: context.requestId,
      userId: context.userId,
      from: context.from,
      to: Array.isArray(context.to) ? `${context.to.length} recipients` : context.to,
      subject: context.subject,
      domain: context.domain,
      phase: 'FASE_5_TESTING',
      userAgent: context.userAgent,
      ip: context.ip,
      timestamp: new Date().toISOString()
    });
  }

  public logEmailSendDomainCheck(context: EmailSendContext, domainResult: { verified: boolean, verifiedAt?: Date }): void {
    const logLevel = domainResult.verified ? 'info' : 'warn';
    const status = domainResult.verified ? '✅ VERIFICADO' : '❌ NÃO VERIFICADO';
    
    logger[logLevel](`🔍 EMAIL SEND V2 - Validação de Domínio: ${status}`, {
      requestId: context.requestId,
      userId: context.userId,
      domain: context.domain,
      verified: domainResult.verified,
      verifiedAt: domainResult.verifiedAt?.toISOString(),
      phase: 'DOMAIN_VALIDATION',
      from: context.from,
      timestamp: new Date().toISOString()
    });
  }

  public logEmailSendSuccess(context: EmailSendContext, jobId: string, processingTime: number): void {
    logger.info('✅ EMAIL SEND V2 - Sucesso', {
      requestId: context.requestId,
      userId: context.userId,
      jobId,
      domain: context.domain,
      from: context.from,
      to: Array.isArray(context.to) ? `${context.to.length} recipients` : context.to,
      processingTime: `${processingTime.toFixed(2)}ms`,
      phase: 'EMAIL_QUEUED',
      timestamp: new Date().toISOString()
    });
  }

  public logEmailSendError(context: EmailSendContext, error: any, processingTime: number): void {
    const errorCode = error.code || 'UNKNOWN_ERROR';
    const errorMessage = error.message || 'Unknown error occurred';
    
    logger.error('❌ EMAIL SEND V2 - Erro', {
      requestId: context.requestId,
      userId: context.userId,
      domain: context.domain,
      from: context.from,
      error: {
        code: errorCode,
        message: errorMessage,
        stack: error.stack
      },
      processingTime: `${processingTime.toFixed(2)}ms`,
      phase: 'EMAIL_SEND_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 🔍 LOG DE VALIDAÇÃO DE DOMÍNIO - EMAILVALIDATOR
   */
  public logDomainValidationStart(context: DomainValidationContext): void {
    logger.info('🔍 DOMAIN VALIDATION - Iniciando', {
      requestId: context.requestId,
      userId: context.userId,
      domain: context.domain,
      validationType: context.validationType,
      phase: 'DOMAIN_CHECK_START',
      timestamp: new Date().toISOString()
    });
  }

  public logDomainValidationResult(
    context: DomainValidationContext, 
    result: { verified: boolean, verifiedAt?: Date }, 
    processingTime: number,
    databaseQuery?: { queryTime: number, recordsFound: number }
  ): void {
    const status = result.verified ? '✅ VERIFICADO' : '❌ NÃO VERIFICADO';
    
    logger.info(`🔍 DOMAIN VALIDATION - ${status}`, {
      requestId: context.requestId,
      userId: context.userId,
      domain: context.domain,
      validated: result.verified,
      verifiedAt: result.verifiedAt?.toISOString(),
      processingTime: `${processingTime.toFixed(2)}ms`,
      validationType: context.validationType,
      database: databaseQuery ? {
        queryTime: `${databaseQuery.queryTime.toFixed(2)}ms`,
        recordsFound: databaseQuery.recordsFound
      } : undefined,
      phase: 'DOMAIN_CHECK_COMPLETE',
      timestamp: new Date().toISOString()
    });
  }

  public logDomainValidationError(context: DomainValidationContext, error: any, processingTime: number): void {
    logger.error('❌ DOMAIN VALIDATION - Erro', {
      requestId: context.requestId,
      userId: context.userId,
      domain: context.domain,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      processingTime: `${processingTime.toFixed(2)}ms`,
      validationType: context.validationType,
      phase: 'DOMAIN_CHECK_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * ⚡ LOG DE PERFORMANCE
   */
  public logPerformanceStart(context: PerformanceContext): number {
    const startTime = performance.now();
    
    logger.debug('⚡ PERFORMANCE - Iniciando medição', {
      requestId: context.requestId,
      operation: context.operation,
      userId: context.userId,
      domain: context.domain,
      timestamp: new Date().toISOString()
    });
    
    return startTime;
  }

  public logPerformanceEnd(context: PerformanceContext, startTime: number, additionalData?: any): void {
    const endTime = performance.now();
    const duration = endTime - startTime;
    const performanceLevel = this.getPerformanceLevel(duration, context.operation);
    
    logger.info(`⚡ PERFORMANCE - ${performanceLevel.emoji} ${performanceLevel.status}`, {
      requestId: context.requestId,
      operation: context.operation,
      duration: `${duration.toFixed(2)}ms`,
      performanceLevel: performanceLevel.level,
      userId: context.userId,
      domain: context.domain,
      benchmark: performanceLevel.benchmark,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 📊 LOG DE MÉTRICAS E ESTATÍSTICAS
   */
  public logIntegrationMetrics(metrics: {
    emailsSent: number;
    emailsSuccessful: number;
    emailsFailed: number;
    domainsValidated: number;
    domainsVerified: number;
    avgEmailSendTime: number;
    avgDomainValidationTime: number;
    errorRate: number;
    successRate: number;
    timeRange: string;
  }): void {
    logger.info('📊 INTEGRATION METRICS - Métricas de Performance', {
      timeRange: metrics.timeRange,
      emails: {
        sent: metrics.emailsSent,
        successful: metrics.emailsSuccessful,
        failed: metrics.emailsFailed,
        successRate: `${metrics.successRate.toFixed(2)}%`,
        errorRate: `${metrics.errorRate.toFixed(2)}%`,
        avgSendTime: `${metrics.avgEmailSendTime.toFixed(2)}ms`
      },
      domains: {
        validated: metrics.domainsValidated,
        verified: metrics.domainsVerified,
        verificationRate: metrics.domainsValidated > 0 ? 
          `${((metrics.domainsVerified / metrics.domainsValidated) * 100).toFixed(2)}%` : '0%',
        avgValidationTime: `${metrics.avgDomainValidationTime.toFixed(2)}ms`
      },
      phase: 'INTEGRATION_METRICS',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 🚨 LOG DE PROBLEMAS CRÍTICOS
   */
  public logCriticalIssue(issue: {
    type: 'HIGH_ERROR_RATE' | 'SLOW_PERFORMANCE' | 'DOMAIN_VALIDATION_FAILURE' | 'SYSTEM_OVERLOAD';
    description: string;
    context: any;
    impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    suggestedAction?: string;
  }): void {
    const emoji = this.getIssueEmoji(issue.type);
    
    logger.error(`🚨 CRITICAL ISSUE - ${emoji} ${issue.type}`, {
      issueType: issue.type,
      description: issue.description,
      impact: issue.impact,
      context: issue.context,
      suggestedAction: issue.suggestedAction,
      phase: 'CRITICAL_MONITORING',
      timestamp: new Date().toISOString(),
      alertLevel: 'CRITICAL'
    });
  }

  /**
   * 🔄 LOG DE FALLBACK E RECUPERAÇÃO
   */
  public logFallbackAction(action: {
    trigger: string;
    fallbackType: 'DOMAIN_FALLBACK' | 'SERVICE_FALLBACK' | 'ERROR_RECOVERY';
    originalRequest: any;
    fallbackRequest: any;
    requestId: string;
  }): void {
    logger.warn('🔄 FALLBACK ACTION - Ação de recuperação', {
      requestId: action.requestId,
      trigger: action.trigger,
      fallbackType: action.fallbackType,
      originalRequest: action.originalRequest,
      fallbackRequest: action.fallbackRequest,
      phase: 'FALLBACK_RECOVERY',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 🎯 LOG DE TESTE E VALIDAÇÃO (FASE 5)
   */
  public logTestExecution(test: {
    testName: string;
    testType: 'E2E' | 'PERFORMANCE' | 'EDGE_CASE' | 'INTEGRATION';
    status: 'STARTED' | 'PASSED' | 'FAILED' | 'SKIPPED';
    duration?: number;
    assertions?: { passed: number; failed: number; total: number };
    error?: any;
    requestId: string;
  }): void {
    const emoji = test.status === 'PASSED' ? '✅' : test.status === 'FAILED' ? '❌' : '🧪';
    
    logger.info(`🧪 TEST EXECUTION - ${emoji} ${test.status}`, {
      requestId: test.requestId,
      testName: test.testName,
      testType: test.testType,
      status: test.status,
      duration: test.duration ? `${test.duration.toFixed(2)}ms` : undefined,
      assertions: test.assertions,
      error: test.error ? {
        message: test.error.message,
        code: test.error.code
      } : undefined,
      phase: 'FASE_5_TESTING',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 🛠️ MÉTODOS AUXILIARES PRIVADOS
   */
  private getPerformanceLevel(duration: number, operation: string): {
    level: string;
    status: string;
    emoji: string;
    benchmark: string;
  } {
    const benchmarks = {
      'email_send': { excellent: 500, good: 1000, acceptable: 2000 },
      'domain_validation': { excellent: 200, good: 500, acceptable: 1000 },
      'database_query': { excellent: 50, good: 200, acceptable: 500 }
    };
    
    const benchmark = benchmarks[operation] || benchmarks['email_send'];
    
    if (duration <= benchmark.excellent) {
      return { level: 'EXCELLENT', status: 'Excelente', emoji: '🚀', benchmark: `≤${benchmark.excellent}ms` };
    } else if (duration <= benchmark.good) {
      return { level: 'GOOD', status: 'Bom', emoji: '✅', benchmark: `≤${benchmark.good}ms` };
    } else if (duration <= benchmark.acceptable) {
      return { level: 'ACCEPTABLE', status: 'Aceitável', emoji: '⚠️', benchmark: `≤${benchmark.acceptable}ms` };
    } else {
      return { level: 'SLOW', status: 'Lento', emoji: '🐌', benchmark: `>${benchmark.acceptable}ms` };
    }
  }

  private getIssueEmoji(issueType: string): string {
    const emojis = {
      'HIGH_ERROR_RATE': '📈',
      'SLOW_PERFORMANCE': '🐌',
      'DOMAIN_VALIDATION_FAILURE': '🔒',
      'SYSTEM_OVERLOAD': '💥'
    };
    return emojis[issueType] || '⚠️';
  }
}

/**
 * 🎛️ MIDDLEWARE PARA LOGS AUTOMÁTICOS
 */
export function createDebugLoggerMiddleware() {
  const debugLogger = DebugLogger.getInstance();
  
  return (req: any, res: any, next: any) => {
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    // Adicionar requestId ao request para uso em outras partes
    req.requestId = requestId;
    req.debugLogger = debugLogger;
    req.startTime = startTime;
    
    // Log de início da requisição
    if (req.path.includes('/emails-v2/')) {
      logger.debug('📨 REQUEST START - Emails V2', {
        requestId,
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }
    
    // Hook para log de fim da requisição
    const originalSend = res.send;
    res.send = function(body: any) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (req.path.includes('/emails-v2/')) {
        logger.debug('📨 REQUEST END - Emails V2', {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration.toFixed(2)}ms`,
          timestamp: new Date().toISOString()
        });
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
}

// Instância singleton para exportação
export const debugLogger = DebugLogger.getInstance();