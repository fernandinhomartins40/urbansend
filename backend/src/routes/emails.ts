import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, paginationSchema, idParamSchema } from '../middleware/validation';
import { authenticateJWT } from '../middleware/auth';
import { emailStatsMiddleware } from '../middleware/emailArchitectureMiddleware';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';
import { logger } from '../config/logger';

const router = Router();

// DEPRECATED ROUTE - Migrated to V2 with multi-tenancy
router.post('/send', 
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    logger.warn('Legacy email route accessed', {
      userId: req.user!.id,
      deprecationWarning: 'Route /send is deprecated, use /emails-v2/send-v2',
      timestamp: new Date().toISOString()
    });
    
    return res.status(410).json({
      error: 'Route deprecated and removed',
      message: 'This endpoint has been migrated to /api/emails-v2/send-v2 with improved security and multi-tenancy',
      migration: {
        oldEndpoint: '/api/emails/send',
        newEndpoint: '/api/emails-v2/send-v2',
        changes: [
          'Domain ownership verification required',
          'Improved multi-tenant isolation',
          'Enhanced security validation'
        ]
      },
      action: 'Please update your code to use the new endpoint',
      documentation: '/api/docs#emails-v2',
      removedAt: new Date().toISOString()
    });
  })
);

// DEPRECATED ROUTE - Migrated to V2 with multi-tenancy  
router.post('/send-batch',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    logger.warn('Legacy batch email route accessed', {
      userId: req.user!.id,
      batchSize: req.body.emails?.length || 0,
      deprecationWarning: 'Route /send-batch is deprecated, use /emails-v2/send-batch-v2',
      timestamp: new Date().toISOString()
    });
    
    return res.status(410).json({
      error: 'Route deprecated and removed',
      message: 'This batch endpoint has been migrated to /api/emails-v2/send-batch-v2 with improved security and multi-tenancy',
      migration: {
        oldEndpoint: '/api/emails/send-batch',
        newEndpoint: '/api/emails-v2/send-batch-v2',
        changes: [
          'Domain ownership verification required',
          'Improved multi-tenant isolation', 
          'Enhanced batch processing security',
          'Better error handling and audit logs'
        ]
      },
      action: 'Please update your code to use the new batch endpoint',
      documentation: '/api/docs#emails-v2-batch',
      removedAt: new Date().toISOString()
    });
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