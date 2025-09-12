/**
 * 📊 VALIDATION METRICS SERVICE - FASE 5 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Sistema de métricas precisas para monitoramento da integração domínios + emails
 * Coleta e analisa dados de performance e precisão do sistema
 */

import db from '../config/database';
import { logger } from '../config/logger';
import { debugLogger } from '../utils/debugLogger';
import { performance } from 'perf_hooks';

export interface ValidationMetrics {
  // Métricas de Domínios
  domainValidations: {
    total: number;
    successful: number;
    failed: number;
    accuracyRate: number;
    avgValidationTime: number;
  };
  
  // Métricas de Emails
  emailSending: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgSendTime: number;
  };
  
  // Métricas de Performance
  performance: {
    apiLatencyP95: number;
    apiLatencyAvg: number;
    domainValidationTime: number;
    emailProcessingTime: number;
  };
  
  // Métricas de Erros
  errors: {
    totalErrors: number;
    errorRate: number;
    commonErrors: Array<{ code: string; count: number; percentage: number }>;
    criticalErrors: number;
  };
  
  // Period info
  period: {
    start: Date;
    end: Date;
    duration: string;
  };
}

export interface DomainValidationRecord {
  domain: string;
  userId: number;
  validationTime: number;
  result: boolean;
  requestId: string;
  timestamp: Date;
  errorCode?: string;
}

export interface EmailSendRecord {
  from: string;
  to: string;
  domain: string;
  userId: number;
  processingTime: number;
  success: boolean;
  jobId?: string;
  requestId: string;
  timestamp: Date;
  errorCode?: string;
}

/**
 * Serviço de Métricas de Validação
 */
export class ValidationMetricsService {
  private static instance: ValidationMetricsService;
  private domainValidationRecords: Map<string, DomainValidationRecord> = new Map();
  private emailSendRecords: Map<string, EmailSendRecord> = new Map();
  private metricsCache: Map<string, { data: ValidationMetrics; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  
  private constructor() {}
  
  public static getInstance(): ValidationMetricsService {
    if (!ValidationMetricsService.instance) {
      ValidationMetricsService.instance = new ValidationMetricsService();
    }
    return ValidationMetricsService.instance;
  }

  /**
   * 📊 COLETAR MÉTRICAS DE VALIDAÇÃO DE DOMÍNIO
   */
  public recordDomainValidation(record: DomainValidationRecord): void {
    const key = `${record.requestId}_${record.domain}_${record.userId}`;
    this.domainValidationRecords.set(key, record);
    
    // Log para debugging
    debugLogger.logDomainValidationResult(
      {
        userId: record.userId,
        domain: record.domain,
        requestId: record.requestId,
        validationType: 'direct_check'
      },
      {
        verified: record.result,
        verifiedAt: record.result ? record.timestamp : undefined
      },
      record.validationTime
    );
    
    // Persistir no banco para análise histórica
    this.persistDomainValidationRecord(record).catch(error => {
      logger.error('Failed to persist domain validation record', { error, record });
    });
  }

  /**
   * 📧 COLETAR MÉTRICAS DE ENVIO DE EMAIL
   */
  public recordEmailSend(record: EmailSendRecord): void {
    const key = `${record.requestId}_${record.from}`;
    this.emailSendRecords.set(key, record);
    
    // Log para debugging
    if (record.success) {
      debugLogger.logEmailSendSuccess(
        {
          userId: record.userId,
          from: record.from,
          to: record.to,
          subject: 'Logged by metrics',
          domain: record.domain,
          requestId: record.requestId
        },
        record.jobId || 'unknown',
        record.processingTime
      );
    } else {
      debugLogger.logEmailSendError(
        {
          userId: record.userId,
          from: record.from,
          to: record.to,
          subject: 'Logged by metrics',
          domain: record.domain,
          requestId: record.requestId
        },
        { code: record.errorCode, message: 'Email send failed' },
        record.processingTime
      );
    }
    
    // Persistir no banco
    this.persistEmailSendRecord(record).catch(error => {
      logger.error('Failed to persist email send record', { error, record });
    });
  }

  /**
   * 📈 CALCULAR MÉTRICAS COMPLETAS
   */
  public async calculateMetrics(
    startDate: Date, 
    endDate: Date, 
    userId?: number
  ): Promise<ValidationMetrics> {
    const cacheKey = `${startDate.getTime()}_${endDate.getTime()}_${userId || 'all'}`;
    const cached = this.metricsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    logger.info('📊 Calculando métricas de validação', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      userId: userId || 'all'
    });

    const [domainMetrics, emailMetrics, performanceMetrics, errorMetrics] = await Promise.all([
      this.calculateDomainMetrics(startDate, endDate, userId),
      this.calculateEmailMetrics(startDate, endDate, userId),
      this.calculatePerformanceMetrics(startDate, endDate, userId),
      this.calculateErrorMetrics(startDate, endDate, userId)
    ]);

    const metrics: ValidationMetrics = {
      domainValidations: domainMetrics,
      emailSending: emailMetrics,
      performance: performanceMetrics,
      errors: errorMetrics,
      period: {
        start: startDate,
        end: endDate,
        duration: this.formatDuration(endDate.getTime() - startDate.getTime())
      }
    };

    // Cache das métricas
    this.metricsCache.set(cacheKey, {
      data: metrics,
      timestamp: Date.now()
    });

    // Log das métricas calculadas
    debugLogger.logIntegrationMetrics({
      emailsSent: emailMetrics.total,
      emailsSuccessful: emailMetrics.successful,
      emailsFailed: emailMetrics.failed,
      domainsValidated: domainMetrics.total,
      domainsVerified: domainMetrics.successful,
      avgEmailSendTime: emailMetrics.avgSendTime,
      avgDomainValidationTime: domainMetrics.avgValidationTime,
      errorRate: errorMetrics.errorRate,
      successRate: emailMetrics.successRate,
      timeRange: `${startDate.toISOString()} - ${endDate.toISOString()}`
    });

    return metrics;
  }

  /**
   * 🎯 MÉTRICAS DE DOMÍNIO
   */
  private async calculateDomainMetrics(startDate: Date, endDate: Date, userId?: number) {
    const query = db('validation_metrics')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .where('metric_type', 'domain_validation');
    
    if (userId) {
      query.where('user_id', userId);
    }

    const records = await query.select('*');
    
    const total = records.length;
    const successful = records.filter(r => r.success).length;
    const failed = total - successful;
    const accuracyRate = total > 0 ? (successful / total) * 100 : 0;
    
    const validationTimes = records.map(r => r.processing_time || 0);
    const avgValidationTime = validationTimes.length > 0 
      ? validationTimes.reduce((sum, time) => sum + time, 0) / validationTimes.length 
      : 0;

    return {
      total,
      successful,
      failed,
      accuracyRate,
      avgValidationTime
    };
  }

  /**
   * 📧 MÉTRICAS DE EMAIL
   */
  private async calculateEmailMetrics(startDate: Date, endDate: Date, userId?: number) {
    const query = db('validation_metrics')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .where('metric_type', 'email_send');
    
    if (userId) {
      query.where('user_id', userId);
    }

    const records = await query.select('*');
    
    const total = records.length;
    const successful = records.filter(r => r.success).length;
    const failed = total - successful;
    const successRate = total > 0 ? (successful / total) * 100 : 0;
    
    const sendTimes = records.map(r => r.processing_time || 0);
    const avgSendTime = sendTimes.length > 0 
      ? sendTimes.reduce((sum, time) => sum + time, 0) / sendTimes.length 
      : 0;

    return {
      total,
      successful,
      failed,
      successRate,
      avgSendTime
    };
  }

  /**
   * ⚡ MÉTRICAS DE PERFORMANCE
   */
  private async calculatePerformanceMetrics(startDate: Date, endDate: Date, userId?: number) {
    const query = db('validation_metrics')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate);
    
    if (userId) {
      query.where('user_id', userId);
    }

    const records = await query.select('*');
    
    // Calcular P95 e média para latência da API
    const processingTimes = records.map(r => r.processing_time || 0).sort((a, b) => a - b);
    const apiLatencyP95 = processingTimes.length > 0 
      ? processingTimes[Math.floor(processingTimes.length * 0.95)] 
      : 0;
    const apiLatencyAvg = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0;

    // Métricas específicas por tipo
    const domainValidationTimes = records
      .filter(r => r.metric_type === 'domain_validation')
      .map(r => r.processing_time || 0);
    const domainValidationTime = domainValidationTimes.length > 0
      ? domainValidationTimes.reduce((sum, time) => sum + time, 0) / domainValidationTimes.length
      : 0;

    const emailProcessingTimes = records
      .filter(r => r.metric_type === 'email_send')
      .map(r => r.processing_time || 0);
    const emailProcessingTime = emailProcessingTimes.length > 0
      ? emailProcessingTimes.reduce((sum, time) => sum + time, 0) / emailProcessingTimes.length
      : 0;

    return {
      apiLatencyP95,
      apiLatencyAvg,
      domainValidationTime,
      emailProcessingTime
    };
  }

  /**
   * 🚨 MÉTRICAS DE ERRO
   */
  private async calculateErrorMetrics(startDate: Date, endDate: Date, userId?: number) {
    const query = db('validation_metrics')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate);
    
    if (userId) {
      query.where('user_id', userId);
    }

    const records = await query.select('*');
    const totalRecords = records.length;
    const errorRecords = records.filter(r => !r.success);
    const totalErrors = errorRecords.length;
    const errorRate = totalRecords > 0 ? (totalErrors / totalRecords) * 100 : 0;

    // Agrupar erros por código
    const errorCounts = new Map<string, number>();
    errorRecords.forEach(record => {
      const errorCode = record.error_code || 'UNKNOWN_ERROR';
      errorCounts.set(errorCode, (errorCounts.get(errorCode) || 0) + 1);
    });

    const commonErrors = Array.from(errorCounts.entries())
      .map(([code, count]) => ({
        code,
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 erros

    const criticalErrors = errorRecords.filter(r => 
      ['DOMAIN_NOT_VERIFIED', 'SYSTEM_ERROR', 'DATABASE_ERROR'].includes(r.error_code)
    ).length;

    return {
      totalErrors,
      errorRate,
      commonErrors,
      criticalErrors
    };
  }

  /**
   * 💾 PERSISTIR REGISTROS NO BANCO
   */
  private async persistDomainValidationRecord(record: DomainValidationRecord): Promise<void> {
    await db('validation_metrics').insert({
      metric_type: 'domain_validation',
      user_id: record.userId,
      domain: record.domain,
      success: record.result,
      processing_time: record.validationTime,
      request_id: record.requestId,
      error_code: record.errorCode,
      created_at: record.timestamp,
      metadata: JSON.stringify({
        domain: record.domain,
        validationType: 'direct_check'
      })
    });
  }

  private async persistEmailSendRecord(record: EmailSendRecord): Promise<void> {
    await db('validation_metrics').insert({
      metric_type: 'email_send',
      user_id: record.userId,
      domain: record.domain,
      success: record.success,
      processing_time: record.processingTime,
      request_id: record.requestId,
      error_code: record.errorCode,
      created_at: record.timestamp,
      metadata: JSON.stringify({
        from: record.from,
        to: record.to,
        jobId: record.jobId
      })
    });
  }

  /**
   * 🎯 VERIFICAR THRESHOLDS CRÍTICOS
   */
  public async checkCriticalThresholds(metrics: ValidationMetrics): Promise<void> {
    const issues: any[] = [];

    // Verificar Email Success Rate > 95%
    if (metrics.emailSending.successRate < 95) {
      issues.push({
        type: 'HIGH_ERROR_RATE',
        description: `Email success rate (${metrics.emailSending.successRate.toFixed(2)}%) below 95% threshold`,
        impact: 'CRITICAL',
        context: { successRate: metrics.emailSending.successRate, threshold: 95 }
      });
    }

    // Verificar Domain Validation Rate > 99%
    if (metrics.domainValidations.accuracyRate < 99) {
      issues.push({
        type: 'DOMAIN_VALIDATION_FAILURE',
        description: `Domain validation accuracy (${metrics.domainValidations.accuracyRate.toFixed(2)}%) below 99% threshold`,
        impact: 'HIGH',
        context: { accuracyRate: metrics.domainValidations.accuracyRate, threshold: 99 }
      });
    }

    // Verificar API Latency < 2s P95
    if (metrics.performance.apiLatencyP95 > 2000) {
      issues.push({
        type: 'SLOW_PERFORMANCE',
        description: `API latency P95 (${metrics.performance.apiLatencyP95.toFixed(2)}ms) above 2s threshold`,
        impact: 'HIGH',
        context: { latencyP95: metrics.performance.apiLatencyP95, threshold: 2000 }
      });
    }

    // Verificar Error Rate < 1%
    if (metrics.errors.errorRate > 1) {
      issues.push({
        type: 'HIGH_ERROR_RATE',
        description: `Overall error rate (${metrics.errors.errorRate.toFixed(2)}%) above 1% threshold`,
        impact: 'MEDIUM',
        context: { errorRate: metrics.errors.errorRate, threshold: 1 }
      });
    }

    // Log de issues críticos
    for (const issue of issues) {
      debugLogger.logCriticalIssue(issue);
    }

    if (issues.length > 0) {
      logger.warn('🚨 Critical thresholds exceeded', {
        issueCount: issues.length,
        issues: issues.map(i => ({ type: i.type, impact: i.impact }))
      });
    } else {
      logger.info('✅ All critical thresholds within acceptable ranges', {
        emailSuccessRate: metrics.emailSending.successRate,
        domainValidationRate: metrics.domainValidations.accuracyRate,
        apiLatencyP95: metrics.performance.apiLatencyP95,
        errorRate: metrics.errors.errorRate
      });
    }
  }

  /**
   * 🛠️ MÉTODOS AUXILIARES
   */
  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * 📊 OBTER MÉTRICAS EM TEMPO REAL
   */
  public getRealTimeMetrics(): {
    domainValidations: number;
    emailSends: number;
    lastMinuteSuccess: number;
    activeRequests: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentDomainValidations = Array.from(this.domainValidationRecords.values())
      .filter(record => record.timestamp.getTime() > oneMinuteAgo).length;

    const recentEmailSends = Array.from(this.emailSendRecords.values())
      .filter(record => record.timestamp.getTime() > oneMinuteAgo).length;

    const recentSuccesses = Array.from(this.emailSendRecords.values())
      .filter(record => record.timestamp.getTime() > oneMinuteAgo && record.success).length;

    return {
      domainValidations: recentDomainValidations,
      emailSends: recentEmailSends,
      lastMinuteSuccess: recentEmailSends > 0 ? (recentSuccesses / recentEmailSends) * 100 : 0,
      activeRequests: this.domainValidationRecords.size + this.emailSendRecords.size
    };
  }
}

// Instância singleton
export const validationMetricsService = ValidationMetricsService.getInstance();