import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domains = await db('domains').where('user_id', req.user!.id);
  res.json({ domains });
}));

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const insertResult = await db('domains').insert({
    ...req.body,
    user_id: req.user!.id,
    created_at: new Date()
  });
  
  const domainId = insertResult[0];
  const domain = await db('domains').where('id', domainId).first();
  res.status(201).json({ domain });
}));

router.post('/:id/verify', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // DNS verification logic would go here
  await db('domains').where('id', req.params['id']).update({
    verification_status: 'verified',
    verified_at: new Date()
  });
  res.json({ message: 'Domain verified' });
}));

export default router;