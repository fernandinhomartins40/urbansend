import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, sendEmailSchema, paginationSchema, idParamSchema } from '../middleware/validation';
import { authenticateJWT, authenticateApiKey, requirePermission } from '../middleware/auth';
import { addEmailJob, addBatchEmailJob } from '../services/queueService';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();

// Send single email
router.post('/send', 
  authenticateApiKey,
  requirePermission('email:send'),
  validateRequest({ body: sendEmailSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const emailData = { ...req.body, userId: req.user!.id, apiKeyId: req.apiKey?.id };
    const job = await addEmailJob(emailData);
    
    res.status(202).json({
      message: 'Email queued for delivery',
      job_id: job.id,
      status: 'queued'
    });
  })
);

// Send batch emails
router.post('/send-batch',
  authenticateApiKey,
  requirePermission('email:send'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { emails } = req.body;
    const emailsWithUser = emails.map((email: any) => ({
      ...email,
      userId: req.user!.id,
      apiKeyId: req.apiKey?.id
    }));
    
    const job = await addBatchEmailJob(emailsWithUser);
    
    res.status(202).json({
      message: 'Batch emails queued for delivery',
      job_id: job.id,
      count: emails.length,
      status: 'queued'
    });
  })
);

// Get emails
router.get('/',
  authenticateJWT,
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

    res.json({
      emails,
      pagination: {
        page,
        limit,
        total: Number(total?.['count']) || 0,
        pages: Math.ceil((Number(total?.['count']) || 0) / limit)
      }
    });
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
      .orderBy('timestamp', 'desc');

    return res.json({ email, analytics });
  })
);

export default router;