import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';
import { EmailAnalyticsService } from '../services/EmailAnalyticsService';
import { AnalyticsController } from '../controllers/analyticsController';
import { TrendAnalyticsService } from '../services/TrendAnalyticsService';

const router = Router();
router.use(authenticateJWT);

router.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const previousMonth = new Date();
  previousMonth.setDate(previousMonth.getDate() - 60);
  previousMonth.setDate(previousMonth.getDate() + 30); // Start of previous 30-day period
  
  const analyticsService = new EmailAnalyticsService();
  
  // Current period stats using EmailAnalyticsService
  const currentStats = await analyticsService.getEmailStats(req.user!.id, thirtyDaysAgo);
  
  // Previous period stats for comparison
  const previousStats = await analyticsService.getEmailStats(req.user!.id, previousMonth, thirtyDaysAgo);

  // Calculate percentages and changes
  const totalEmails = currentStats.total_emails || 0;
  const delivered = currentStats.delivered || 0;
  const opened = currentStats.opened || 0;
  const bounced = currentStats.bounced || 0;
  const clicked = currentStats.clicked || 0;

  const deliveryRate = currentStats.delivery_rate || 0;
  const openRate = currentStats.open_rate || 0;
  const bounceRate = currentStats.bounce_rate || 0;
  const clickRate = currentStats.click_rate || 0;

  // Calculate percentage changes
  const prevTotalEmails = previousStats.total_emails || 0;
  const prevDelivered = previousStats.delivered || 0;
  const prevOpened = previousStats.opened || 0;
  const prevBounced = previousStats.bounced || 0;

  const prevDeliveryRate = previousStats.delivery_rate || 0;
  const prevOpenRate = previousStats.open_rate || 0;
  const prevBounceRate = previousStats.bounce_rate || 0;

  const emailsChange = prevTotalEmails > 0 ? (((totalEmails - prevTotalEmails) / prevTotalEmails) * 100) : 0;
  const deliveryChange = prevDeliveryRate > 0 ? (deliveryRate - prevDeliveryRate) : 0;
  const openChange = prevOpenRate > 0 ? (openRate - prevOpenRate) : 0;
  const bounceChange = prevBounceRate > 0 ? (bounceRate - prevBounceRate) : 0;

  res.json({
    stats: {
      totalEmails,
      delivered,
      opened,
      clicked,
      bounced,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
      bounceRate: Math.round(bounceRate * 100) / 100,
      emailsChange: Math.round(emailsChange * 100) / 100,
      deliveryChange: Math.round(deliveryChange * 100) / 100,
      openChange: Math.round(openChange * 100) / 100,
      bounceChange: Math.round(bounceChange * 100) / 100
    }
  });
}));

router.get('/recent-activity', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const analyticsService = new EmailAnalyticsService();
  
  // Get recent activities from email_analytics table
  const activities = await analyticsService.getRecentActivities(req.user!.id, 50);
  
  // Also get recent emails for context
  const recentEmails = await db('emails')
    .select('message_id', 'to_email', 'subject', 'status', 'sent_at', 'delivered_at', 'created_at')
    .where('user_id', req.user!.id)
    .orderBy('created_at', 'desc')
    .limit(50);
    
  // Combine analytics events with email data
  const combinedActivities = activities.map(activity => {
    const email = recentEmails.find(e => e.message_id === activity.email_id);
    
    let statusText = 'Enviado';
    switch(activity.event_type) {
      case 'delivered':
        statusText = 'Entregue';
        break;
      case 'opened':
        statusText = 'Aberto';
        break;
      case 'clicked':
        statusText = 'Clicado';
        break;
      case 'bounced':
        statusText = 'Rejeitado';
        break;
      default:
        statusText = 'Enviado';
    }
    
    return {
      email: activity.recipient_email,
      subject: email?.subject || 'Sem assunto',
      status: statusText,
      event_type: activity.event_type,
      timestamp: activity.created_at,
      ip_address: activity.ip_address,
      user_agent: activity.user_agent,
      metadata: activity.metadata
    };
  }).slice(0, 10); // Limit to 10 most recent

  res.json({ activities });
}));

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Redireciona para overview por compatibilidade usando EmailAnalyticsService
  const { timeRange = '30d' } = req.query;
  
  let daysAgo = 30;
  if (timeRange === '7d') daysAgo = 7;
  if (timeRange === '90d') daysAgo = 90;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);
  
  const analyticsService = new EmailAnalyticsService();
  const stats = await analyticsService.getEmailStats(req.user!.id, startDate);

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
  
  // For chart data, we'll use a simplified query until email_analytics has date aggregation
  const chartData = await db('emails')
    .select(
      db.raw(`${groupBy} as date`),
      db.raw('COUNT(*) as emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('0 as opened') // Placeholder until email_analytics integration
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
      db.raw('0 as opened'), // Placeholder until email_analytics integration
      db.raw('0 as clicked') // Placeholder until email_analytics integration
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
  const {
    page = '1',
    limit = '20',
    status,
    search,
    date_filter,
    domain_filter,
    sort = 'created_at',
    order = 'desc'
  } = req.query;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  let query = db('emails')
    .where('user_id', req.user!.id);

  // Status filter
  if (status && status !== 'all') {
    query = query.where('status', status as string);
  }

  // Search filter (email, subject, content)
  if (search && typeof search === 'string' && search.trim() !== '') {
    const searchTerm = search.trim();
    query = query.where(function() {
      this.where('to_email', 'like', `%${searchTerm}%`)
          .orWhere('subject', 'like', `%${searchTerm}%`)
          .orWhere('html_content', 'like', `%${searchTerm}%`)
          .orWhere('text_content', 'like', `%${searchTerm}%`);
    });
  }

  // Date filter
  if (date_filter && date_filter !== 'all') {
    const now = new Date();
    let dateCondition: Date;

    switch (date_filter) {
      case 'today':
        dateCondition = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.where('created_at', '>=', dateCondition.toISOString());
        break;
      case 'week':
        dateCondition = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.where('created_at', '>=', dateCondition.toISOString());
        break;
      case 'month':
        dateCondition = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query = query.where('created_at', '>=', dateCondition.toISOString());
        break;
      case '3months':
        dateCondition = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        query = query.where('created_at', '>=', dateCondition.toISOString());
        break;
    }
  }

  // Domain filter
  if (domain_filter && domain_filter !== 'all') {
    query = query.where('to_email', 'like', `%@${domain_filter}`);
  }

  // Sorting (validate sort field to prevent SQL injection)
  const allowedSortFields = ['created_at', 'sent_at', 'to_email', 'subject', 'status'];
  const allowedOrders = ['asc', 'desc'];

  const sortField = allowedSortFields.includes(sort as string) ? sort as string : 'created_at';
  const sortOrder = allowedOrders.includes(order as string) ? order as string : 'desc';

  // Get emails with proper sorting
  const emails = await query
    .select('*')
    .orderBy(sortField, sortOrder)
    .limit(parseInt(limit as string))
    .offset(offset);

  // Get total count and stats in a single query to avoid conflicts
  const statsQuery = db('emails').where('user_id', req.user!.id);

  // Apply the same filters to stats query
  if (status && status !== 'all') {
    statsQuery.where('status', status as string);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const searchTerm = search.trim();
    statsQuery.where(function() {
      this.where('to_email', 'like', `%${searchTerm}%`)
          .orWhere('subject', 'like', `%${searchTerm}%`)
          .orWhere('html_content', 'like', `%${searchTerm}%`)
          .orWhere('text_content', 'like', `%${searchTerm}%`);
    });
  }

  if (date_filter && date_filter !== 'all') {
    const now = new Date();
    let dateCondition: Date;

    switch (date_filter) {
      case 'today':
        dateCondition = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        statsQuery.where('created_at', '>=', dateCondition.toISOString());
        break;
      case 'week':
        dateCondition = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        statsQuery.where('created_at', '>=', dateCondition.toISOString());
        break;
      case 'month':
        dateCondition = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        statsQuery.where('created_at', '>=', dateCondition.toISOString());
        break;
      case '3months':
        dateCondition = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        statsQuery.where('created_at', '>=', dateCondition.toISOString());
        break;
    }
  }

  if (domain_filter && domain_filter !== 'all') {
    statsQuery.where('to_email', 'like', `%@${domain_filter}`);
  }

  // Get stats using only fields that exist
  const stats = await statsQuery
    .select([
      db.raw('COUNT(*) as total'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('COUNT(CASE WHEN status = "sent" THEN 1 END) as sent'),
      db.raw('COUNT(CASE WHEN status = "opened" THEN 1 END) as opened'),
      db.raw('COUNT(CASE WHEN status = "clicked" THEN 1 END) as clicked'),
      db.raw('COUNT(CASE WHEN status = "bounced" OR bounce_reason IS NOT NULL THEN 1 END) as bounced'),
      db.raw('COUNT(CASE WHEN status = "failed" THEN 1 END) as failed')
    ])
    .first();

  const totalCount = (stats as any)?.total || 0;
  const currentPage = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const totalPages = Math.ceil(totalCount / limitNum);

  res.json({
    data: {
      emails,
      stats: stats || {
        total: 0,
        delivered: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        failed: 0
      },
      pagination: {
        page: currentPage,
        pages: totalPages,
        total: totalCount,
        limit: limitNum,
        has_next: currentPage < totalPages,
        has_prev: currentPage > 1
      }
    }
  });
}));

router.get('/domains', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domainsStats = await db('emails')
    .select(
      db.raw('SUBSTR(from_email, INSTR(from_email, "@") + 1) as domain'),
      db.raw('COUNT(*) as total_emails'),
      db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
      db.raw('0 as opened') // Placeholder until email_analytics integration
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

// ========================================
// FASE 2.1.2 - ENHANCED ANALYTICS ROUTES
// ========================================

// Enhanced overview with trends and comprehensive stats
router.get('/v2/overview', AnalyticsController.getOverview);

// Campaign-specific metrics
router.get('/v2/campaigns/:campaignId/metrics', AnalyticsController.getCampaignMetrics);

// Engagement data with geographic breakdown
router.get('/v2/engagement', AnalyticsController.getEngagementData);

// Detailed delivery statistics
router.get('/v2/delivery-stats', AnalyticsController.getDeliveryStats);

// Analytics by specific event type (opened, clicked, bounced, etc.)
router.get('/v2/events/:eventType', AnalyticsController.getEventAnalytics);

// Enhanced recent activity with better filtering
router.get('/v2/recent-activity', AnalyticsController.getRecentActivity);

export default router;