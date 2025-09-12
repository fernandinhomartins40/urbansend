/**
 * 🔍 MIGRATION MONITORING ROUTES - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Rotas para monitoramento da migração emails-v2
 * Disponibiliza métricas, health checks e status do rollout
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { migrationMonitoringService } from '../services/MigrationMonitoringService';
import { logger } from '../config/logger';

const router = Router();

/**
 * GET /migration-monitoring/metrics - Obter métricas completas da migração
 */
router.get('/metrics',
  authenticateJWT,
  requirePermission('admin:monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metrics = await migrationMonitoringService.collectMetrics();
    
    res.json({
      success: true,
      data: metrics,
      collectedAt: new Date().toISOString(),
      requestId: req.requestId || `metrics_${Date.now()}`
    });
  })
);

/**
 * GET /migration-monitoring/health - Health check da migração
 */
router.get('/health',
  authenticateJWT,
  requirePermission('admin:monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const healthCheck = await migrationMonitoringService.performHealthCheck();
    
    // Status HTTP baseado na saúde
    const statusCode = healthCheck.healthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: healthCheck.healthy,
      health: healthCheck,
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /migration-monitoring/rollout-check - Verificar se rollout pode ser aumentado
 */
router.get('/rollout-check',
  authenticateJWT,
  requirePermission('admin:feature_flags'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rolloutCheck = await migrationMonitoringService.canIncreaseRollout();
    
    res.json({
      success: true,
      rolloutCheck,
      recommendation: rolloutCheck.canIncrease 
        ? 'Rollout pode ser aumentado com segurança'
        : 'Aguardar resolução dos problemas antes de aumentar rollout',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /migration-monitoring/dashboard - Dashboard completo de monitoramento
 */
router.get('/dashboard',
  authenticateJWT,
  requirePermission('admin:monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [metrics, healthCheck, rolloutCheck] = await Promise.all([
      migrationMonitoringService.collectMetrics(),
      migrationMonitoringService.performHealthCheck(),
      migrationMonitoringService.canIncreaseRollout()
    ]);

    // Dashboard consolidado
    const dashboard = {
      overview: {
        healthy: healthCheck.healthy,
        score: healthCheck.score,
        summary: healthCheck.summary,
        canIncreaseRollout: rolloutCheck.canIncrease
      },
      rollout: metrics.rollout,
      performance: {
        ...metrics.performance,
        status: healthCheck.healthy ? 'HEALTHY' : 'DEGRADED'
      },
      reliability: {
        ...metrics.reliability,
        status: metrics.reliability.v2SuccessRate >= 95 ? 'GOOD' : 'POOR'
      },
      errors: {
        ...metrics.errors,
        status: metrics.errors.errorTrend === 'UP' ? 'CONCERNING' : 'STABLE'
      },
      alerts: metrics.alerts.filter(a => a.level === 'CRITICAL' || a.level === 'WARNING'),
      recommendations: metrics.recommendations,
      actions: {
        canIncreaseRollout: rolloutCheck.canIncrease,
        suggestedPercentage: rolloutCheck.suggestedPercentage,
        blockers: rolloutCheck.blockers,
        nextAction: rolloutCheck.canIncrease 
          ? `Considerar aumento para ${rolloutCheck.suggestedPercentage}%`
          : 'Resolver problemas antes de prosseguir'
      }
    };

    res.json({
      success: true,
      dashboard,
      lastUpdate: new Date().toISOString(),
      cacheInfo: {
        ttl: '1 minute',
        nextUpdate: new Date(Date.now() + 60000).toISOString()
      }
    });
  })
);

/**
 * POST /migration-monitoring/alert - Criar alerta manual
 */
router.post('/alert',
  authenticateJWT,
  requirePermission('admin:monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { level, message, context } = req.body;
    
    if (!level || !message) {
      return res.status(400).json({
        error: 'Level and message are required',
        example: {
          level: 'WARNING',
          message: 'Custom alert message',
          context: { optional: 'context data' }
        }
      });
    }
    
    const validLevels = ['INFO', 'WARNING', 'CRITICAL'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({
        error: 'Invalid alert level',
        validLevels,
        provided: level
      });
    }
    
    // Log do alerta manual
    logger.warn('🚨 Manual alert created', {
      level,
      message,
      context,
      createdBy: req.user!.id,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      alert: {
        level,
        message,
        context,
        createdBy: req.user!.id,
        createdAt: new Date().toISOString()
      },
      message: 'Manual alert logged successfully'
    });
  })
);

/**
 * GET /migration-monitoring/export - Exportar métricas para análise
 */
router.get('/export',
  authenticateJWT,
  requirePermission('admin:monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { format = 'json', hours = 24 } = req.query;
    
    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({
        error: 'Invalid format. Supported: json, csv',
        provided: format
      });
    }
    
    // Por ora, retornar métricas atuais
    // Em uma implementação completa, buscaria histórico do banco
    const metrics = await migrationMonitoringService.collectMetrics();
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="migration-metrics-${new Date().toISOString().split('T')[0]}.json"`);
      res.json({
        exportedAt: new Date().toISOString(),
        timeframe: `${hours} hours`,
        metrics: [metrics] // Array para compatibilidade com histórico futuro
      });
    } else {
      // CSV básico
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="migration-metrics-${new Date().toISOString().split('T')[0]}.csv"`);
      
      const csv = [
        'timestamp,rollout_percentage,users_in_rollout,legacy_latency_ms,v2_latency_ms,legacy_success_rate,v2_success_rate,legacy_errors,v2_errors',
        `${metrics.timestamp},${metrics.rollout.percentage},${metrics.rollout.usersInRollout},${metrics.performance.legacyApiLatencyMs},${metrics.performance.v2ApiLatencyMs},${metrics.reliability.legacySuccessRate},${metrics.reliability.v2SuccessRate},${metrics.errors.legacyErrorCount},${metrics.errors.v2ErrorCount}`
      ].join('\n');
      
      res.send(csv);
    }
  })
);

export default router;