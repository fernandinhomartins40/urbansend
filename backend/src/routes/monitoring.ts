import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJWT, requirePermission } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { EmailAuditService } from '../services/EmailAuditService';
import { AlertingService } from '../services/AlertingService';
import { logger } from '../config/logger';
import { z } from 'zod';

const router = Router();

// Aplicar autenticação JWT para todas as rotas
router.use(authenticateJWT);

// Instanciar serviços
const auditService = EmailAuditService.getInstance();
const alertingService = AlertingService.getInstance();

// Schemas de validação
const auditFiltersSchema = z.object({
  startDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
  endDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
  wasModified: z.string().optional().transform(str => str === 'true'),
  deliveryStatus: z.enum(['queued', 'sent', 'failed', 'bounced', 'rejected']).optional(),
  limit: z.string().optional().transform(str => str ? parseInt(str, 10) : undefined)
});

/**
 * GET /api/monitoring/health
 * Obter saúde geral do sistema de email do usuário
 */
router.get('/health', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Email health request received', { userId });

  try {
    const [securityReport, recentLogs, domainStats, systemHealth] = await Promise.all([
      auditService.generateSecurityReport(userId),
      auditService.getAuditLogsForUser(userId, { limit: 10 }),
      auditService.getDomainDeliveryStats(userId),
      alertingService.getSystemHealthMetrics()
    ]);

    res.json({
      success: true,
      data: {
        security: securityReport,
        recentActivity: recentLogs,
        domains: domainStats,
        systemHealth
      }
    });

  } catch (error) {
    logger.error('Failed to get email health data', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve email health data',
      code: 'HEALTH_CHECK_ERROR'
    });
  }
}));

/**
 * GET /api/monitoring/audit-logs
 * Obter logs de auditoria do usuário
 */
router.get('/audit-logs', 
  validateRequest({ query: auditFiltersSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const filters = req.query as z.infer<typeof auditFiltersSchema>;
    
    logger.debug('Audit logs request received', { userId, filters });

    try {
      const logs = await auditService.getAuditLogsForUser(userId, filters);

      res.json({
        success: true,
        data: {
          logs,
          count: logs.length,
          filters: filters
        }
      });

    } catch (error) {
      logger.error('Failed to get audit logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        filters
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit logs',
        code: 'AUDIT_LOGS_ERROR'
      });
    }
  })
);

/**
 * GET /api/monitoring/security-report
 * Gerar relatório de segurança detalhado
 */
router.get('/security-report', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 30;
  
  logger.debug('Security report request received', { userId, days });

  try {
    const report = await auditService.generateSecurityReport(userId, days);

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    logger.error('Failed to generate security report', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      days
    });

    res.status(500).json({
      success: false,
      error: 'Failed to generate security report',
      code: 'SECURITY_REPORT_ERROR'
    });
  }
}));

/**
 * GET /api/monitoring/domain-stats
 * Obter estatísticas de entrega por domínio
 */
router.get('/domain-stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Domain stats request received', { userId });

  try {
    const stats = await auditService.getDomainDeliveryStats(userId);

    res.json({
      success: true,
      data: {
        domains: stats,
        count: stats.length
      }
    });

  } catch (error) {
    logger.error('Failed to get domain stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve domain statistics',
      code: 'DOMAIN_STATS_ERROR'
    });
  }
}));

/**
 * GET /api/monitoring/system-metrics
 * Obter métricas gerais do sistema (apenas admins)
 */
router.get('/system-metrics',
  requirePermission('admin:monitoring'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    
    logger.debug('System metrics request received', { userId });

    try {
      const [systemHealth, domainStats, alerts] = await Promise.all([
        alertingService.getSystemHealthMetrics(),
        auditService.getDomainDeliveryStats(), // Stats globais
        alertingService.getActiveAlerts(20)
      ]);

      res.json({
        success: true,
        data: {
          systemHealth,
          globalDomainStats: domainStats,
          activeAlerts: alerts
        }
      });

    } catch (error) {
      logger.error('Failed to get system metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system metrics',
        code: 'SYSTEM_METRICS_ERROR'
      });
    }
  })
);

/**
 * GET /api/monitoring/alerts
 * Obter alertas do sistema
 */
router.get('/alerts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const limit = parseInt(req.query.limit as string) || 50;
  
  logger.debug('Alerts request received', { userId, limit });

  try {
    const alerts = await alertingService.getActiveAlerts(limit);

    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length
      }
    });

  } catch (error) {
    logger.error('Failed to get alerts', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      limit
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alerts',
      code: 'ALERTS_ERROR'
    });
  }
}));

/**
 * POST /api/monitoring/alerts/:id/resolve
 * Resolver um alerta
 */
router.post('/alerts/:id/resolve', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const alertId = parseInt(req.params.id);
  
  if (isNaN(alertId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid alert ID',
      code: 'INVALID_ALERT_ID'
    });
  }

  logger.debug('Alert resolve request received', { userId, alertId });

  try {
    await alertingService.resolveAlert(alertId, userId);

    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });

  } catch (error) {
    logger.error('Failed to resolve alert', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      alertId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
      code: 'RESOLVE_ALERT_ERROR'
    });
  }
}));

/**
 * POST /api/monitoring/run-health-checks
 * Executar verificações de saúde manuais
 */
router.post('/run-health-checks', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Manual health check request received', { userId });

  try {
    // Executar em background
    alertingService.runHealthChecks().catch(error => {
      logger.error('Background health checks failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });

    res.json({
      success: true,
      message: 'Health checks initiated successfully'
    });

  } catch (error) {
    logger.error('Failed to initiate health checks', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to initiate health checks',
      code: 'HEALTH_CHECKS_ERROR'
    });
  }
}));

/**
 * GET /api/monitoring/delivery-timeline
 * Obter timeline de entregas para gráficos
 */
router.get('/delivery-timeline', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const hours = parseInt(req.query.hours as string) || 24;
  
  logger.debug('Delivery timeline request received', { userId, hours });

  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const timeline = await auditService.getAuditLogsForUser(userId, {
      startDate: startTime,
      limit: 1000
    });

    // Agrupar por hora para gráficos
    const hourlyData = timeline.reduce((acc, log) => {
      const hour = new Date(log.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
      if (!acc[hour]) {
        acc[hour] = { sent: 0, failed: 0, total: 0 };
      }
      
      acc[hour].total++;
      if (log.deliveryStatus === 'sent') {
        acc[hour].sent++;
      } else if (['failed', 'bounced', 'rejected'].includes(log.deliveryStatus)) {
        acc[hour].failed++;
      }
      
      return acc;
    }, {} as Record<string, { sent: number; failed: number; total: number }>);

    const timelineArray = Object.entries(hourlyData).map(([timestamp, data]) => ({
      timestamp,
      ...data
    })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    res.json({
      success: true,
      data: {
        timeline: timelineArray,
        period: `${hours} hours`,
        totalEmails: timeline.length
      }
    });

  } catch (error) {
    logger.error('Failed to get delivery timeline', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      hours
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve delivery timeline',
      code: 'TIMELINE_ERROR'
    });
  }
}));

/**
 * GET /api/monitoring/performance-stats
 * Obter estatísticas de performance do usuário
 */
router.get('/performance-stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 7;
  
  logger.debug('Performance stats request received', { userId, days });

  try {
    const report = await auditService.generateSecurityReport(userId, days);
    const domainStats = await auditService.getDomainDeliveryStats(userId);
    
    // Calcular estatísticas adicionais
    const averageDeliveryRate = domainStats.length > 0 
      ? domainStats.reduce((sum, domain) => sum + domain.deliveryRate, 0) / domainStats.length
      : 0;

    const totalDomains = domainStats.length;
    const activeDomains = domainStats.filter(d => d.totalEmails > 0).length;
    const healthyDomains = domainStats.filter(d => d.deliveryRate >= 95).length;

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        emailMetrics: {
          totalEmails: report.totalEmails,
          deliveryRate: report.deliveryRate,
          modificationRate: report.modificationRate,
          failedEmails: report.failedDeliveries
        },
        domainMetrics: {
          totalDomains,
          activeDomains,
          healthyDomains,
          averageDeliveryRate
        },
        securityMetrics: {
          securityFlags: report.securityFlags.length,
          recommendations: report.recommendations.length
        },
        trends: {
          dailyVolume: Math.round(report.totalEmails / days),
          weeklyGrowth: 0 // Calcular se necessário
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get performance stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      days
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance statistics',
      code: 'PERFORMANCE_STATS_ERROR'
    });
  }
}));

export default router;