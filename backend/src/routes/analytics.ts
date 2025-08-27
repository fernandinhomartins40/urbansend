import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

router.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const stats = await db('emails')
    .select(
      db.raw('COUNT(*) as total_emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened'),
      db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced')
    )
    .where('user_id', req.user!.id)
    .where('created_at', '>=', thirtyDaysAgo)
    .first();

  res.json({ stats });
}));

export default router;