/**
 * 📊 EMAIL METRICS COLLECTOR
 * Sistema robusto de coleta e análise de métricas
 * Versão: 1.0.0 - Monitoramento Profissional
 */

import { logger } from '../config/logger';
import db from '../config/database';
import { EmailEvent, EmailMetrics, Alert } from './types';

export interface MetricsWindow {
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  start: Date;
  end: Date;
}

export interface UserMetricsSummary {
  userId: number;
  period: string;
  totalSent: number;
  totalFailed: number;
  successRate: number;
  avgLatency: number;
  maxLatency: number;
  quotaUtilization: number;
  domainValidationRate: number;
  fallbackRate: number;
}

export class EmailMetricsCollector {
  private readonly enableRealTimeAlerts: boolean;
  private readonly alertThresholds: {
    maxFailureRate: number;
    maxLatencyMs: number;
    quotaWarningThreshold: number;
  };

  constructor(options: {
    enableRealTimeAlerts?: boolean;
    maxFailureRate?: number;
    maxLatencyMs?: number;
    quotaWarningThreshold?: number;
  } = {}) {
    this.enableRealTimeAlerts = options.enableRealTimeAlerts !== false;
    this.alertThresholds = {
      maxFailureRate: options.maxFailureRate || 10, // 10%
      maxLatencyMs: options.maxLatencyMs || 5000, // 5 seconds
      quotaWarningThreshold: options.quotaWarningThreshold || 0.9 // 90%
    };

    logger.debug('EmailMetricsCollector initialized', {
      enableRealTimeAlerts: this.enableRealTimeAlerts,
      thresholds: this.alertThresholds
    });
  }

  /**
   * Registrar evento de email
   */
  async recordEmailEvent(event: EmailEvent): Promise<void> {
    try {
      // 1. Inserir evento na tabela de eventos
      await db('email_events').insert({
        email_id: event.metadata?.emailId || null,
        user_id: event.userId,
        message_id: event.messageId,
        event_type: event.type,
        event_data: JSON.stringify(event.metadata || {}),
        error_message: event.error,
        latency_ms: event.latency,
        event_at: event.timestamp
      });

      // 2. Atualizar métricas agregadas
      await this.updateAggregatedMetrics(event);

      // 3. Verificar alertas em tempo real
      if (this.enableRealTimeAlerts) {
        await this.checkRealTimeAlerts(event);
      }

      logger.debug('Email event recorded', {
        type: event.type,
        userId: event.userId,
        messageId: event.messageId,
        latency: event.latency
      });

    } catch (error) {
      logger.error('Failed to record email event', {
        event: event.type,
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Non-critical error, don't throw
    }
  }

  /**
   * Atualizar métricas agregadas diárias
   */
  private async updateAggregatedMetrics(event: EmailEvent): Promise<void> {
    const today = event.timestamp.toISOString().split('T')[0];
    
    try {
      await db('email_metrics').insert({
        user_id: event.userId,
        date: today,
        total_sent: event.type === 'sent' ? 1 : 0,
        total_failed: event.type === 'failed' ? 1 : 0,
        avg_latency_ms: event.latency || 0,
        max_latency_ms: event.latency || 0,
        quota_used: 1
      }).onConflict(['user_id', 'date']).merge({
        total_sent: db.raw('total_sent + ?', [event.type === 'sent' ? 1 : 0]),
        total_failed: db.raw('total_failed + ?', [event.type === 'failed' ? 1 : 0]),
        quota_used: db.raw('quota_used + 1'),
        avg_latency_ms: db.raw('(avg_latency_ms + ?) / 2', [event.latency || 0]),
        max_latency_ms: db.raw('GREATEST(max_latency_ms, ?)', [event.latency || 0]),
        updated_at: new Date()
      });

    } catch (error) {
      logger.debug('Non-critical: Failed to update aggregated metrics', {
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Verificar alertas em tempo real
   */
  private async checkRealTimeAlerts(event: EmailEvent): Promise<void> {
    try {
      const alerts: Alert[] = [];

      // Alert: High failure rate
      if (event.type === 'failed') {
        const recentStats = await this.getUserMetrics(event.userId, { hours: 1 });
        if (recentStats && recentStats.totalFailed + recentStats.totalSent > 10) {
          const failureRate = (recentStats.totalFailed / (recentStats.totalFailed + recentStats.totalSent)) * 100;
          
          if (failureRate > this.alertThresholds.maxFailureRate) {
            alerts.push({
              type: 'high_failure_rate',
              severity: 'warning',
              userId: event.userId,
              message: `High failure rate detected: ${failureRate.toFixed(2)}%`,
              threshold: this.alertThresholds.maxFailureRate,
              current: failureRate,
              timestamp: new Date()
            });
          }
        }
      }

      // Alert: High latency
      if (event.latency && event.latency > this.alertThresholds.maxLatencyMs) {
        alerts.push({
          type: 'high_latency',
          severity: 'info',
          userId: event.userId,
          message: `High latency detected: ${event.latency}ms`,
          threshold: this.alertThresholds.maxLatencyMs,
          current: event.latency,
          timestamp: new Date()
        });
      }

      // Process alerts
      for (const alert of alerts) {
        await this.processAlert(alert);
      }

    } catch (error) {
      logger.debug('Non-critical: Failed to check real-time alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Processar alerta
   */
  private async processAlert(alert: Alert): Promise<void> {
    try {
      logger.warn('Email system alert generated', {
        type: alert.type,
        severity: alert.severity,
        userId: alert.userId,
        message: alert.message,
        threshold: alert.threshold,
        current: alert.current
      });

      // Armazenar alerta no banco para histórico
      await db('system_alerts').insert({
        alert_type: alert.type,
        title: alert.type,
        severity: alert.severity,
        severity_order: alert.severity === 'critical' ? 1 : alert.severity === 'warning' ? 2 : 3,
        user_id: alert.userId,
        message: alert.message,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }).catch(error => {
        // Table might not exist yet - non-critical
        logger.debug('Could not store alert in database', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

    } catch (error) {
      logger.debug('Non-critical: Failed to process alert', {
        alert: alert.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Obter métricas do usuário
   */
  async getUserMetrics(userId: number, timeframe?: { 
    hours?: number; 
    days?: number; 
    weeks?: number; 
  }): Promise<UserMetricsSummary | null> {
    try {
      let startDate = new Date();
      let period = 'daily';

      if (timeframe?.hours) {
        startDate.setHours(startDate.getHours() - timeframe.hours);
        period = 'hourly';
      } else if (timeframe?.weeks) {
        startDate.setDate(startDate.getDate() - (timeframe.weeks * 7));
        period = 'weekly';
      } else {
        // Default: last 24 hours
        startDate.setDate(startDate.getDate() - (timeframe?.days || 1));
      }

      // Get aggregated data from email_events
      const stats = await db('email_events')
        .where('user_id', userId)
        .where('event_at', '>=', startDate)
        .select([
          db.raw('COUNT(*) as total_events'),
          db.raw('COUNT(CASE WHEN event_type = "sent" THEN 1 END) as total_sent'),
          db.raw('COUNT(CASE WHEN event_type = "failed" THEN 1 END) as total_failed'),
          db.raw('AVG(latency_ms) as avg_latency'),
          db.raw('MAX(latency_ms) as max_latency'),
          db.raw('COUNT(CASE WHEN JSON_EXTRACT(event_data, "$.domainValidated") = true THEN 1 END) as domain_validated_count'),
          db.raw('COUNT(CASE WHEN JSON_EXTRACT(event_data, "$.fallbackApplied") = true THEN 1 END) as fallback_count')
        ])
        .first();

      const typedStats = stats as any;
      if (!typedStats || typedStats.total_events === 0) {
        return null;
      }

      const totalEmails = typedStats.total_sent + typedStats.total_failed;
      const successRate = totalEmails > 0 ? (typedStats.total_sent / totalEmails) * 100 : 0;
      const domainValidationRate = totalEmails > 0 ? (typedStats.domain_validated_count / totalEmails) * 100 : 0;
      const fallbackRate = totalEmails > 0 ? (typedStats.fallback_count / totalEmails) * 100 : 0;

      // Get quota information from latest email_metrics
      const quotaInfo = await db('email_metrics')
        .where('user_id', userId)
        .orderBy('date', 'desc')
        .select('quota_used', 'quota_limit')
        .first();

      const quotaUtilization = quotaInfo ? 
        (quotaInfo.quota_used / quotaInfo.quota_limit) * 100 : 0;

      return {
        userId,
        period,
        totalSent: typedStats.total_sent || 0,
        totalFailed: typedStats.total_failed || 0,
        successRate: Number(successRate.toFixed(2)),
        avgLatency: Math.round(typedStats.avg_latency || 0),
        maxLatency: typedStats.max_latency || 0,
        quotaUtilization: Number(quotaUtilization.toFixed(2)),
        domainValidationRate: Number(domainValidationRate.toFixed(2)),
        fallbackRate: Number(fallbackRate.toFixed(2))
      };

    } catch (error) {
      logger.error('Failed to get user metrics', {
        userId,
        timeframe,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Obter métricas globais do sistema
   */
  async getSystemMetrics(window: MetricsWindow): Promise<EmailMetrics | null> {
    try {
      const stats = await db('email_events')
        .whereBetween('event_at', [window.start, window.end])
        .select([
          db.raw('COUNT(*) as total_events'),
          db.raw('COUNT(CASE WHEN event_type = "sent" THEN 1 END) as emails_sent_total'),
          db.raw('COUNT(CASE WHEN event_type = "failed" THEN 1 END) as total_failed'),
          db.raw('COUNT(DISTINCT user_id) as active_users'),
          
          // Performance metrics
          db.raw('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as latency_p50'),
          db.raw('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as latency_p95'),
          db.raw('PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as latency_p99')
        ])
        .first();

      const typedStats2 = stats as any;
      if (!typedStats2 || typedStats2.total_events === 0) {
        return null;
      }

      const totalEmails = typedStats2.emails_sent_total + typedStats2.total_failed;
      const successRate = totalEmails > 0 ? (typedStats2.emails_sent_total / totalEmails) * 100 : 0;
      const errorRate = 100 - successRate;

      // Top senders
      const topSenders = await db('email_events')
        .whereBetween('event_at', [window.start, window.end])
        .where('event_type', 'sent')
        .groupBy('user_id')
        .select('user_id as userId', db.raw('COUNT(*) as count'))
        .orderBy('count', 'desc')
        .limit(10);

      return {
        latency_p50: Math.round(typedStats2.latency_p50 || 0),
        latency_p95: Math.round(typedStats2.latency_p95 || 0),
        latency_p99: Math.round(typedStats2.latency_p99 || 0),
        success_rate: Number(successRate.toFixed(2)),
        error_rate: Number(errorRate.toFixed(2)),
        emails_sent_total: typedStats2.emails_sent_total || 0,
        quota_utilization: 0, // Will be calculated separately
        active_users: typedStats2.active_users || 0,
        top_senders: topSenders || []
      };

    } catch (error) {
      logger.error('Failed to get system metrics', {
        window,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Limpar dados antigos para performance
   */
  async cleanupOldData(daysToKeep: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deletedEvents = await db('email_events')
        .where('event_at', '<', cutoffDate)
        .del();

      const deletedMetrics = await db('email_metrics')
        .where('date', '<', cutoffDate.toISOString().split('T')[0])
        .del();

      logger.info('Cleaned up old metrics data', {
        daysToKeep,
        deletedEvents,
        deletedMetrics,
        cutoffDate: cutoffDate.toISOString()
      });

    } catch (error) {
      logger.error('Failed to cleanup old data', {
        daysToKeep,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Gerar relatório de saúde do sistema
   */
  async generateHealthReport(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    metrics: any;
    alerts: number;
    recommendations: string[];
  }> {
    try {
      // Window: last 24 hours
      const window: MetricsWindow = {
        period: 'daily',
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const systemMetrics = await this.getSystemMetrics(window);
      
      if (!systemMetrics) {
        return {
          status: 'healthy',
          metrics: null,
          alerts: 0,
          recommendations: ['No email activity in the last 24 hours']
        };
      }

      // Determine health status
      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      const recommendations: string[] = [];

      if (systemMetrics.error_rate > 20) {
        status = 'critical';
        recommendations.push('Critical: High error rate detected - investigate SMTP configuration');
      } else if (systemMetrics.error_rate > 10) {
        status = 'degraded';
        recommendations.push('Warning: Elevated error rate - monitor closely');
      }

      if (systemMetrics.latency_p95 > 10000) {
        status = status === 'healthy' ? 'degraded' : status;
        recommendations.push('High latency detected - check SMTP server performance');
      }

      // Count recent alerts
      const alertCount = await db('system_alerts')
        .where('created_at', '>=', window.start)
        .where('status', 'active')
        .count('* as count')
        .first();

      return {
        status,
        metrics: systemMetrics,
        alerts: (alertCount as any)?.count || 0,
        recommendations: recommendations.length > 0 ? recommendations : ['System operating normally']
      };

    } catch (error) {
      logger.error('Failed to generate health report', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        status: 'critical',
        metrics: null,
        alerts: 0,
        recommendations: ['Unable to generate health report - check system logs']
      };
    }
  }
}