import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, sendEmailSchema, paginationSchema, idParamSchema } from '../middleware/validation';
import { authenticateJWT, authenticateApiKey, requirePermission } from '../middleware/auth';
import { advancedEmailRateLimit, advancedBatchRateLimit } from '../middleware/advancedRateLimiting';
import { 
  emailArchitectureMiddleware, 
  emailArchitectureBatchMiddleware,
  emailStatsMiddleware 
} from '../middleware/emailArchitectureMiddleware';
import { queueService } from '../services/queueService';
import { TenantAwareQueueService } from '../services/TenantAwareQueueService';
import { asyncHandler } from '../middleware/errorHandler';
import { emailAuditService } from '../services/EmailAuditService';
import db from '../config/database';
import { logger } from '../config/logger';

// Feature flag para migração gradual para arquitetura unificada
const USE_UNIFIED_QUEUE = process.env.ENABLE_UNIFIED_QUEUE === 'true';

const activeQueueService = USE_UNIFIED_QUEUE 
  ? new TenantAwareQueueService()
  : queueService;

logger.info('Email routes initialized', {
  architecture: USE_UNIFIED_QUEUE ? 'unified' : 'legacy',
  service: USE_UNIFIED_QUEUE ? 'TenantAwareQueueService' : 'queueService'
});

const router = Router();

// Send single email
router.post('/send', 
  authenticateJWT,
  requirePermission('email:send'),
  emailArchitectureMiddleware, // 🆕 Nova arquitetura Fase 2
  advancedEmailRateLimit, // 🆕 Rate limiting avançado Fase 3
  validateRequest({ body: sendEmailSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const emailData = { ...req.body, userId: req.user!.id };
    const job = await activeQueueService.addEmailJob(emailData);
    
    // Atualizar auditoria se email foi processado pelo middleware
    if (req.body._emailId) {
      try {
        await emailAuditService.updateDeliveryStatus(req.body._emailId, 'queued', {
          jobId: job.id,
          queuedAt: new Date(),
          processedBy: 'email-send-api'
        });
      } catch (error) {
        // Log mas não falha o processo principal
        logger.warn('Failed to update audit log for queued email', {
          error: error instanceof Error ? error.message : String(error),
          emailId: req.body._emailId,
          context: 'email-send-audit'
        });
      }
    }
    
    // Incluir informações da nova arquitetura na resposta
    const response: any = {
      message: 'Email queued for delivery',
      job_id: job.id,
      status: 'queued'
    };

    // Adicionar informações de correção se aplicável
    if (req.body._senderCorrected) {
      response.sender_corrected = true;
      response.original_from = req.body._originalFrom;
      response.correction_reason = req.body._correctionReason;
    }
    
    res.status(202).json(response);
  })
);

// Send batch emails
router.post('/send-batch',
  authenticateJWT,
  requirePermission('email:send'),
  emailArchitectureBatchMiddleware, // 🆕 Nova arquitetura Fase 2 para lotes
  advancedBatchRateLimit, // 🆕 Rate limiting avançado para batch Fase 3
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { emails } = req.body;
    const emailsWithUser = emails.map((email: any) => ({
      ...email,
      userId: req.user!.id
    }));
    
    const job = await activeQueueService.addBatchEmailJob(emailsWithUser);
    
    // Atualizar auditoria para todos os emails no batch
    const batchUpdatePromises = emails
      .filter((email: any) => email._emailId)
      .map(async (email: any) => {
        try {
          await emailAuditService.updateDeliveryStatus(email._emailId, 'queued', {
            jobId: job.id,
            queuedAt: new Date(),
            processedBy: 'email-batch-api',
            batchSize: emails.length
          });
        } catch (error) {
          logger.warn('Failed to update audit log for batch email', {
            error: error instanceof Error ? error.message : String(error),
            emailId: email._emailId,
            context: 'email-batch-audit',
            batchSize: emails.length
          });
        }
      });

    // Executar atualizações em paralelo sem bloquear a resposta
    Promise.all(batchUpdatePromises).catch(error => {
      logger.warn('Some batch audit updates failed', {
        error: error instanceof Error ? error.message : String(error),
        context: 'batch-audit-parallel',
        emailCount: emails.length
      });
    });
    
    // Contar quantos emails foram corrigidos
    const correctedCount = emails.filter((email: any) => email._senderCorrected).length;
    
    const response: any = {
      message: 'Batch emails queued for delivery',
      job_id: job.id,
      count: emails.length,
      status: 'queued'
    };

    // Adicionar informações de correção se aplicável
    if (correctedCount > 0) {
      response.sender_corrections = {
        total_corrected: correctedCount,
        correction_rate: (correctedCount / emails.length) * 100
      };
    }
    
    res.status(202).json(response);
  })
);

// Get emails
router.get('/',
  authenticateJWT,
  emailStatsMiddleware, // 🆕 Adicionar estatísticas da nova arquitetura
  validateRequest({ query: paginationSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sort = 'created_at', order } = req.query as any;
    const offset = (page - 1) * limit;

    const emails = await db('emails')
      .select('*')
      .where('user_id', req.user!.id)
      .orderBy(sort, order)
      .limit(limit)
      .offset(offset);

    const total = await db('emails').where('user_id', req.user!.id).count('* as count').first();

    // Get statistics using email_analytics table
    const basicStats = await db('emails')
      .where('user_id', req.user!.id)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN status = "delivered" THEN 1 ELSE 0 END) as delivered')
      ).first();

    // Get analytics stats from email_analytics table  
    const openedCount = await db('email_analytics')
      .join('emails', 'email_analytics.email_id', 'emails.id')
      .where('emails.user_id', req.user!.id)
      .where('email_analytics.event_type', 'open')
      .countDistinct('email_analytics.email_id as count')
      .first();

    const clickedCount = await db('email_analytics')
      .join('emails', 'email_analytics.email_id', 'emails.id')
      .where('emails.user_id', req.user!.id)
      .where('email_analytics.event_type', 'click')
      .countDistinct('email_analytics.email_id as count')
      .first();

    const stats = {
      total: (basicStats as any)?.total || 0,
      delivered: (basicStats as any)?.delivered || 0,
      opened: (openedCount as any)?.count || 0,
      clicked: (clickedCount as any)?.count || 0
    };

    // 🆕 Incluir estatísticas da nova arquitetura se disponíveis
    const response: any = {
      emails,
      stats,
      pagination: {
        page,
        limit,
        total: Number(total?.['count']) || 0,
        pages: Math.ceil((Number(total?.['count']) || 0) / limit)
      }
    };

    // Adicionar estatísticas da nova arquitetura se disponíveis
    if (req.emailStats) {
      response.architecture_stats = {
        phase2_enabled: true,
        delivery_rate: req.emailStats.deliveryRate,
        modification_rate: req.emailStats.modificationRate,
        total_processed: req.emailStats.totalEmails,
        sender_corrections: req.emailStats.modifiedEmails,
        last_30_days: {
          sent: req.emailStats.sentEmails,
          failed: req.emailStats.failedEmails
        }
      };
    }

    res.json(response);
  })
);

// Get email by ID
router.get('/:id',
  authenticateJWT,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const email = await db('emails')
      .where('id', req.params['id'])
      .where('user_id', req.user!.id)
      .first();

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Get analytics
    const analytics = await db('email_analytics')
      .where('email_id', req.params['id'])
      .orderBy('created_at', 'desc');

    return res.json({ email, analytics });
  })
);

// Get email analytics by ID
router.get('/:id/analytics',
  authenticateJWT,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Verify email ownership
    const email = await db('emails')
      .where('id', req.params['id'])
      .where('user_id', req.user!.id)
      .first();

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const analytics = await db('email_analytics')
      .where('email_id', req.params['id'])
      .orderBy('created_at', 'desc');
    
    res.json({ analytics });
  })
);

// Email tracking - Open pixel
router.get('/track/open/:trackingId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { trackingId } = req.params;
    
    // Find email by tracking_id
    const email = await db('emails')
      .where('tracking_id', trackingId)
      .first();

    if (email) {
      // Check if this email was already opened by this user
      const existingOpen = await db('email_analytics')
        .where('email_id', email.id)
        .where('event_type', 'open')
        .where('ip_address', req.ip)
        .first();
      
      if (!existingOpen) {
        // Update status to opened if not already a higher status
        if (!['clicked', 'opened'].includes(email.status)) {
          await db('emails')
            .where('id', email.id)
            .update({ status: 'opened' });
        }
      }

      // Log analytics event
      await db('email_analytics').insert({
        email_id: email.id,
        event_type: 'open',
        tracking_id: trackingId,
        user_agent: req.headers['user-agent'] || '',
        ip_address: req.ip,
        created_at: db.fn.now()
      });
    }

    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(pixel);
  })
);

// Email tracking - Click tracking
router.get('/track/click/:trackingId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { trackingId } = req.params;
    const { url } = req.query;
    
    // Find email by tracking_id
    const email = await db('emails')
      .where('tracking_id', trackingId)
      .first();

    if (email) {
      // Check if this email was already clicked by this user
      const existingClick = await db('email_analytics')
        .where('email_id', email.id)
        .where('event_type', 'click')
        .where('ip_address', req.ip)
        .first();
      
      if (!existingClick) {
        // Update status to clicked (highest engagement level)
        await db('emails')
          .where('id', email.id)
          .update({ status: 'clicked' });
      }

      // Log analytics event
      await db('email_analytics').insert({
        email_id: email.id,
        event_type: 'click',
        tracking_id: trackingId,
        link_url: url as string,
        user_agent: req.headers['user-agent'] || '',
        ip_address: req.ip,
        created_at: db.fn.now()
      });
    }

    // Redirect to original URL
    if (url) {
      res.redirect(url as string);
    } else {
      res.status(400).json({ error: 'URL parameter is required' });
    }
  })
);

export default router;