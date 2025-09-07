import express, { Request, Response } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { domainVerificationInitializer } from '../services/domainVerificationInitializer';
import { domainVerificationLogger } from '../services/DomainVerificationLogger';
import { domainVerificationJob } from '../jobs/domainVerificationJob';
import { logger, Logger } from '../config/logger';

// Simple async handler utility
type AsyncRouteHandler = (req: AuthenticatedRequest, res: Response, next?: Function) => Promise<void>;

const asyncHandler = (fn: AsyncRouteHandler) => 
  (req: AuthenticatedRequest, res: Response, next: Function) => {
    Promise.resolve(fn(req, res, next)).catch((error) => next(error));
  };

// Simple admin auth middleware - check if user has admin privileges
const adminAuth = (req: AuthenticatedRequest, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  // In a real app, you'd check user roles/permissions
  // For now, just allow authenticated users
  next();
};

const router = express.Router();

// Middleware de autenticação para todas as rotas
router.use(authenticateJWT);

/**
 * @swagger
 * /api/domain-monitoring/status:
 *   get:
 *     summary: Get domain verification system status
 *     tags: [Domain Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get('/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const systemStatus = await domainVerificationInitializer.getSystemStatus();
    
    Logger.business('domain_monitoring', 'status_requested', {
      userId: req.user?.id?.toString(),
      metadata: { requestedBy: req.user?.email }
    });
    
    res.json({
      success: true,
      data: systemStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Failed to get domain monitoring status', error as Error, {
      context: { userId: req.user?.id }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /api/domain-monitoring/statistics:
 *   get:
 *     summary: Get domain verification statistics
 *     tags: [Domain Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to include in statistics
 *       - in: query
 *         name: domainId
 *         schema:
 *           type: integer
 *         description: Filter by specific domain ID
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const domainId = req.query.domainId ? parseInt(req.query.domainId as string) : undefined;
    
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await domainVerificationLogger.getVerificationStats({
      domainId,
      userId: req.user?.id,
      dateFrom
    });
    
    Logger.business('domain_monitoring', 'statistics_requested', {
      userId: req.user?.id?.toString(),
      metadata: { days, domainId, statsGenerated: true }
    });
    
    res.json({
      success: true,
      data: {
        ...stats,
        period: {
          days,
          from: dateFrom.toISOString(),
          to: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    Logger.error('Failed to get domain monitoring statistics', error as Error, {
      context: { userId: req.user?.id }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /api/domain-monitoring/logs:
 *   get:
 *     summary: Get recent domain verification logs
 *     tags: [Domain Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: domainId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [verified, failed, partial, pending]
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 */
router.get('/logs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const domainId = req.query.domainId ? parseInt(req.query.domainId as string) : undefined;
    const status = req.query.status as 'verified' | 'failed' | 'partial' | 'pending' | undefined;
    
    const logs = await domainVerificationLogger.getRecentVerificationLogs({
      limit,
      domainId,
      userId: req.user?.id,
      status
    });
    
    Logger.business('domain_monitoring', 'logs_requested', {
      userId: req.user?.id?.toString(),
      metadata: { limit, domainId, status, logsCount: logs.length }
    });
    
    res.json({
      success: true,
      data: logs,
      meta: {
        limit,
        count: logs.length
      }
    });
  } catch (error) {
    Logger.error('Failed to get domain monitoring logs', error as Error, {
      context: { userId: req.user?.id }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get logs',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /api/domain-monitoring/verify:
 *   post:
 *     summary: Trigger manual domain verification
 *     tags: [Domain Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domainId:
 *                 type: integer
 *                 description: Specific domain ID to verify (optional)
 *               batchSize:
 *                 type: integer
 *                 default: 20
 *                 description: Number of domains to verify in batch
 *               retryFailedOnly:
 *                 type: boolean
 *                 default: false
 *                 description: Only retry previously failed verifications
 *     responses:
 *       200:
 *         description: Verification job scheduled successfully
 */
router.post('/verify', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domainId, batchSize, retryFailedOnly } = req.body;
    
    await domainVerificationInitializer.triggerManualVerification({
      domainId,
      batchSize,
      retryFailedOnly,
      userId: req.user?.id
    });
    
    Logger.business('domain_monitoring', 'manual_verification_triggered', {
      userId: req.user?.id?.toString(),
      metadata: { domainId, batchSize, retryFailedOnly }
    });
    
    res.json({
      success: true,
      message: domainId ? 
        `Single domain verification scheduled for domain ID ${domainId}` :
        `Batch verification scheduled for ${batchSize || 20} domains`,
      data: {
        type: domainId ? 'single' : 'batch',
        domainId,
        batchSize: batchSize || 20,
        retryFailedOnly: retryFailedOnly || false,
        triggeredBy: req.user?.email,
        scheduledAt: new Date().toISOString()
      }
    });
  } catch (error) {
    Logger.error('Failed to trigger manual domain verification', error as Error, {
      context: { userId: req.user?.id, body: req.body }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to schedule verification',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /api/domain-monitoring/jobs:
 *   get:
 *     summary: Get domain verification job statistics
 *     tags: [Domain Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job statistics retrieved successfully
 */
router.get('/jobs', adminAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobStats = await domainVerificationJob.getJobStats();
    
    Logger.business('domain_monitoring', 'job_stats_requested', {
      userId: req.user?.id?.toString(),
      metadata: { requestedBy: req.user?.email, isAdmin: true }
    });
    
    res.json({
      success: true,
      data: jobStats
    });
  } catch (error) {
    Logger.error('Failed to get domain verification job stats', error as Error, {
      context: { userId: req.user?.id }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get job statistics',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /api/domain-monitoring/alerts:
 *   get:
 *     summary: Get current system alerts
 *     tags: [Domain Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 */
router.get('/alerts', adminAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alerts = await domainVerificationLogger.checkForRecurringIssues();
    
    Logger.business('domain_monitoring', 'alerts_requested', {
      userId: req.user?.id?.toString(),
      metadata: { 
        requestedBy: req.user?.email,
        alertsCount: alerts.alerts.length,
        hasHighFailureRate: alerts.highFailureRate
      }
    });
    
    res.json({
      success: true,
      data: alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Failed to get domain verification alerts', error as Error, {
      context: { userId: req.user?.id }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /api/domain-monitoring/health:
 *   get:
 *     summary: Health check endpoint for domain verification system
 *     tags: [Domain Monitoring]
 *     responses:
 *       200:
 *         description: System is healthy
 *       503:
 *         description: System has issues
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  try {
    const systemStatus = await domainVerificationInitializer.getSystemStatus();
    const hasIssues = systemStatus.systemHealth?.hasIssues || false;
    
    const healthStatus = {
      status: hasIssues ? 'degraded' : 'healthy',
      initialized: systemStatus.initialized,
      jobsRunning: systemStatus.jobStats?.active > 0,
      recentVerifications: systemStatus.recentStats?.totalAttempts || 0,
      timestamp: new Date().toISOString()
    };
    
    if (hasIssues) {
      res.status(503).json({
        success: false,
        ...healthStatus,
        issues: systemStatus.systemHealth?.issues
      });
    } else {
      res.json({
        success: true,
        ...healthStatus
      });
    }
  } catch (error) {
    logger.error('Domain monitoring health check failed', { error });
    
    res.status(503).json({
      success: false,
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
}));

export default router;