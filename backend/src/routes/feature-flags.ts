/**
 * 🚩 FEATURE FLAGS API ROUTES - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Rotas para gerenciamento e consulta de feature flags
 * Permite controle do rollout gradual da integração
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { 
  getFeatureFlags, 
  shouldUseIntegratedEmailSend, 
  updateFeatureFlag,
  FeatureFlagConfig,
  getRolloutStatus,
  canIncreaseRollout
} from '../config/features';
import { logger } from '../config/logger';
import { debugLogger } from '../utils/debugLogger';

const router = Router();

/**
 * GET /feature-flags - Obter feature flags para o usuário atual
 */
router.get('/', 
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const flags = getFeatureFlags();
    const userInRollout = shouldUseIntegratedEmailSend(userId);
    const rolloutStatus = getRolloutStatus();
    
    // Log da consulta para monitoramento
    if (flags.ENABLE_MIGRATION_MONITORING) {
      debugLogger.logTestExecution({
        testName: 'feature_flag_query',
        testType: 'INTEGRATION',
        status: 'PASSED',
        requestId: req.requestId || `ff_query_${Date.now()}`,
        assertions: {
          passed: 1,
          failed: 0,
          total: 1
        }
      });
    }
    
    const responseData = {
      USE_INTEGRATED_EMAIL_SEND: flags.USE_INTEGRATED_EMAIL_SEND,
      ROLLOUT_PERCENTAGE: flags.ROLLOUT_PERCENTAGE,
      ENABLE_MIGRATION_MONITORING: flags.ENABLE_MIGRATION_MONITORING,
      USER_IN_ROLLOUT: userInRollout,
      ROLLOUT_PHASE: rolloutStatus.phase,
      
      // Informações adicionais para debugging
      debug: {
        userId,
        userHash: userId % 100,
        rolloutActive: rolloutStatus.isActive,
        canCleanup: rolloutStatus.canCleanup
      }
    };
    
    res.json(responseData);
  })
);

/**
 * GET /feature-flags/status - Status detalhado do rollout (admin only)
 */
router.get('/status',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const flags = getFeatureFlags();
    const rolloutStatus = getRolloutStatus();
    const rolloutCheck = canIncreaseRollout();
    
    res.json({
      flags,
      rolloutStatus,
      rolloutCheck,
      system: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      }
    });
  })
);

/**
 * PUT /feature-flags/:flag - Atualizar uma feature flag específica (admin only)
 */
router.put('/:flag',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { flag } = req.params;
    const { value, reason = 'Admin update' } = req.body;
    
    // Validar flag name
    const validFlags = [
      'USE_INTEGRATED_EMAIL_SEND',
      'ROLLOUT_PERCENTAGE',
      'ENABLE_MIGRATION_MONITORING',
      'ENABLE_AUTO_ROLLBACK',
      'CLEANUP_LEGACY_CODE'
    ];
    
    if (!validFlags.includes(flag)) {
      return res.status(400).json({
        error: 'Invalid feature flag name',
        validFlags,
        provided: flag
      });
    }
    
    // Validar tipo do valor
    if (flag === 'ROLLOUT_PERCENTAGE') {
      if (typeof value !== 'number' || value < 0 || value > 100) {
        return res.status(400).json({
          error: 'ROLLOUT_PERCENTAGE must be a number between 0 and 100',
          provided: value
        });
      }
    } else if (typeof value !== 'boolean') {
      return res.status(400).json({
        error: 'Feature flag value must be boolean (except ROLLOUT_PERCENTAGE)',
        provided: value,
        type: typeof value
      });
    }
    
    // Verificações de segurança
    if (flag === 'CLEANUP_LEGACY_CODE' && value === true) {
      const currentFlags = getFeatureFlags();
      if (currentFlags.ROLLOUT_PERCENTAGE < 100) {
        return res.status(400).json({
          error: 'Cannot enable CLEANUP_LEGACY_CODE until ROLLOUT_PERCENTAGE is 100%',
          currentRollout: currentFlags.ROLLOUT_PERCENTAGE
        });
      }
    }
    
    // Atualizar feature flag
    const updateResult = updateFeatureFlag(
      flag as keyof FeatureFlagConfig,
      value,
      `${reason} (by user ${req.user!.id})`
    );
    
    if (!updateResult.success) {
      return res.status(400).json({
        error: updateResult.message,
        details: updateResult
      });
    }
    
    // Log crítico para mudanças importantes
    if (flag === 'ROLLOUT_PERCENTAGE' || flag === 'USE_INTEGRATED_EMAIL_SEND') {
      logger.info('🚨 Feature flag crítica alterada', {
        flag,
        oldValue: updateResult.oldValue,
        newValue: updateResult.newValue,
        userId: req.user!.id,
        reason,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: updateResult.message,
      flag,
      oldValue: updateResult.oldValue,
      newValue: updateResult.newValue,
      updatedAt: new Date().toISOString()
    });
  })
);

/**
 * POST /feature-flags/rollout/increase - Aumentar rollout gradualmente (admin only)
 */
router.post('/rollout/increase',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { percentage, reason = 'Gradual rollout increase' } = req.body;
    const rolloutCheck = canIncreaseRollout();
    
    if (!rolloutCheck.canIncrease) {
      return res.status(400).json({
        error: 'Cannot increase rollout at this time',
        reason: rolloutCheck.reason,
        recommendation: 'Check system metrics and resolve issues first'
      });
    }
    
    const targetPercentage = percentage || rolloutCheck.suggestedPercentage;
    
    if (!targetPercentage || targetPercentage <= getFeatureFlags().ROLLOUT_PERCENTAGE) {
      return res.status(400).json({
        error: 'Target percentage must be higher than current rollout',
        current: getFeatureFlags().ROLLOUT_PERCENTAGE,
        suggested: rolloutCheck.suggestedPercentage
      });
    }
    
    // Atualizar rollout
    const updateResult = updateFeatureFlag(
      'ROLLOUT_PERCENTAGE',
      targetPercentage,
      reason
    );
    
    if (!updateResult.success) {
      return res.status(400).json({
        error: updateResult.message
      });
    }
    
    // Log da mudança
    debugLogger.logCriticalIssue({
      type: 'SYSTEM_OVERLOAD',
      description: `Rollout aumentado: ${updateResult.oldValue}% → ${updateResult.newValue}%`,
      context: {
        userId: req.user!.id,
        reason,
        oldValue: updateResult.oldValue,
        newValue: updateResult.newValue
      },
      impact: 'MEDIUM',
      suggestedAction: 'Monitorar métricas nas próximas horas'
    });
    
    res.json({
      success: true,
      message: `Rollout aumentado para ${targetPercentage}%`,
      oldPercentage: updateResult.oldValue,
      newPercentage: updateResult.newValue,
      estimatedImpact: `~${targetPercentage}% dos usuários usarão a nova integração`,
      recommendation: 'Monitorar métricas de performance e erro nas próximas 2-4 horas'
    });
  })
);

/**
 * POST /feature-flags/rollout/emergency-stop - Parar rollout em emergência
 */
router.post('/rollout/emergency-stop',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reason = 'Emergency rollback', keepMonitoring = true } = req.body;
    
    logger.error('🚨 EMERGENCY ROLLOUT STOP', {
      triggeredBy: req.user!.id,
      reason,
      timestamp: new Date().toISOString()
    });
    
    // Parar rollout imediatamente
    const updates = [
      updateFeatureFlag('USE_INTEGRATED_EMAIL_SEND', false, `Emergency stop: ${reason}`),
      updateFeatureFlag('ROLLOUT_PERCENTAGE', 0, `Emergency stop: ${reason}`),
      updateFeatureFlag('ENABLE_AUTO_ROLLBACK', true, 'Emergency stop activated')
    ];
    
    if (keepMonitoring) {
      updates.push(updateFeatureFlag('ENABLE_MIGRATION_MONITORING', true, 'Keep monitoring during emergency'));
    }
    
    // Verificar se todas as atualizações foram bem-sucedidas
    const failedUpdates = updates.filter(u => !u.success);
    if (failedUpdates.length > 0) {
      return res.status(500).json({
        error: 'Some emergency updates failed',
        failed: failedUpdates,
        successful: updates.filter(u => u.success)
      });
    }
    
    // Log crítico
    debugLogger.logCriticalIssue({
      type: 'HIGH_ERROR_RATE',
      description: `Emergency rollout stop triggered: ${reason}`,
      context: {
        triggeredBy: req.user!.id,
        reason,
        updatesApplied: updates.length
      },
      impact: 'CRITICAL',
      suggestedAction: 'Investigate root cause before resuming rollout'
    });
    
    res.json({
      success: true,
      message: 'Emergency rollout stop executed successfully',
      actions: [
        'USE_INTEGRATED_EMAIL_SEND disabled',
        'ROLLOUT_PERCENTAGE set to 0',
        'ENABLE_AUTO_ROLLBACK activated',
        keepMonitoring ? 'Monitoring kept active' : 'Monitoring unchanged'
      ],
      recommendation: 'All users now use legacy email system. Investigate issues before resuming.',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /feature-flags/migration/metrics - Métricas da migração
 */
router.get('/migration/metrics',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Isto seria integrado com o ValidationMetricsService
    // Por ora, retornar estrutura básica
    
    const flags = getFeatureFlags();
    const rolloutStatus = getRolloutStatus();
    
    res.json({
      rollout: {
        active: rolloutStatus.isActive,
        percentage: flags.ROLLOUT_PERCENTAGE,
        phase: rolloutStatus.phase,
        monitoring: flags.ENABLE_MIGRATION_MONITORING
      },
      metrics: {
        // Estas métricas viriam do ValidationMetricsService
        placeholder: 'Integration with ValidationMetricsService pending',
        recommendation: 'Use ValidationMetricsService.calculateMetrics() for real data'
      },
      recommendations: rolloutStatus.recommendations,
      lastUpdate: new Date().toISOString()
    });
  })
);

export default router;