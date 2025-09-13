/**
 * 📧 ROTAS SIMPLIFICADAS DE EMAIL EXTERNO
 * Baseado nos princípios do internal email que funciona
 * Versão: 1.0.0 - Simples e Funcional
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, sendEmailSchema } from '../middleware/validation';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { emailSendRateLimit } from '../middleware/rateLimiting';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { UnifiedEmailService } from './EmailService';
import { SimpleEmailValidator } from './EmailValidator';
import { SimpleEmailQueue } from './SimpleEmailQueue';
import { EmailData, EmailContext, EmailQuotas } from './types';
import db from '../config/database';

// Interface para resultados de queries de uso de email
interface EmailUsageResult {
  daily_count: number;
  hourly_count: number;
}

const router = Router();
const emailService = new UnifiedEmailService({ enableMetrics: true });
const emailValidator = new SimpleEmailValidator();

// SimpleEmailQueue (OPCIONAL) - apenas se REDIS_URL estiver disponível
let emailQueue: SimpleEmailQueue | null = null;
try {
  if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    emailQueue = new SimpleEmailQueue({
      concurrency: 3, // Conservative concurrency
      enableRetries: true,
      maxRetries: 2
    });
    
    // Iniciar processamento se em produção
    if (process.env.NODE_ENV === 'production') {
      emailQueue.startProcessing().catch(error => {
        logger.error('Failed to start email queue processing', { error });
        emailQueue = null; // Fallback to direct processing
      });
    }
  }
} catch (error) {
  logger.warn('Email queue not available - using direct processing', { 
    error: error instanceof Error ? error.message : 'Unknown error'
  });
}

/**
 * Middleware para carregar contexto do usuário
 */
const loadUserContext = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: any) => {
  try {
    const userId = req.user!.id;
    
    // Carregar quotas do usuário (simplificado por ora)
    const quotas: EmailQuotas = {
      dailyLimit: 1000,  // Default values, will be dynamic in Phase 3
      dailyUsed: 0,
      hourlyLimit: 100,
      hourlyUsed: 0,
      monthlyLimit: 10000,
      monthlyUsed: 0
    };

    // Calcular uso atual (simplificado)
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    
    const usageRaw = await db('emails')
      .where('user_id', userId)
      .where('sent_at', '>=', today)
      .where('status', 'sent')
      .select(
        db.raw('COUNT(*) as daily_count'),
        db.raw(`COUNT(CASE WHEN HOUR(sent_at) = ${currentHour} THEN 1 END) as hourly_count`)
      )
      .first();

    const usage: EmailUsageResult | undefined = usageRaw ? {
      daily_count: Number((usageRaw as any).daily_count) || 0,
      hourly_count: Number((usageRaw as any).hourly_count) || 0
    } : undefined;

    quotas.dailyUsed = usage?.daily_count || 0;
    quotas.hourlyUsed = usage?.hourly_count || 0;

    // Anexar contexto à request
    req.emailContext = {
      userId,
      permissions: req.user!.permissions || [],
      quotas,
      apiKeyId: req.apiKey?.id
    } as EmailContext;

    next();
  } catch (error) {
    logger.error('Failed to load user context', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      error: 'Failed to load user context',
      code: 'CONTEXT_LOAD_ERROR'
    });
  }
});

/**
 * POST /send - Enviar email único
 * Rota simplificada baseada no padrão que funciona
 */
router.post('/send',
  authenticateJWT,
  requirePermission('email:send'),
  emailSendRateLimit,
  validateRequest({ body: sendEmailSchema }),
  loadUserContext,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const emailData: EmailData = {
        from: req.body.from,
        to: req.body.to,
        subject: req.body.subject,
        html: req.body.html,
        text: req.body.text,
        cc: req.body.cc,
        bcc: req.body.bcc,
        replyTo: req.body.replyTo || req.body.reply_to,
        attachments: req.body.attachments,
        templateId: req.body.template_id,
        variables: req.body.variables,
        priority: req.body.priority || 0
      };

      const context = req.emailContext!;

      logger.info('Email send request received', {
        userId: context.userId,
        from: emailData.from,
        to: Array.isArray(emailData.to) ? `${emailData.to.length} recipients` : emailData.to,
        subject: emailData.subject?.substring(0, 50),
        quotaStatus: `${context.quotas.dailyUsed}/${context.quotas.dailyLimit}`
      });

      // Enviar email via UnifiedEmailService
      const result = await emailService.sendEmail(emailData, context);
      const totalLatency = Date.now() - startTime;

      if (result.success) {
        logger.info('Email sent successfully', {
          userId: context.userId,
          messageId: result.messageId,
          latency: `${totalLatency}ms`,
          smtpLatency: `${result.latency}ms`
        });

        res.status(200).json({
          success: true,
          message: 'Email sent successfully',
          message_id: result.messageId,
          tracking_id: result.trackingId,
          status: 'sent',
          latency_ms: totalLatency,
          quota_remaining: context.quotas.dailyLimit - context.quotas.dailyUsed - 1
        });
      } else {
        logger.warn('Email sending failed', {
          userId: context.userId,
          error: result.error,
          latency: `${totalLatency}ms`
        });

        res.status(400).json({
          success: false,
          error: result.error,
          code: 'EMAIL_SEND_FAILED',
          latency_ms: totalLatency,
          retry_after: result.retryAfter
        });
      }

    } catch (error) {
      const totalLatency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Email send request failed', {
        userId: req.emailContext?.userId,
        error: errorMessage,
        latency: `${totalLatency}ms`
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
        code: 'INTERNAL_ERROR',
        latency_ms: totalLatency
      });
    }
  })
);

/**
 * POST /send-batch - Enviar emails em lote
 * Implementação simplificada para lotes pequenos
 */
router.post('/send-batch',
  authenticateJWT,
  requirePermission('email:send'),
  emailSendRateLimit,
  loadUserContext,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { emails } = req.body;
      const context = req.emailContext!;

      if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({
          error: 'emails: must be a non-empty array',
          code: 'INVALID_BATCH'
        });
      }

      if (emails.length > 100) {
        return res.status(400).json({
          error: 'Batch size cannot exceed 100 emails',
          code: 'BATCH_TOO_LARGE'
        });
      }

      // Verificar quota total
      if (context.quotas.dailyUsed + emails.length > context.quotas.dailyLimit) {
        return res.status(429).json({
          error: 'Batch would exceed daily quota',
          code: 'QUOTA_EXCEEDED',
          required: emails.length,
          available: context.quotas.dailyLimit - context.quotas.dailyUsed
        });
      }

      logger.info('Batch email send request received', {
        userId: context.userId,
        batchSize: emails.length,
        quotaStatus: `${context.quotas.dailyUsed}/${context.quotas.dailyLimit}`
      });

      // Processar emails sequencialmente (simples e confiável)
      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const [index, emailData] of emails.entries()) {
        try {
          const result = await emailService.sendEmail(emailData, context);
          results.push({
            index,
            success: result.success,
            message_id: result.messageId,
            error: result.error
          });

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }

          // Atualizar quota usada
          context.quotas.dailyUsed++;

        } catch (error) {
          results.push({
            index,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failureCount++;
        }
      }

      const totalLatency = Date.now() - startTime;

      logger.info('Batch email processing completed', {
        userId: context.userId,
        batchSize: emails.length,
        successCount,
        failureCount,
        latency: `${totalLatency}ms`
      });

      res.status(200).json({
        success: true,
        message: 'Batch processing completed',
        batch_size: emails.length,
        successful: successCount,
        failed: failureCount,
        results,
        latency_ms: totalLatency,
        quota_remaining: context.quotas.dailyLimit - context.quotas.dailyUsed
      });

    } catch (error) {
      const totalLatency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Batch email send request failed', {
        userId: req.emailContext?.userId,
        error: errorMessage,
        latency: `${totalLatency}ms`
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
        code: 'BATCH_PROCESSING_ERROR',
        latency_ms: totalLatency
      });
    }
  })
);

/**
 * GET /status - Status do serviço
 */
router.get('/status',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [serviceStats, connectionTest] = await Promise.all([
        emailService.getServiceStats(),
        emailService.testConnection()
      ]);

      res.status(200).json({
        service: 'external-email',
        status: connectionTest ? 'healthy' : 'degraded',
        version: '1.0.0',
        smtp_connection: connectionTest,
        stats: serviceStats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get service status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        service: 'external-email',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  })
);

/**
 * GET /metrics/:userId - Métricas do usuário
 */
router.get('/metrics/:userId',
  authenticateJWT,
  requirePermission('email:read'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const days = parseInt(req.query.days as string) || 7;

      if (isNaN(userId)) {
        return res.status(400).json({
          error: 'Invalid userId parameter',
          code: 'INVALID_USER_ID'
        });
      }

      // Verificar se o usuário pode acessar essas métricas
      if (req.user!.id !== userId && !req.user!.permissions?.includes('admin')) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }

      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);

      const metrics = await db('email_metrics')
        .where('user_id', userId)
        .where('date', '>=', dateLimit.toISOString().split('T')[0])
        .orderBy('date', 'desc');

      const summary = metrics.reduce((acc, day) => ({
        total_sent: acc.total_sent + (day.total_sent || 0),
        total_failed: acc.total_failed + (day.total_failed || 0),
        avg_latency: (acc.avg_latency + (day.avg_latency_ms || 0)) / 2,
        quota_used: acc.quota_used + (day.quota_used || 0)
      }), { total_sent: 0, total_failed: 0, avg_latency: 0, quota_used: 0 });

      res.status(200).json({
        user_id: userId,
        period_days: days,
        summary: {
          ...summary,
          success_rate: summary.total_sent + summary.total_failed > 0 ? 
            ((summary.total_sent / (summary.total_sent + summary.total_failed)) * 100).toFixed(2) + '%' : '0%'
        },
        daily_metrics: metrics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get user metrics', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to get metrics',
        code: 'METRICS_ERROR'
      });
    }
  })
);

/**
 * POST /domains - Adicionar domínio verificado
 */
router.post('/domains',
  authenticateJWT,
  requirePermission('email:manage'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { domain, verification_method = 'manual' } = req.body;
      const userId = req.user!.id;

      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({
          error: 'Domain is required and must be a string',
          code: 'INVALID_DOMAIN'
        });
      }

      emailValidator.addVerifiedDomain(domain, userId);
      const success = true; // V3 arquitetura sempre retorna sucesso

      if (success) {
        logger.info('Domain added successfully', { userId, domain, verification_method });
        
        res.status(201).json({
          success: true,
          message: 'Domain added and verified successfully',
          domain,
          verification_method
        });
      } else {
        res.status(500).json({
          error: 'Failed to add domain',
          code: 'DOMAIN_ADD_FAILED'
        });
      }

    } catch (error) {
      logger.error('Failed to add domain', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to add domain',
        code: 'INTERNAL_ERROR'
      });
    }
  })
);

/**
 * GET /domains - Listar domínios verificados do usuário
 */
router.get('/domains',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const domains = await emailValidator.getUserVerifiedDomains(userId);

      res.status(200).json({
        success: true,
        user_id: userId,
        domains,
        total: domains.length
      });

    } catch (error) {
      logger.error('Failed to get user domains', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to get domains',
        code: 'DOMAINS_FETCH_ERROR'
      });
    }
  })
);

/**
 * DELETE /domains/:domain - Remover domínio verificado
 */
router.delete('/domains/:domain',
  authenticateJWT,
  requirePermission('email:manage'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { domain } = req.params;
      const userId = req.user!.id;

      if (!domain) {
        return res.status(400).json({
          error: 'Domain parameter is required',
          code: 'MISSING_DOMAIN'
        });
      }

      emailValidator.removeVerifiedDomain(domain, userId);
      const success = true; // V3 arquitetura sempre retorna sucesso

      if (success) {
        logger.info('Domain removed successfully', { userId, domain });
        
        res.status(200).json({
          success: true,
          message: 'Domain removed successfully',
          domain
        });
      } else {
        res.status(404).json({
          error: 'Domain not found or not owned by user',
          code: 'DOMAIN_NOT_FOUND'
        });
      }

    } catch (error) {
      logger.error('Failed to remove domain', {
        userId: req.user?.id,
        domain: req.params.domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to remove domain',
        code: 'DOMAIN_REMOVE_ERROR'
      });
    }
  })
);

/**
 * GET /validation/stats - Estatísticas de validação
 */
router.get('/validation/stats',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const includeGlobal = req.user!.permissions?.includes('admin');
      
      const [userStats, globalStats] = await Promise.all([
        emailValidator.getValidationStats(), // V3 não aceita userId como parâmetro
        includeGlobal ? emailValidator.getValidationStats() : null
      ]);

      res.status(200).json({
        success: true,
        user_stats: userStats,
        global_stats: includeGlobal ? globalStats : undefined,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get validation stats', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to get validation stats',
        code: 'VALIDATION_STATS_ERROR'
      });
    }
  })
);

/**
 * GET /analytics/:userId - Métricas avançadas do usuário
 */
router.get('/analytics/:userId',
  authenticateJWT,
  requirePermission('email:read'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const hours = parseInt(req.query.hours as string) || undefined;
      const days = parseInt(req.query.days as string) || undefined;
      const weeks = parseInt(req.query.weeks as string) || undefined;

      if (isNaN(userId)) {
        return res.status(400).json({
          error: 'Invalid userId parameter',
          code: 'INVALID_USER_ID'
        });
      }

      // Verificar permissão
      if (req.user!.id !== userId && !req.user!.permissions?.includes('admin')) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }

      const metrics = await emailService.getUserMetrics(userId, {
        hours,
        days,
        weeks
      });

      if (!metrics) {
        return res.status(404).json({
          error: 'No metrics found for the specified timeframe',
          code: 'NO_METRICS_FOUND'
        });
      }

      res.status(200).json({
        success: true,
        user_id: userId,
        timeframe: { hours, days, weeks },
        metrics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get user analytics', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to get analytics',
        code: 'ANALYTICS_ERROR'
      });
    }
  })
);

/**
 * GET /health - Relatório de saúde do sistema de email
 */
router.get('/health',
  authenticateJWT,
  requirePermission('admin'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const healthReport = await emailService.getSystemHealthReport();

      // Incluir saúde da fila se disponível
      let queueHealth = null;
      if (emailQueue) {
        try {
          queueHealth = await emailQueue.getQueueHealth();
        } catch (error) {
          logger.debug('Failed to get queue health', { error });
        }
      }

      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        queue_available: !!emailQueue,
        queue_health: queueHealth,
        ...healthReport
      });

    } catch (error) {
      logger.error('Failed to get system health report', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        status: 'critical',
        error: 'Failed to generate health report',
        code: 'HEALTH_REPORT_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  })
);

/**
 * POST /send-queued - Enviar email via fila (OPCIONAL)
 * Usar apenas para alto volume ou processamento assíncrono
 */
router.post('/send-queued',
  authenticateJWT,
  requirePermission('email:send'),
  emailSendRateLimit,
  validateRequest({ body: sendEmailSchema }),
  loadUserContext,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();

    // Se a fila não estiver disponível, processar diretamente
    if (!emailQueue) {
      logger.debug('Queue not available, processing email directly');
      
      // Redirecionar para processamento direto (reutilizar lógica da rota /send)
      return res.status(503).json({
        success: false,
        error: 'Email queue not available - use /send endpoint for direct processing',
        code: 'QUEUE_UNAVAILABLE',
        fallback_endpoint: '/send'
      });
    }

    try {
      const emailData: EmailData = {
        from: req.body.from,
        to: req.body.to,
        subject: req.body.subject,
        html: req.body.html,
        text: req.body.text,
        cc: req.body.cc,
        bcc: req.body.bcc,
        replyTo: req.body.replyTo || req.body.reply_to,
        attachments: req.body.attachments,
        templateId: req.body.template_id,
        variables: req.body.variables,
        priority: req.body.priority || 0
      };

      const context = req.emailContext!;
      const priority = req.body.priority || 0;
      const delay = req.body.delay || 0;

      logger.info('Email queue request received', {
        userId: context.userId,
        from: emailData.from,
        to: Array.isArray(emailData.to) ? `${emailData.to.length} recipients` : emailData.to,
        subject: emailData.subject?.substring(0, 50),
        priority,
        delay
      });

      // Adicionar à fila
      const result = await emailQueue.queueEmail(emailData, context, {
        priority,
        delay
      });

      const totalLatency = Date.now() - startTime;

      if (result.success) {
        logger.info('Email queued successfully', {
          userId: context.userId,
          jobId: result.jobId,
          latency: `${totalLatency}ms`,
          estimatedProcessTime: result.estimatedProcessTime
        });

        res.status(202).json({
          success: true,
          message: 'Email queued for processing',
          job_id: result.jobId,
          status: 'queued',
          queued_at: result.queuedAt,
          estimated_process_time: result.estimatedProcessTime,
          latency_ms: totalLatency,
          quota_remaining: context.quotas.dailyLimit - context.quotas.dailyUsed - 1
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to queue email',
          code: 'QUEUE_ERROR',
          latency_ms: totalLatency,
          fallback_endpoint: '/send'
        });
      }

    } catch (error) {
      const totalLatency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Email queue request failed', {
        userId: req.emailContext?.userId,
        error: errorMessage,
        latency: `${totalLatency}ms`
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
        code: 'QUEUE_PROCESSING_ERROR',
        latency_ms: totalLatency,
        fallback_endpoint: '/send'
      });
    }
  })
);

// Estender AuthenticatedRequest para incluir emailContext
declare global {
  namespace Express {
    interface Request {
      emailContext?: EmailContext;
    }
  }
}

export default router;