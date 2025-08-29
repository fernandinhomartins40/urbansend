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
  
  const previousMonth = new Date();
  previousMonth.setDate(previousMonth.getDate() - 60);
  previousMonth.setDate(previousMonth.getDate() + 30); // Start of previous 30-day period
  
  // Current period stats
  const currentStats = await db('emails')
    .select(
      db.raw('COUNT(*) as total_emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened'),
      db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced'),
      db.raw('COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked')
    )
    .where('user_id', req.user!.id)
    .where('created_at', '>=', thirtyDaysAgo)
    .first();

  // Previous period stats for comparison
  const previousStats = await db('emails')
    .select(
      db.raw('COUNT(*) as total_emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened'),
      db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced')
    )
    .where('user_id', req.user!.id)
    .where('created_at', '>=', previousMonth)
    .where('created_at', '<', thirtyDaysAgo)
    .first();

  // Calculate percentages and changes
  const totalEmails = currentStats.total_emails || 0;
  const delivered = currentStats.delivered || 0;
  const opened = currentStats.opened || 0;
  const bounced = currentStats.bounced || 0;

  const deliveryRate = totalEmails > 0 ? ((delivered / totalEmails) * 100) : 0;
  const openRate = totalEmails > 0 ? ((opened / totalEmails) * 100) : 0;
  const bounceRate = totalEmails > 0 ? ((bounced / totalEmails) * 100) : 0;

  // Calculate percentage changes
  const prevTotalEmails = previousStats.total_emails || 0;
  const prevDelivered = previousStats.delivered || 0;
  const prevOpened = previousStats.opened || 0;
  const prevBounced = previousStats.bounced || 0;

  const prevDeliveryRate = prevTotalEmails > 0 ? ((prevDelivered / prevTotalEmails) * 100) : 0;
  const prevOpenRate = prevTotalEmails > 0 ? ((prevOpened / prevTotalEmails) * 100) : 0;
  const prevBounceRate = prevTotalEmails > 0 ? ((prevBounced / prevTotalEmails) * 100) : 0;

  const emailsChange = prevTotalEmails > 0 ? (((totalEmails - prevTotalEmails) / prevTotalEmails) * 100) : 0;
  const deliveryChange = prevDeliveryRate > 0 ? (deliveryRate - prevDeliveryRate) : 0;
  const openChange = prevOpenRate > 0 ? (openRate - prevOpenRate) : 0;
  const bounceChange = prevBounceRate > 0 ? (bounceRate - prevBounceRate) : 0;

  res.json({
    stats: {
      totalEmails,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      openRate: Math.round(openRate * 100) / 100,
      bounceRate: Math.round(bounceRate * 100) / 100,
      emailsChange: Math.round(emailsChange * 100) / 100,
      deliveryChange: Math.round(deliveryChange * 100) / 100,
      openChange: Math.round(openChange * 100) / 100,
      bounceChange: Math.round(bounceChange * 100) / 100
    }
  });
}));

router.get('/recent-activity', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const recentEmails = await db('emails')
    .select('to_email', 'status', 'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'created_at')
    .where('user_id', req.user!.id)
    .orderBy('created_at', 'desc')
    .limit(10);

  const activities = recentEmails.map(email => {
    let status = 'Enviado';
    let timestamp = email.created_at;

    if (email.clicked_at) {
      status = 'Clicado';
      timestamp = email.clicked_at;
    } else if (email.opened_at) {
      status = 'Aberto';
      timestamp = email.opened_at;
    } else if (email.delivered_at) {
      status = 'Entregue';
      timestamp = email.delivered_at;
    } else if (email.status === 'bounced') {
      status = 'Rejeitado';
    } else if (email.status === 'failed') {
      status = 'Falha';
    }

    return {
      email: email.to_email,
      status,
      timestamp: new Date(timestamp)
    };
  });

  res.json({ activities });
}));

export default router;