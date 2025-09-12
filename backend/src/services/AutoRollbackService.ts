/**
 * 🔄 AUTO ROLLBACK SERVICE - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Serviço de rollback automático da migração emails-v2
 * Monitora métricas e executa rollback quando critérios são atingidos
 */

import { logger } from '../config/logger';
import { debugLogger } from '../utils/debugLogger';
import { getFeatureFlags, updateFeatureFlag } from '../config/features';
import { migrationMonitoringService } from './MigrationMonitoringService';
import * as cron from 'node-cron';

export interface RollbackTrigger {
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'WARNING' | 'CRITICAL';
  description: string;
  action: 'REDUCE_ROLLOUT' | 'FULL_ROLLBACK' | 'DISABLE_INTEGRATION';
}

export interface RollbackExecution {
  triggeredAt: string;
  trigger: string;
  severity: 'WARNING' | 'CRITICAL';
  previousState: {
    useIntegratedEmailSend: boolean;
    rolloutPercentage: number;
  };
  newState: {
    useIntegratedEmailSend: boolean;
    rolloutPercentage: number;
  };
  reason: string;
  executedActions: string[];
  success: boolean;
  error?: string;
}

export class AutoRollbackService {
  private isEnabled = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cronJob: cron.ScheduledTask | null = null;
  private rollbackHistory: RollbackExecution[] = [];

  /**
   * Triggers de rollback configurados
   */
  private rollbackTriggers: RollbackTrigger[] = [
    // TRIGGERS CRÍTICOS - Rollback completo imediato
    {
      name: 'CRITICAL_SUCCESS_RATE',
      condition: (metrics) => metrics.reliability.v2SuccessRate < 90,
      severity: 'CRITICAL',
      description: 'Taxa de sucesso V2 abaixo de 90%',
      action: 'FULL_ROLLBACK'
    },
    {
      name: 'CRITICAL_LATENCY',
      condition: (metrics) => metrics.performance.v2ApiLatencyMs > 5000,
      severity: 'CRITICAL',
      description: 'Latência V2 acima de 5 segundos',
      action: 'FULL_ROLLBACK'
    },
    {
      name: 'CRITICAL_ERROR_SPIKE',
      condition: (metrics) => metrics.errors.v2ErrorCount > metrics.errors.legacyErrorCount * 3,
      severity: 'CRITICAL',
      description: 'Erros V2 3x maiores que legacy',
      action: 'FULL_ROLLBACK'
    },
    {
      name: 'MULTIPLE_CRITICAL_ERRORS',
      condition: (metrics) => metrics.errors.criticalErrors.length > 5,
      severity: 'CRITICAL',
      description: 'Mais de 5 erros críticos simultâneos',
      action: 'FULL_ROLLBACK'
    },

    // TRIGGERS DE WARNING - Redução gradual
    {
      name: 'WARNING_SUCCESS_RATE',
      condition: (metrics) => metrics.reliability.v2SuccessRate < 95,
      severity: 'WARNING',
      description: 'Taxa de sucesso V2 abaixo de 95%',
      action: 'REDUCE_ROLLOUT'
    },
    {
      name: 'WARNING_LATENCY_DEGRADATION',
      condition: (metrics) => metrics.performance.v2ApiLatencyMs > 2000,
      severity: 'WARNING',
      description: 'Latência V2 acima de 2 segundos',
      action: 'REDUCE_ROLLOUT'
    },
    {
      name: 'ERROR_TREND_UP',
      condition: (metrics) => metrics.errors.errorTrend === 'UP' && metrics.errors.v2ErrorCount > 10,
      severity: 'WARNING',
      description: 'Tendência crescente de erros com volume alto',
      action: 'REDUCE_ROLLOUT'
    }
  ];

  /**
   * Iniciar monitoramento automático
   */
  start(): void {
    const flags = getFeatureFlags();
    
    if (!flags.ENABLE_AUTO_ROLLBACK) {
      logger.info('🔄 Auto-rollback desabilitado por feature flag');
      return;
    }

    if (this.isEnabled) {
      logger.warn('🔄 Auto-rollback já está habilitado');
      return;
    }

    this.isEnabled = true;
    
    // Monitoramento contínuo a cada 2 minutos
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkForRollbackConditions();
      } catch (error) {
        logger.error('Erro no monitoramento de auto-rollback', { error });
      }
    }, 2 * 60 * 1000); // 2 minutos

    // Cron job para verificações mais espaçadas (a cada 10 minutos)
    this.cronJob = cron.schedule('*/10 * * * *', async () => {
      try {
        await this.performHealthBasedRollback();
      } catch (error) {
        logger.error('Erro no health check de auto-rollback', { error });
      }
    });

    logger.info('🔄 Auto-rollback service iniciado', {
      monitoringInterval: '2 minutos',
      healthCheckInterval: '10 minutos',
      triggersCount: this.rollbackTriggers.length
    });
  }

  /**
   * Parar monitoramento automático
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }

    this.isEnabled = false;
    logger.info('🔄 Auto-rollback service parado');
  }

  /**
   * Verificar condições de rollback
   */
  private async checkForRollbackConditions(): Promise<void> {
    if (!this.isEnabled) return;

    const flags = getFeatureFlags();
    
    // Se rollout está desabilitado, não há nada para fazer rollback
    if (!flags.USE_INTEGRATED_EMAIL_SEND || flags.ROLLOUT_PERCENTAGE === 0) {
      return;
    }

    try {
      const metrics = await migrationMonitoringService.collectMetrics();
      const triggeredRollbacks: RollbackTrigger[] = [];

      // Verificar todos os triggers
      for (const trigger of this.rollbackTriggers) {
        try {
          if (trigger.condition(metrics)) {
            triggeredRollbacks.push(trigger);
            
            logger.warn(`🚨 Trigger de rollback ativado: ${trigger.name}`, {
              trigger: trigger.name,
              severity: trigger.severity,
              description: trigger.description,
              action: trigger.action
            });
          }
        } catch (error) {
          logger.error(`Erro ao avaliar trigger ${trigger.name}`, { error });
        }
      }

      // Se há triggers ativados, executar rollback
      if (triggeredRollbacks.length > 0) {
        await this.executeRollback(triggeredRollbacks, metrics);
      }

    } catch (error) {
      logger.error('Erro ao verificar condições de rollback', { error });
    }
  }

  /**
   * Executar rollback baseado nos triggers
   */
  private async executeRollback(
    triggers: RollbackTrigger[],
    metrics: any
  ): Promise<void> {
    const flags = getFeatureFlags();
    const mostSevere = triggers.find(t => t.severity === 'CRITICAL') || triggers[0];
    
    const rollbackExecution: RollbackExecution = {
      triggeredAt: new Date().toISOString(),
      trigger: triggers.map(t => t.name).join(', '),
      severity: mostSevere.severity,
      previousState: {
        useIntegratedEmailSend: flags.USE_INTEGRATED_EMAIL_SEND,
        rolloutPercentage: flags.ROLLOUT_PERCENTAGE
      },
      newState: {
        useIntegratedEmailSend: flags.USE_INTEGRATED_EMAIL_SEND,
        rolloutPercentage: flags.ROLLOUT_PERCENTAGE
      },
      reason: triggers.map(t => t.description).join('; '),
      executedActions: [],
      success: false
    };

    try {
      // Determinar ação baseada na severidade
      if (triggers.some(t => t.severity === 'CRITICAL')) {
        // ROLLBACK COMPLETO para triggers críticos
        await this.performFullRollback(rollbackExecution, mostSevere.description);
      } else {
        // REDUÇÃO GRADUAL para warnings
        await this.performGradualRollback(rollbackExecution, triggers[0].description);
      }

      rollbackExecution.success = true;
      
      // Log crítico do rollback executado
      debugLogger.logCriticalIssue({
        type: 'HIGH_ERROR_RATE',
        description: `Auto-rollback executado: ${rollbackExecution.reason}`,
        context: {
          triggers: triggers.map(t => t.name),
          previousPercentage: rollbackExecution.previousState.rolloutPercentage,
          newPercentage: rollbackExecution.newState.rolloutPercentage,
          metrics: {
            v2SuccessRate: metrics.reliability.v2SuccessRate,
            v2Latency: metrics.performance.v2ApiLatencyMs,
            v2Errors: metrics.errors.v2ErrorCount
          }
        },
        impact: mostSevere.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        suggestedAction: 'Analisar causa raiz antes de reativar rollout'
      });

    } catch (error) {
      rollbackExecution.success = false;
      rollbackExecution.error = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('🚨 FALHA NO AUTO-ROLLBACK', {
        error: rollbackExecution.error,
        triggers: triggers.map(t => t.name),
        rollbackExecution
      });
    }

    // Adicionar ao histórico
    this.rollbackHistory.push(rollbackExecution);
    
    // Manter apenas últimas 50 execuções
    if (this.rollbackHistory.length > 50) {
      this.rollbackHistory = this.rollbackHistory.slice(-50);
    }
  }

  /**
   * Rollback completo (desabilitar integração)
   */
  private async performFullRollback(
    execution: RollbackExecution,
    reason: string
  ): Promise<void> {
    logger.error('🚨 EXECUTANDO ROLLBACK COMPLETO', { reason });
    
    // 1. Desabilitar integração completamente
    const disableResult = updateFeatureFlag(
      'USE_INTEGRATED_EMAIL_SEND',
      false,
      `Auto-rollback: ${reason}`
    );
    execution.executedActions.push('Disabled USE_INTEGRATED_EMAIL_SEND');
    
    // 2. Zerar rollout
    const rolloutResult = updateFeatureFlag(
      'ROLLOUT_PERCENTAGE',
      0,
      `Auto-rollback: ${reason}`
    );
    execution.executedActions.push('Set ROLLOUT_PERCENTAGE to 0');
    
    // 3. Habilitar auto-rollback para evitar reativação acidental
    const autoRollbackResult = updateFeatureFlag(
      'ENABLE_AUTO_ROLLBACK',
      true,
      `Auto-rollback prevention: ${reason}`
    );
    execution.executedActions.push('Enabled ENABLE_AUTO_ROLLBACK');
    
    // Atualizar estado final
    execution.newState = {
      useIntegratedEmailSend: false,
      rolloutPercentage: 0
    };
    
    logger.error('🔄 Rollback completo executado - todos os usuários voltaram para sistema legado', {
      reason,
      actions: execution.executedActions,
      success: disableResult.success && rolloutResult.success && autoRollbackResult.success
    });
  }

  /**
   * Rollback gradual (reduzir percentual)
   */
  private async performGradualRollback(
    execution: RollbackExecution,
    reason: string
  ): Promise<void> {
    const flags = getFeatureFlags();
    const currentPercentage = flags.ROLLOUT_PERCENTAGE;
    
    // Reduzir pela metade ou mínimo 5%
    let newPercentage = Math.floor(currentPercentage / 2);
    if (newPercentage < 5 && currentPercentage > 5) {
      newPercentage = 5;
    } else if (newPercentage < 5) {
      newPercentage = 0;
    }
    
    logger.warn(`🔄 EXECUTANDO ROLLBACK GRADUAL: ${currentPercentage}% → ${newPercentage}%`, { reason });
    
    const rolloutResult = updateFeatureFlag(
      'ROLLOUT_PERCENTAGE',
      newPercentage,
      `Auto-rollback gradual: ${reason}`
    );
    
    execution.executedActions.push(`Reduced rollout from ${currentPercentage}% to ${newPercentage}%`);
    execution.newState.rolloutPercentage = newPercentage;
    
    logger.warn(`🔄 Rollback gradual executado - rollout reduzido para ${newPercentage}%`, {
      reason,
      previousPercentage: currentPercentage,
      newPercentage,
      success: rolloutResult.success
    });
  }

  /**
   * Verificação de saúde para rollback preventivo
   */
  private async performHealthBasedRollback(): Promise<void> {
    try {
      const healthCheck = await migrationMonitoringService.performHealthCheck();
      
      // Se score muito baixo, considerar rollback preventivo
      if (healthCheck.score < 50) {
        const mockMetrics = await migrationMonitoringService.collectMetrics();
        
        await this.executeRollback([{
          name: 'HEALTH_SCORE_CRITICAL',
          condition: () => true,
          severity: 'CRITICAL',
          description: `Health score muito baixo: ${healthCheck.score}/100`,
          action: 'FULL_ROLLBACK'
        }], mockMetrics);
      } else if (healthCheck.score < 70) {
        logger.warn(`🔄 Health score baixo detectado: ${healthCheck.score}/100`, {
          issues: healthCheck.issues,
          recommendation: 'Considerar intervenção manual'
        });
      }
      
    } catch (error) {
      logger.error('Erro no health-based rollback check', { error });
    }
  }

  /**
   * Obter histórico de rollbacks
   */
  getRollbackHistory(): RollbackExecution[] {
    return [...this.rollbackHistory];
  }

  /**
   * Obter status do serviço
   */
  getStatus(): {
    enabled: boolean;
    triggersCount: number;
    rollbacksExecuted: number;
    lastRollback?: RollbackExecution;
    isMonitoring: boolean;
  } {
    return {
      enabled: this.isEnabled,
      triggersCount: this.rollbackTriggers.length,
      rollbacksExecuted: this.rollbackHistory.length,
      lastRollback: this.rollbackHistory[this.rollbackHistory.length - 1],
      isMonitoring: this.monitoringInterval !== null
    };
  }

  /**
   * Teste manual de trigger (apenas para desenvolvimento)
   */
  async testTrigger(triggerName: string): Promise<{
    success: boolean;
    message: string;
    execution?: RollbackExecution;
  }> {
    const trigger = this.rollbackTriggers.find(t => t.name === triggerName);
    
    if (!trigger) {
      return {
        success: false,
        message: `Trigger '${triggerName}' não encontrado`,
      };
    }
    
    try {
      const metrics = await migrationMonitoringService.collectMetrics();
      await this.executeRollback([trigger], metrics);
      
      return {
        success: true,
        message: `Trigger '${triggerName}' testado com sucesso`,
        execution: this.rollbackHistory[this.rollbackHistory.length - 1]
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Erro ao testar trigger: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Instância singleton
export const autoRollbackService = new AutoRollbackService();