/**
 * 🔍 MIGRATION MONITORING SERVICE - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Serviço de monitoramento da migração emails-v2
 * Coleta métricas, detecta problemas e sugere ações
 */

import { logger } from '../config/logger';
import { debugLogger } from '../utils/debugLogger';
import { getFeatureFlags } from '../config/features';
import db from '../config/database';
import { MigrationStats, calculateSuccessRate } from '../types/database';

export interface MigrationMetrics {
  timestamp: string;
  rollout: {
    percentage: number;
    usersInRollout: number;
    totalActiveUsers: number;
    phase: string;
  };
  performance: {
    legacyApiLatencyMs: number;
    v2ApiLatencyMs: number;
    latencyDelta: number;
    latencyStatus: 'BETTER' | 'SAME' | 'WORSE';
  };
  reliability: {
    legacySuccessRate: number;
    v2SuccessRate: number;
    successRateDelta: number;
    reliabilityStatus: 'BETTER' | 'SAME' | 'WORSE';
  };
  errors: {
    legacyErrorCount: number;
    v2ErrorCount: number;
    criticalErrors: string[];
    errorTrend: 'UP' | 'STABLE' | 'DOWN';
  };
  recommendations: string[];
  alerts: {
    level: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    action: string;
  }[];
}

export class MigrationMonitoringService {
  private metricsCache: MigrationMetrics | null = null;
  private lastMetricsUpdate = 0;
  private readonly CACHE_TTL = 60000; // 1 minuto

  /**
   * Coletar métricas completas da migração
   */
  async collectMetrics(): Promise<MigrationMetrics> {
    const now = Date.now();
    
    // Usar cache se ainda válido
    if (this.metricsCache && now - this.lastMetricsUpdate < this.CACHE_TTL) {
      return this.metricsCache;
    }

    logger.info('🔍 Coletando métricas de migração...');

    try {
      const flags = getFeatureFlags();
      const rolloutMetrics = await this.collectRolloutMetrics();
      const performanceMetrics = await this.collectPerformanceMetrics();
      const reliabilityMetrics = await this.collectReliabilityMetrics();
      const errorMetrics = await this.collectErrorMetrics();
      
      const metrics: MigrationMetrics = {
        timestamp: new Date().toISOString(),
        rollout: rolloutMetrics,
        performance: performanceMetrics,
        reliability: reliabilityMetrics,
        errors: errorMetrics,
        recommendations: this.generateRecommendations(performanceMetrics, reliabilityMetrics, errorMetrics),
        alerts: this.generateAlerts(performanceMetrics, reliabilityMetrics, errorMetrics, flags)
      };

      this.metricsCache = metrics;
      this.lastMetricsUpdate = now;

      // Log métricas críticas
      if (flags.ENABLE_MIGRATION_MONITORING) {
        debugLogger.logTestExecution({
          testName: 'migration_metrics_collection',
          testType: 'INTEGRATION',
          status: metrics.alerts.some(a => a.level === 'CRITICAL') ? 'FAILED' : 'PASSED',
          requestId: `metrics_${Date.now()}`,
          assertions: {
            passed: metrics.alerts.filter(a => a.level !== 'CRITICAL').length,
            failed: metrics.alerts.filter(a => a.level === 'CRITICAL').length,
            total: metrics.alerts.length
          }
        });
      }

      return metrics;

    } catch (error) {
      logger.error('Erro ao coletar métricas de migração', { error });
      throw new Error(`Failed to collect migration metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Métricas de rollout
   */
  private async collectRolloutMetrics() {
    const flags = getFeatureFlags();
    
    // Contar usuários ativos nas últimas 24h
    const totalActiveUsers = await db('emails')
      .countDistinct('user_id as count')
      .where('sent_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .first()
      .then(result => parseInt(String(result?.count || '0')));

    const usersInRollout = Math.floor((totalActiveUsers * flags.ROLLOUT_PERCENTAGE) / 100);

    let phase = 'DISABLED';
    if (flags.USE_INTEGRATED_EMAIL_SEND) {
      if (flags.ROLLOUT_PERCENTAGE === 0) phase = 'READY';
      else if (flags.ROLLOUT_PERCENTAGE < 25) phase = 'EARLY_ROLLOUT';
      else if (flags.ROLLOUT_PERCENTAGE < 75) phase = 'GRADUAL_ROLLOUT';
      else if (flags.ROLLOUT_PERCENTAGE < 100) phase = 'FINAL_ROLLOUT';
      else phase = 'COMPLETE';
    }

    return {
      percentage: flags.ROLLOUT_PERCENTAGE,
      usersInRollout,
      totalActiveUsers,
      phase
    };
  }

  /**
   * Métricas de performance
   */
  private async collectPerformanceMetrics() {
    // Métricas das últimas 24h
    const legacyMetrics = await db('email_logs')
      .avg('processing_time_ms as avgLatency')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .where('route_version', '1')
      .first();

    const v2Metrics = await db('email_logs')
      .avg('processing_time_ms as avgLatency')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .where('route_version', '2')
      .first();

    const legacyLatency = parseFloat(legacyMetrics?.avgLatency || '0');
    const v2Latency = parseFloat(v2Metrics?.avgLatency || '0');
    const latencyDelta = v2Latency - legacyLatency;

    let latencyStatus: 'BETTER' | 'SAME' | 'WORSE' = 'SAME';
    if (Math.abs(latencyDelta) > 100) { // Diferença significativa > 100ms
      latencyStatus = latencyDelta < 0 ? 'BETTER' : 'WORSE';
    }

    return {
      legacyApiLatencyMs: legacyLatency,
      v2ApiLatencyMs: v2Latency,
      latencyDelta,
      latencyStatus
    };
  }

  /**
   * Métricas de confiabilidade
   */
  private async collectReliabilityMetrics() {
    // Taxa de sucesso das últimas 24h
    const legacyStats = await db('email_logs')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successful')
      )
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .where('route_version', '1')
      .first();

    const v2Stats = await db('email_logs')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successful')
      )
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .where('route_version', '2')
      .first();

    const legacySuccessRate = legacyStats ? 
      calculateSuccessRate(legacyStats as any) : 0;
    const v2SuccessRate = v2Stats ? 
      calculateSuccessRate(v2Stats as any) : 0;
    
    const successRateDelta = v2SuccessRate - legacySuccessRate;

    let reliabilityStatus: 'BETTER' | 'SAME' | 'WORSE' = 'SAME';
    if (Math.abs(successRateDelta) > 2) { // Diferença significativa > 2%
      reliabilityStatus = successRateDelta > 0 ? 'BETTER' : 'WORSE';
    }

    return {
      legacySuccessRate,
      v2SuccessRate,
      successRateDelta,
      reliabilityStatus
    };
  }

  /**
   * Métricas de erros
   */
  private async collectErrorMetrics() {
    // Contagem de erros das últimas 24h
    const legacyErrors = await db('email_logs')
      .count('* as count')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .where('route_version', '1')
      .where('success', false)
      .first()
      .then(result => parseInt(String(result?.count || '0')));

    const v2Errors = await db('email_logs')
      .count('* as count')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 24 HOUR'))
      .where('route_version', '2')
      .where('success', false)
      .first()
      .then(result => parseInt(String(result?.count || '0')));

    // Erros críticos recentes
    const criticalErrors = await db('email_logs')
      .select('error_message')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 1 HOUR'))
      .where('route_version', '2')
      .where('success', false)
      .whereIn('error_type', ['DOMAIN_NOT_VERIFIED', 'SMTP_CONNECTION_FAILED', 'DATABASE_ERROR'])
      .limit(5)
      .then(results => results.map(r => r.error_message).filter(Boolean));

    // Tendência de erros (comparar última hora vs hora anterior)
    const lastHourErrors = await db('email_logs')
      .count('* as count')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 1 HOUR'))
      .where('route_version', '2')
      .where('success', false)
      .first()
      .then(result => parseInt(String(result?.count || '0')));

    const previousHourErrors = await db('email_logs')
      .count('* as count')
      .where('created_at', '>=', db.raw('NOW() - INTERVAL 2 HOUR'))
      .where('created_at', '<', db.raw('NOW() - INTERVAL 1 HOUR'))
      .where('route_version', '2')
      .where('success', false)
      .first()
      .then(result => parseInt(String(result?.count || '0')));

    let errorTrend: 'UP' | 'STABLE' | 'DOWN' = 'STABLE';
    if (lastHourErrors > previousHourErrors * 1.5) errorTrend = 'UP';
    else if (lastHourErrors < previousHourErrors * 0.5) errorTrend = 'DOWN';

    return {
      legacyErrorCount: legacyErrors,
      v2ErrorCount: v2Errors,
      criticalErrors,
      errorTrend
    };
  }

  /**
   * Gerar recomendações baseadas nas métricas
   */
  private generateRecommendations(
    performance: any, 
    reliability: any, 
    errors: any
  ): string[] {
    const recommendations: string[] = [];

    // Recomendações de performance
    if (performance.latencyStatus === 'WORSE') {
      recommendations.push(`Performance degradou ${Math.abs(performance.latencyDelta).toFixed(0)}ms - investigar gargalos`);
    } else if (performance.latencyStatus === 'BETTER') {
      recommendations.push(`Performance melhorou ${Math.abs(performance.latencyDelta).toFixed(0)}ms - rollout pode ser acelerado`);
    }

    // Recomendações de confiabilidade
    if (reliability.reliabilityStatus === 'WORSE') {
      recommendations.push(`Taxa de sucesso caiu ${Math.abs(reliability.successRateDelta).toFixed(1)}% - considerar rollback`);
    } else if (reliability.reliabilityStatus === 'BETTER') {
      recommendations.push(`Confiabilidade melhorou ${reliability.successRateDelta.toFixed(1)}% - sistema estável`);
    }

    // Recomendações de erros
    if (errors.errorTrend === 'UP') {
      recommendations.push('Erros em tendência crescente - monitorar proximamente');
    }

    if (errors.criticalErrors.length > 0) {
      recommendations.push(`${errors.criticalErrors.length} erros críticos detectados - ação imediata necessária`);
    }

    // Recomendações gerais
    if (recommendations.length === 0) {
      recommendations.push('Métricas estáveis - migração pode prosseguir');
    }

    return recommendations;
  }

  /**
   * Gerar alertas baseados nas métricas
   */
  private generateAlerts(
    performance: any,
    reliability: any, 
    errors: any,
    flags: any
  ): Array<{level: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; action: string}> {
    const alerts = [];

    // Alertas críticos
    if (reliability.v2SuccessRate < 95) {
      alerts.push({
        level: 'CRITICAL' as const,
        message: `Taxa de sucesso V2 muito baixa: ${reliability.v2SuccessRate.toFixed(1)}%`,
        action: 'Executar rollback imediato'
      });
    }

    if (performance.v2ApiLatencyMs > 2000) {
      alerts.push({
        level: 'CRITICAL' as const,
        message: `Latência V2 acima do limite: ${performance.v2ApiLatencyMs.toFixed(0)}ms`,
        action: 'Investigar gargalos de performance'
      });
    }

    if (errors.criticalErrors.length > 3) {
      alerts.push({
        level: 'CRITICAL' as const,
        message: `Muitos erros críticos: ${errors.criticalErrors.length}`,
        action: 'Verificar logs e corrigir problemas'
      });
    }

    // Alertas de warning
    if (errors.errorTrend === 'UP') {
      alerts.push({
        level: 'WARNING' as const,
        message: 'Erros em tendência crescente',
        action: 'Monitorar próximas horas antes de aumentar rollout'
      });
    }

    if (performance.latencyStatus === 'WORSE' && Math.abs(performance.latencyDelta) > 500) {
      alerts.push({
        level: 'WARNING' as const,
        message: `Degradação significativa de performance: +${performance.latencyDelta.toFixed(0)}ms`,
        action: 'Analisar causas da degradação'
      });
    }

    // Alertas informativos
    if (flags.ROLLOUT_PERCENTAGE > 0 && alerts.length === 0) {
      alerts.push({
        level: 'INFO' as const,
        message: 'Migração executando dentro dos parâmetros normais',
        action: 'Continuar monitoramento'
      });
    }

    return alerts;
  }

  /**
   * Verificar se rollout pode ser aumentado com segurança
   */
  async canIncreaseRollout(): Promise<{
    canIncrease: boolean;
    reason: string;
    blockers: string[];
    suggestedPercentage?: number;
  }> {
    try {
      const metrics = await this.collectMetrics();
      const flags = getFeatureFlags();
      const blockers: string[] = [];

      // Verificar alertas críticos
      const criticalAlerts = metrics.alerts.filter(a => a.level === 'CRITICAL');
      if (criticalAlerts.length > 0) {
        blockers.push(...criticalAlerts.map(a => a.message));
      }

      // Verificar métricas mínimas
      if (metrics.reliability.v2SuccessRate < 95) {
        blockers.push(`Taxa de sucesso muito baixa: ${metrics.reliability.v2SuccessRate.toFixed(1)}%`);
      }

      if (metrics.performance.v2ApiLatencyMs > 2000) {
        blockers.push(`Latência muito alta: ${metrics.performance.v2ApiLatencyMs.toFixed(0)}ms`);
      }

      if (metrics.errors.errorTrend === 'UP') {
        blockers.push('Erros em tendência crescente');
      }

      // Se há bloqueadores, não pode aumentar
      if (blockers.length > 0) {
        return {
          canIncrease: false,
          reason: 'Métricas fora dos parâmetros seguros',
          blockers
        };
      }

      // Se já está em 100%, não pode aumentar mais
      if (flags.ROLLOUT_PERCENTAGE >= 100) {
        return {
          canIncrease: false,
          reason: 'Rollout já está em 100%',
          blockers: []
        };
      }

      // Sugerir próximo percentual baseado no atual
      let suggestedPercentage: number;
      if (flags.ROLLOUT_PERCENTAGE < 10) suggestedPercentage = 10;
      else if (flags.ROLLOUT_PERCENTAGE < 25) suggestedPercentage = 25;
      else if (flags.ROLLOUT_PERCENTAGE < 50) suggestedPercentage = 50;
      else if (flags.ROLLOUT_PERCENTAGE < 75) suggestedPercentage = 75;
      else suggestedPercentage = 100;

      return {
        canIncrease: true,
        reason: 'Métricas dentro dos parâmetros seguros',
        blockers: [],
        suggestedPercentage
      };

    } catch (error) {
      logger.error('Erro ao verificar possibilidade de aumento de rollout', { error });
      return {
        canIncrease: false,
        reason: 'Erro ao coletar métricas',
        blockers: ['Sistema de métricas indisponível']
      };
    }
  }

  /**
   * Executar verificação de saúde da migração
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    score: number;
    issues: string[];
    summary: string;
  }> {
    try {
      const metrics = await this.collectMetrics();
      let score = 100;
      const issues: string[] = [];

      // Penalizar por performance
      if (metrics.performance.latencyStatus === 'WORSE') {
        score -= 20;
        issues.push(`Performance degradada: +${metrics.performance.latencyDelta.toFixed(0)}ms`);
      }

      // Penalizar por confiabilidade
      if (metrics.reliability.v2SuccessRate < 98) {
        score -= 30;
        issues.push(`Taxa de sucesso baixa: ${metrics.reliability.v2SuccessRate.toFixed(1)}%`);
      } else if (metrics.reliability.v2SuccessRate < 95) {
        score -= 50;
        issues.push(`Taxa de sucesso crítica: ${metrics.reliability.v2SuccessRate.toFixed(1)}%`);
      }

      // Penalizar por erros
      if (metrics.errors.errorTrend === 'UP') {
        score -= 15;
        issues.push('Tendência de erros crescente');
      }

      if (metrics.errors.criticalErrors.length > 0) {
        score -= metrics.errors.criticalErrors.length * 10;
        issues.push(`${metrics.errors.criticalErrors.length} erros críticos`);
      }

      // Determinar saúde
      const healthy = score >= 80;
      
      let summary: string;
      if (score >= 90) summary = '🟢 Sistema muito saudável';
      else if (score >= 80) summary = '🟡 Sistema saudável com pequenos problemas';
      else if (score >= 60) summary = '🟠 Sistema com problemas moderados';
      else summary = '🔴 Sistema com problemas graves';

      return {
        healthy,
        score,
        issues,
        summary
      };

    } catch (error) {
      logger.error('Erro ao executar health check da migração', { error });
      return {
        healthy: false,
        score: 0,
        issues: ['Erro ao coletar métricas de saúde'],
        summary: '🔴 Sistema de monitoramento indisponível'
      };
    }
  }
}

// Instância singleton para uso em todo o sistema
export const migrationMonitoringService = new MigrationMonitoringService();