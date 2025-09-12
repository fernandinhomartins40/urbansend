/**
 * 🔄 AUTO ROLLBACK ROUTES - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Rotas para gerenciamento do auto-rollback
 * Controle, monitoramento e histórico de rollbacks automáticos
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { autoRollbackService } from '../services/AutoRollbackService';
import { logger } from '../config/logger';

const router = Router();

/**
 * GET /auto-rollback/status - Status do serviço de auto-rollback
 */
router.get('/status',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const status = autoRollbackService.getStatus();
    
    res.json({
      success: true,
      autoRollback: status,
      recommendation: status.enabled 
        ? 'Auto-rollback ativo - sistema protegido'
        : 'Auto-rollback desativado - ativar para proteção automática',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * POST /auto-rollback/start - Iniciar monitoramento de auto-rollback
 */
router.post('/start',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      autoRollbackService.start();
      
      logger.info('🔄 Auto-rollback iniciado manualmente', {
        startedBy: req.user!.id,
        timestamp: new Date().toISOString()
      });
      
      res.json({
        success: true,
        message: 'Auto-rollback service iniciado com sucesso',
        status: autoRollbackService.getStatus(),
        recommendation: 'Monitoramento automático ativo - sistema protegerá rollout'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro ao iniciar auto-rollback',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

/**
 * POST /auto-rollback/stop - Parar monitoramento de auto-rollback
 */
router.post('/stop',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reason = 'Manual stop' } = req.body;
    
    try {
      autoRollbackService.stop();
      
      logger.warn('🔄 Auto-rollback parado manualmente', {
        stoppedBy: req.user!.id,
        reason,
        timestamp: new Date().toISOString()
      });
      
      res.json({
        success: true,
        message: 'Auto-rollback service parado',
        reason,
        warning: 'Sistema não está mais protegido por rollback automático',
        recommendation: 'Reativar auto-rollback quando possível'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro ao parar auto-rollback',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

/**
 * GET /auto-rollback/history - Histórico de rollbacks executados
 */
router.get('/history',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = 20, severity } = req.query;
    
    let history = autoRollbackService.getRollbackHistory();
    
    // Filtrar por severidade se especificado
    if (severity && ['WARNING', 'CRITICAL'].includes(severity as string)) {
      history = history.filter(r => r.severity === severity);
    }
    
    // Limitar resultados
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    history = history.slice(-limitNum);
    
    res.json({
      success: true,
      history: history.reverse(), // Mais recentes primeiro
      summary: {
        total: history.length,
        critical: history.filter(r => r.severity === 'CRITICAL').length,
        warning: history.filter(r => r.severity === 'WARNING').length,
        successful: history.filter(r => r.success).length,
        failed: history.filter(r => !r.success).length
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * POST /auto-rollback/test-trigger - Testar trigger específico (desenvolvimento apenas)
 */
router.post('/test-trigger',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { triggerName, dryRun = true } = req.body;
    
    if (!triggerName) {
      return res.status(400).json({
        error: 'triggerName é obrigatório',
        availableTriggers: [
          'CRITICAL_SUCCESS_RATE',
          'CRITICAL_LATENCY', 
          'CRITICAL_ERROR_SPIKE',
          'MULTIPLE_CRITICAL_ERRORS',
          'WARNING_SUCCESS_RATE',
          'WARNING_LATENCY_DEGRADATION',
          'ERROR_TREND_UP'
        ]
      });
    }
    
    // Em produção, só permitir dry run
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !dryRun) {
      return res.status(403).json({
        error: 'Em produção, apenas dry-run é permitido',
        recommendation: 'Use dryRun: true para simular'
      });
    }
    
    if (dryRun) {
      // Simulação apenas
      res.json({
        success: true,
        dryRun: true,
        message: `Simulação do trigger '${triggerName}'`,
        wouldExecute: 'Rollback seria executado em ambiente real',
        triggerName,
        testedBy: req.user!.id,
        timestamp: new Date().toISOString()
      });
      
      logger.info('🧪 Trigger de rollback testado (dry-run)', {
        triggerName,
        testedBy: req.user!.id,
        dryRun: true
      });
      
    } else {
      // Teste real (apenas desenvolvimento)
      const result = await autoRollbackService.testTrigger(triggerName);
      
      logger.warn('🧪 Trigger de rollback testado (REAL)', {
        triggerName,
        testedBy: req.user!.id,
        success: result.success,
        result
      });
      
      res.json({
        success: result.success,
        dryRun: false,
        message: result.message,
        execution: result.execution,
        warning: 'TESTE REAL EXECUTADO - Rollback foi aplicado',
        testedBy: req.user!.id,
        timestamp: new Date().toISOString()
      });
    }
  })
);

/**
 * GET /auto-rollback/triggers - Listar triggers configurados
 */
router.get('/triggers',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Informações sobre os triggers (sem lógica sensível)
    const triggers = [
      {
        name: 'CRITICAL_SUCCESS_RATE',
        severity: 'CRITICAL',
        description: 'Taxa de sucesso V2 abaixo de 90%',
        action: 'FULL_ROLLBACK',
        threshold: '< 90%'
      },
      {
        name: 'CRITICAL_LATENCY',
        severity: 'CRITICAL', 
        description: 'Latência V2 acima de 5 segundos',
        action: 'FULL_ROLLBACK',
        threshold: '> 5000ms'
      },
      {
        name: 'CRITICAL_ERROR_SPIKE',
        severity: 'CRITICAL',
        description: 'Erros V2 3x maiores que legacy',
        action: 'FULL_ROLLBACK',
        threshold: 'V2 errors > 3x legacy'
      },
      {
        name: 'MULTIPLE_CRITICAL_ERRORS',
        severity: 'CRITICAL',
        description: 'Mais de 5 erros críticos simultâneos',
        action: 'FULL_ROLLBACK',
        threshold: '> 5 critical errors'
      },
      {
        name: 'WARNING_SUCCESS_RATE',
        severity: 'WARNING',
        description: 'Taxa de sucesso V2 abaixo de 95%',
        action: 'REDUCE_ROLLOUT',
        threshold: '< 95%'
      },
      {
        name: 'WARNING_LATENCY_DEGRADATION',
        severity: 'WARNING',
        description: 'Latência V2 acima de 2 segundos',
        action: 'REDUCE_ROLLOUT',
        threshold: '> 2000ms'
      },
      {
        name: 'ERROR_TREND_UP',
        severity: 'WARNING',
        description: 'Tendência crescente de erros com volume alto',
        action: 'REDUCE_ROLLOUT',
        threshold: 'trend UP + errors > 10'
      }
    ];
    
    res.json({
      success: true,
      triggers,
      summary: {
        total: triggers.length,
        critical: triggers.filter(t => t.severity === 'CRITICAL').length,
        warning: triggers.filter(t => t.severity === 'WARNING').length
      },
      actions: {
        FULL_ROLLBACK: 'Desabilita integração e zera rollout',
        REDUCE_ROLLOUT: 'Reduz percentual de rollout pela metade',
        DISABLE_INTEGRATION: 'Desabilita apenas a integração'
      }
    });
  })
);

/**
 * POST /auto-rollback/manual-rollback - Executar rollback manual
 */
router.post('/manual-rollback',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type = 'FULL_ROLLBACK', reason, confirm } = req.body;
    
    if (!confirm || confirm !== 'YES_I_UNDERSTAND') {
      return res.status(400).json({
        error: 'Confirmação obrigatória',
        required: 'confirm: "YES_I_UNDERSTAND"',
        warning: 'Esta ação executará rollback imediato'
      });
    }
    
    if (!reason) {
      return res.status(400).json({
        error: 'Reason é obrigatório para rollback manual'
      });
    }
    
    const validTypes = ['FULL_ROLLBACK', 'REDUCE_ROLLOUT'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Tipo inválido',
        validTypes,
        provided: type
      });
    }
    
    try {
      // Simular trigger manual
      const manualTrigger = {
        name: 'MANUAL_ROLLBACK',
        condition: () => true,
        severity: 'CRITICAL' as const,
        description: `Rollback manual: ${reason}`,
        action: type as 'FULL_ROLLBACK' | 'REDUCE_ROLLOUT'
      };
      
      const mockMetrics = await require('../services/MigrationMonitoringService').migrationMonitoringService.collectMetrics();
      await (autoRollbackService as any).executeRollback([manualTrigger], mockMetrics);
      
      logger.error('🚨 ROLLBACK MANUAL EXECUTADO', {
        type,
        reason,
        executedBy: req.user!.id,
        timestamp: new Date().toISOString()
      });
      
      const history = autoRollbackService.getRollbackHistory();
      const lastExecution = history[history.length - 1];
      
      res.json({
        success: true,
        message: 'Rollback manual executado com sucesso',
        type,
        reason,
        execution: lastExecution,
        executedBy: req.user!.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Erro ao executar rollback manual', {
        error,
        type,
        reason,
        userId: req.user!.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Erro ao executar rollback manual',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

export default router;