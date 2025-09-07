import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJWT, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { healthCheckScheduler } from '../scheduler/healthCheckScheduler';
import { logger } from '../config/logger';

const router = Router();

// Aplicar autenticação e permissões de admin para todas as rotas
router.use(authenticateJWT);
router.use(requirePermission('admin:scheduler'));

/**
 * GET /api/scheduler/status
 * Obter status do scheduler de health checks
 */
router.get('/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Scheduler status request received', { userId });

  try {
    const status = healthCheckScheduler.getStatus();
    
    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Failed to get scheduler status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve scheduler status',
      code: 'SCHEDULER_STATUS_ERROR'
    });
  }
}));

/**
 * POST /api/scheduler/start
 * Iniciar o scheduler de health checks
 */
router.post('/start', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Scheduler start request received', { userId });

  try {
    healthCheckScheduler.start();
    
    logger.info('Scheduler started manually', { userId });
    
    res.json({
      success: true,
      message: 'Scheduler started successfully'
    });

  } catch (error) {
    logger.error('Failed to start scheduler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start scheduler',
      code: 'SCHEDULER_START_ERROR'
    });
  }
}));

/**
 * POST /api/scheduler/stop
 * Parar o scheduler de health checks
 */
router.post('/stop', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Scheduler stop request received', { userId });

  try {
    healthCheckScheduler.stop();
    
    logger.info('Scheduler stopped manually', { userId });
    
    res.json({
      success: true,
      message: 'Scheduler stopped successfully'
    });

  } catch (error) {
    logger.error('Failed to stop scheduler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to stop scheduler',
      code: 'SCHEDULER_STOP_ERROR'
    });
  }
}));

/**
 * POST /api/scheduler/restart
 * Reiniciar o scheduler de health checks
 */
router.post('/restart', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Scheduler restart request received', { userId });

  try {
    healthCheckScheduler.restart();
    
    logger.info('Scheduler restarted manually', { userId });
    
    res.json({
      success: true,
      message: 'Scheduler restarted successfully'
    });

  } catch (error) {
    logger.error('Failed to restart scheduler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to restart scheduler',
      code: 'SCHEDULER_RESTART_ERROR'
    });
  }
}));

/**
 * POST /api/scheduler/run-manual-check
 * Executar verificações de saúde manualmente
 */
router.post('/run-manual-check', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Manual health check request received', { userId });

  try {
    // Executar verificações em background
    healthCheckScheduler.runManualHealthCheck().catch(error => {
      logger.error('Background manual health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    });
    
    logger.info('Manual health check initiated', { userId });
    
    res.json({
      success: true,
      message: 'Manual health check initiated successfully'
    });

  } catch (error) {
    logger.error('Failed to initiate manual health check', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to initiate manual health check',
      code: 'MANUAL_HEALTH_CHECK_ERROR'
    });
  }
}));

/**
 * GET /api/scheduler/jobs
 * Listar todos os cron jobs configurados
 */
router.get('/jobs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Scheduler jobs request received', { userId });

  try {
    const status = healthCheckScheduler.getStatus();
    
    // Informações detalhadas sobre cada job
    const jobDetails = [
      {
        name: 'critical-health-check',
        description: 'Verificações críticas de deliverability',
        schedule: '*/5 * * * *',
        frequency: 'A cada 5 minutos',
        enabled: status.isRunning
      },
      {
        name: 'suspicious-activity-check',
        description: 'Detecção de atividade suspeita',
        schedule: '*/15 * * * *',
        frequency: 'A cada 15 minutos',
        enabled: status.isRunning
      },
      {
        name: 'domain-health-check',
        description: 'Verificação de saúde de domínios',
        schedule: '*/30 * * * *',
        frequency: 'A cada 30 minutos',
        enabled: status.isRunning
      },
      {
        name: 'system-performance-check',
        description: 'Verificação de performance do sistema',
        schedule: '0 * * * *',
        frequency: 'A cada hora',
        enabled: status.isRunning
      },
      {
        name: 'complete-health-check',
        description: 'Verificações completas de saúde',
        schedule: '0 */4 * * *',
        frequency: 'A cada 4 horas',
        enabled: status.isRunning
      },
      {
        name: 'audit-log-cleanup',
        description: 'Limpeza de logs de auditoria antigos',
        schedule: '0 2 * * *',
        frequency: 'Diariamente às 02:00',
        enabled: status.isRunning
      },
      {
        name: 'weekly-health-report',
        description: 'Relatório semanal de saúde',
        schedule: '0 8 * * 1',
        frequency: 'Segundas-feiras às 08:00',
        enabled: status.isRunning
      },
      {
        name: 'orphaned-alerts-check',
        description: 'Verificação de alertas órfãos',
        schedule: '0 */6 * * *',
        frequency: 'A cada 6 horas',
        enabled: status.isRunning
      }
    ];
    
    res.json({
      success: true,
      data: {
        schedulerStatus: status,
        jobs: jobDetails,
        totalJobs: jobDetails.length,
        activeJobs: jobDetails.filter(job => job.enabled).length
      }
    });

  } catch (error) {
    logger.error('Failed to get scheduler jobs', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve scheduler jobs',
      code: 'SCHEDULER_JOBS_ERROR'
    });
  }
}));

/**
 * GET /api/scheduler/health
 * Verificar se o scheduler está funcionando corretamente
 */
router.get('/health', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  logger.debug('Scheduler health check request received', { userId });

  try {
    const status = healthCheckScheduler.getStatus();
    const currentTime = new Date();
    
    // Verificar se o scheduler deveria estar rodando
    const expectedToBeRunning = process.env.NODE_ENV !== 'test';
    
    const isHealthy = expectedToBeRunning ? status.isRunning : true;
    
    res.json({
      success: true,
      data: {
        healthy: isHealthy,
        status: status.isRunning ? 'running' : 'stopped',
        expectedToBeRunning,
        currentTime: currentTime.toISOString(),
        jobCount: status.jobs.length,
        runningJobs: status.jobs.filter(job => job.isRunning).length,
        uptime: process.uptime(),
        nodeEnv: process.env.NODE_ENV
      }
    });

  } catch (error) {
    logger.error('Failed to check scheduler health', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to check scheduler health',
      code: 'SCHEDULER_HEALTH_ERROR'
    });
  }
}));

export default router;