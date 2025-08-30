import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { generateSecretKey } from '../utils/crypto';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const webhooks = await db('webhooks').where('user_id', req.user!.id);
  res.json({ webhooks });
}));

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const insertResult = await db('webhooks').insert({
    ...req.body,
    user_id: req.user!.id,
    secret: req.body.secret || generateSecretKey(),
    events: JSON.stringify(req.body.events),
    created_at: new Date()
  });
  
  const webhookId = insertResult[0];
  const webhook = await db('webhooks').where('id', webhookId).first();
  res.status(201).json({ webhook });
}));

export default router;