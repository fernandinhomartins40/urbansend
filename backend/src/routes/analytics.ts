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
  const totalEmails = (currentStats as any)?.total_emails || 0;
  const delivered = (currentStats as any)?.delivered || 0;
  const opened = (currentStats as any)?.opened || 0;
  const bounced = (currentStats as any)?.bounced || 0;

  const deliveryRate = totalEmails > 0 ? ((delivered / totalEmails) * 100) : 0;
  const openRate = totalEmails > 0 ? ((opened / totalEmails) * 100) : 0;
  const bounceRate = totalEmails > 0 ? ((bounced / totalEmails) * 100) : 0;

  // Calculate percentage changes
  const prevTotalEmails = (previousStats as any)?.total_emails || 0;
  const prevDelivered = (previousStats as any)?.delivered || 0;
  const prevOpened = (previousStats as any)?.opened || 0;
  const prevBounced = (previousStats as any)?.bounced || 0;

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

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Redireciona para overview por compatibilidade
  const { timeRange = '30d' } = req.query;
  
  let daysAgo = 30;
  if (timeRange === '7d') daysAgo = 7;
  if (timeRange === '90d') daysAgo = 90;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);
  
  const stats = await db('emails')
    .select(
      db.raw('COUNT(*) as total_emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened'),
      db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced'),
      db.raw('COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked')
    )
    .where('user_id', req.user!.id)
    .where('created_at', '>=', startDate)
    .first();

  res.json({ stats });
}));

router.get('/chart', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { timeRange = '30d' } = req.query;
  
  let daysAgo = 30;
  let groupBy = 'DATE(created_at)';
  
  if (timeRange === '7d') {
    daysAgo = 7;
    groupBy = 'DATE(created_at)';
  } else if (timeRange === '90d') {
    daysAgo = 90;
    groupBy = 'DATE(created_at)';
  }
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);
  
  const chartData = await db('emails')
    .select(
      db.raw(`${groupBy} as date`),
      db.raw('COUNT(*) as emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened')
    )
    .where('user_id', req.user!.id)
    .where('created_at', '>=', startDate)
    .groupBy('date')
    .orderBy('date');

  res.json({ chartData });
}));

router.get('/top-emails', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { timeRange = '30d' } = req.query;
  
  let daysAgo = 30;
  if (timeRange === '7d') daysAgo = 7;
  if (timeRange === '90d') daysAgo = 90;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);
  
  const topEmails = await db('emails')
    .select(
      'subject',
      db.raw('COUNT(*) as total_sent'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened'),
      db.raw('COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked')
    )
    .where('user_id', req.user!.id)
    .where('created_at', '>=', startDate)
    .groupBy('subject')
    .orderBy('total_sent', 'desc')
    .limit(10);

  const topEmailsWithRates = topEmails.map(email => ({
    ...email,
    open_rate: (email as any).total_sent > 0 ? 
      Math.round(((email as any).opened / (email as any).total_sent) * 100 * 100) / 100 : 0,
    click_rate: (email as any).total_sent > 0 ? 
      Math.round(((email as any).clicked / (email as any).total_sent) * 100 * 100) / 100 : 0
  }));

  res.json({ topEmails: topEmailsWithRates });
}));

router.get('/emails', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { page = '1', limit = '20', status, search } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  
  let query = db('emails')
    .where('user_id', req.user!.id);
    
  if (status && status !== 'all') {
    query = query.where('status', status as string);
  }
  
  if (search) {
    query = query.where(function() {
      this.where('to_email', 'like', `%${search}%`)
          .orWhere('subject', 'like', `%${search}%`);
    });
  }
  
  const emails = await query
    .select('*')
    .orderBy('created_at', 'desc')
    .limit(parseInt(limit as string))
    .offset(offset);
    
  const total = await query.clone().count('* as count').first();

  res.json({ 
    emails, 
    pagination: {
      total: (total as any)?.count || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    }
  });
}));

router.get('/domains', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domainsStats = await db('emails')
    .select(
      db.raw('SUBSTR(from_email, INSTR(from_email, "@") + 1) as domain'),
      db.raw('COUNT(*) as total_emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened')
    )
    .where('user_id', req.user!.id)
    .groupBy('domain')
    .orderBy('total_emails', 'desc');

  const domainsWithRates = domainsStats.map(domain => ({
    ...domain,
    delivery_rate: (domain as any).total_emails > 0 ? 
      Math.round(((domain as any).delivered / (domain as any).total_emails) * 100 * 100) / 100 : 0,
    open_rate: (domain as any).total_emails > 0 ? 
      Math.round(((domain as any).opened / (domain as any).total_emails) * 100 * 100) / 100 : 0
  }));

  res.json({ domains: domainsWithRates });
}));

export default router;