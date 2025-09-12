/**
 * 🚩 FEATURE FLAGS - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Sistema de feature flags para controle de rollout gradual da integração
 * Permite ativar/desativar funcionalidades novas de forma controlada
 */

import { logger } from './logger';
import { debugLogger } from '../utils/debugLogger';

export interface FeatureFlagConfig {
  USE_INTEGRATED_EMAIL_SEND: boolean;
  ROLLOUT_PERCENTAGE: number;
  ENABLE_MIGRATION_MONITORING: boolean;
  ENABLE_AUTO_ROLLBACK: boolean;
  CLEANUP_LEGACY_CODE: boolean;
}

/**
 * Configuração padrão de feature flags
 */
const defaultConfig: FeatureFlagConfig = {
  // Integração emails-v2
  USE_INTEGRATED_EMAIL_SEND: process.env.USE_INTEGRATED_EMAIL_SEND === 'true',
  
  // Percentual de rollout (0-100)
  ROLLOUT_PERCENTAGE: parseInt(process.env.ROLLOUT_PERCENTAGE || '0', 10),
  
  // Monitoramento da migração
  ENABLE_MIGRATION_MONITORING: process.env.ENABLE_MIGRATION_MONITORING !== 'false',
  
  // Rollback automático
  ENABLE_AUTO_ROLLBACK: process.env.ENABLE_AUTO_ROLLBACK === 'true',
  
  // Limpeza de código legado (só quando 100% estável)
  CLEANUP_LEGACY_CODE: process.env.CLEANUP_LEGACY_CODE === 'true'
};

/**
 * Cache de configurações para evitar re-parsing constante
 */
let configCache: FeatureFlagConfig | null = null;
let lastConfigUpdate = 0;
const CONFIG_CACHE_TTL = 30000; // 30 segundos

/**
 * Obter configuração atual de feature flags
 */
export function getFeatureFlags(): FeatureFlagConfig {
  const now = Date.now();
  
  if (!configCache || now - lastConfigUpdate > CONFIG_CACHE_TTL) {
    configCache = {
      USE_INTEGRATED_EMAIL_SEND: process.env.USE_INTEGRATED_EMAIL_SEND === 'true',
      ROLLOUT_PERCENTAGE: Math.max(0, Math.min(100, parseInt(process.env.ROLLOUT_PERCENTAGE || '0', 10))),
      ENABLE_MIGRATION_MONITORING: process.env.ENABLE_MIGRATION_MONITORING !== 'false',
      ENABLE_AUTO_ROLLBACK: process.env.ENABLE_AUTO_ROLLBACK === 'true',
      CLEANUP_LEGACY_CODE: process.env.CLEANUP_LEGACY_CODE === 'true'
    };
    
    lastConfigUpdate = now;
    
    logger.debug('Feature flags atualizadas', {
      config: configCache,
      timestamp: new Date().toISOString()
    });
  }
  
  return configCache;
}

/**
 * Verificar se um usuário deve usar a nova integração de emails
 */
export function shouldUseIntegratedEmailSend(userId: number): boolean {
  const flags = getFeatureFlags();
  
  // Se feature flag global estiver desabilitada, usar rota antiga
  if (!flags.USE_INTEGRATED_EMAIL_SEND) {
    return false;
  }
  
  // Se rollout está em 100%, todos usam nova rota
  if (flags.ROLLOUT_PERCENTAGE >= 100) {
    return true;
  }
  
  // Se rollout está em 0%, ninguém usa nova rota
  if (flags.ROLLOUT_PERCENTAGE <= 0) {
    return false;
  }
  
  // Rollout gradual baseado em hash do userId
  // Isso garante que o mesmo usuário sempre tenha o mesmo resultado
  const userHash = userId % 100;
  const shouldUse = userHash < flags.ROLLOUT_PERCENTAGE;
  
  // Log da decisão para debugging
  if (flags.ENABLE_MIGRATION_MONITORING) {
    debugLogger.logFallbackAction({
      trigger: 'feature_flag_evaluation',
      fallbackType: shouldUse ? 'DOMAIN_FALLBACK' as const : 'SERVICE_FALLBACK' as const,
      originalRequest: { userId, userHash, rolloutPercentage: flags.ROLLOUT_PERCENTAGE },
      fallbackRequest: { useIntegratedSend: shouldUse },
      requestId: `ff_${Date.now()}_${userId}`
    });
  }
  
  return shouldUse;
}

/**
 * Verificar se rollout pode ser aumentado com segurança
 */
export function canIncreaseRollout(): {
  canIncrease: boolean;
  reason: string;
  suggestedPercentage?: number;
} {
  const flags = getFeatureFlags();
  
  // Se já está em 100%, não pode aumentar mais
  if (flags.ROLLOUT_PERCENTAGE >= 100) {
    return {
      canIncrease: false,
      reason: 'Rollout já está em 100%'
    };
  }
  
  // Se cleanup está ativado, não deve aumentar rollout
  if (flags.CLEANUP_LEGACY_CODE) {
    return {
      canIncrease: false,
      reason: 'Cleanup de código legado está ativo, rollout deve estar completo'
    };
  }
  
  // Se auto-rollback está ativo, pode ser sinal de problemas
  if (flags.ENABLE_AUTO_ROLLBACK) {
    return {
      canIncrease: false,
      reason: 'Auto-rollback está ativo, aguardar estabilização'
    };
  }
  
  // Sugerir incremento gradual
  const currentPercentage = flags.ROLLOUT_PERCENTAGE;
  let suggestedPercentage: number;
  
  if (currentPercentage < 10) {
    suggestedPercentage = 10;
  } else if (currentPercentage < 25) {
    suggestedPercentage = 25;
  } else if (currentPercentage < 50) {
    suggestedPercentage = 50;
  } else if (currentPercentage < 75) {
    suggestedPercentage = 75;
  } else {
    suggestedPercentage = 100;
  }
  
  return {
    canIncrease: true,
    reason: `Pode aumentar rollout gradualmente`,
    suggestedPercentage
  };
}

/**
 * Atualizar configuração de feature flag dinamicamente
 */
export function updateFeatureFlag(
  flag: keyof FeatureFlagConfig,
  value: boolean | number,
  reason: string = 'Manual update'
): { success: boolean; message: string; oldValue: any; newValue: any } {
  const oldFlags = getFeatureFlags();
  const oldValue = oldFlags[flag];
  
  try {
    // Validações específicas
    if (flag === 'ROLLOUT_PERCENTAGE' && typeof value === 'number') {
      if (value < 0 || value > 100) {
        return {
          success: false,
          message: 'ROLLOUT_PERCENTAGE deve estar entre 0 e 100',
          oldValue,
          newValue: value
        };
      }
    }
    
    // Atualizar variável de ambiente
    const envVarName = flag;
    process.env[envVarName] = value.toString();
    
    // Limpar cache para forçar reload
    configCache = null;
    
    // Obter nova configuração
    const newFlags = getFeatureFlags();
    const newValue = newFlags[flag];
    
    // Log da mudança
    logger.info('🚩 Feature flag atualizada', {
      flag,
      oldValue,
      newValue,
      reason,
      updatedBy: 'system',
      timestamp: new Date().toISOString()
    });
    
    // Log crítico se rollout foi aumentado significativamente
    if (flag === 'ROLLOUT_PERCENTAGE' && typeof oldValue === 'number' && typeof newValue === 'number') {
      if (newValue - oldValue >= 25) {
        debugLogger.logCriticalIssue({
          type: 'SYSTEM_OVERLOAD',
          description: `Rollout aumentado significativamente: ${oldValue}% → ${newValue}%`,
          context: { flag, oldValue, newValue, reason },
          impact: 'HIGH',
          suggestedAction: 'Monitorar métricas de performance e erro'
        });
      }
    }
    
    return {
      success: true,
      message: `Feature flag ${flag} atualizada com sucesso`,
      oldValue,
      newValue
    };
    
  } catch (error) {
    logger.error('Erro ao atualizar feature flag', {
      flag,
      value,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return {
      success: false,
      message: `Erro ao atualizar ${flag}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      oldValue,
      newValue: value
    };
  }
}

/**
 * Status detalhado do rollout atual
 */
export function getRolloutStatus(): {
  isActive: boolean;
  percentage: number;
  estimatedUsers: number;
  phase: string;
  recommendations: string[];
  monitoring: boolean;
  autoRollback: boolean;
  canCleanup: boolean;
} {
  const flags = getFeatureFlags();
  const rolloutCheck = canIncreaseRollout();
  
  let phase = 'DISABLED';
  if (flags.USE_INTEGRATED_EMAIL_SEND) {
    if (flags.ROLLOUT_PERCENTAGE === 0) {
      phase = 'READY';
    } else if (flags.ROLLOUT_PERCENTAGE < 25) {
      phase = 'EARLY_ROLLOUT';
    } else if (flags.ROLLOUT_PERCENTAGE < 75) {
      phase = 'GRADUAL_ROLLOUT';
    } else if (flags.ROLLOUT_PERCENTAGE < 100) {
      phase = 'FINAL_ROLLOUT';
    } else {
      phase = 'COMPLETE';
    }
  }
  
  const recommendations: string[] = [];
  
  if (!flags.USE_INTEGRATED_EMAIL_SEND) {
    recommendations.push('Habilitar USE_INTEGRATED_EMAIL_SEND para começar rollout');
  } else if (flags.ROLLOUT_PERCENTAGE === 0) {
    recommendations.push('Começar com ROLLOUT_PERCENTAGE=10 para teste inicial');
  } else if (rolloutCheck.canIncrease) {
    recommendations.push(`Considerar aumentar para ${rolloutCheck.suggestedPercentage}% se métricas estiverem boas`);
  } else if (flags.ROLLOUT_PERCENTAGE === 100 && !flags.CLEANUP_LEGACY_CODE) {
    recommendations.push('Rollout completo - considerar CLEANUP_LEGACY_CODE=true');
  }
  
  if (!flags.ENABLE_MIGRATION_MONITORING && flags.ROLLOUT_PERCENTAGE > 0) {
    recommendations.push('Habilitar ENABLE_MIGRATION_MONITORING durante rollout');
  }
  
  return {
    isActive: flags.USE_INTEGRATED_EMAIL_SEND && flags.ROLLOUT_PERCENTAGE > 0,
    percentage: flags.ROLLOUT_PERCENTAGE,
    estimatedUsers: Math.floor(flags.ROLLOUT_PERCENTAGE), // Placeholder - seria calculado com dados reais
    phase,
    recommendations,
    monitoring: flags.ENABLE_MIGRATION_MONITORING,
    autoRollback: flags.ENABLE_AUTO_ROLLBACK,
    canCleanup: flags.ROLLOUT_PERCENTAGE === 100 && flags.CLEANUP_LEGACY_CODE
  };
}

// Exportar instância das feature flags para uso direto
export const FEATURES = getFeatureFlags();