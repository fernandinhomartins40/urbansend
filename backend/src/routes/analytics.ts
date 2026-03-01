import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';
import { AnalyticsController } from '../controllers/analyticsController';
import { sqlExtractDomain } from '../utils/sqlDialect';

const router = Router();

router.use(authenticateJWT);

const getTimeRangeConfig = (timeRange?: string) => {
  switch (timeRange) {
    case '24h':
      return { days: 1 };
    case '7d':
      return { days: 7 };
    case '90d':
      return { days: 90 };
    case '30d':
    default:
      return { days: 30 };
  }
};

const getDateRange = (timeRange?: string) => {
  const { days } = getTimeRangeConfig(timeRange);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const previousEnd = new Date(startDate);
  const previousStart = new Date(startDate);
  previousStart.setDate(previousStart.getDate() - days);

  return { days, startDate, endDate, previousStart, previousEnd };
};

const applyDateRange = (query: any, column: string, startDate: Date, endDate?: Date) => {
  query.where(column, '>=', startDate);

  if (endDate) {
    query.where(column, '<=', endDate);
  }

  return query;
};

const buildFilteredEmailQuery = (
  userId: number,
  startDate: Date,
  endDate?: Date
) => applyDateRange(db('emails').where('user_id', userId), 'created_at', startDate, endDate);

const buildFilteredAnalyticsQuery = (
  userId: number,
  startDate: Date,
  endDate?: Date
) => {
  const query = db('email_analytics')
    .join('emails', 'email_analytics.email_id', 'emails.id')
    .where('emails.user_id', userId);

  return applyDateRange(query, 'emails.created_at', startDate, endDate);
};

const getOverviewStats = async (userId: number, startDate: Date, endDate?: Date) => {
  const emailQuery = buildFilteredEmailQuery(userId, startDate, endDate);

  const baseCounts = await emailQuery
    .clone()
    .select(
      db.raw('COUNT(*) as total_sent'),
      db.raw(`
        COUNT(
          CASE
            WHEN delivered_at IS NOT NULL
              OR status IN ('sent', 'delivered', 'opened', 'clicked')
            THEN 1
          END
        ) as delivered_count
      `),
      db.raw(`
        COUNT(
          CASE
            WHEN status IN ('bounced', 'failed') OR bounce_reason IS NOT NULL
            THEN 1
          END
        ) as bounced_count
      `),
      db.raw('COUNT(DISTINCT to_email) as unique_recipients')
    )
    .first() as any;

  const openCount = await emailQuery
    .clone()
    .leftJoin('email_analytics', 'email_analytics.email_id', 'emails.id')
    .countDistinct(
      db.raw(`
        CASE
          WHEN emails.opened_at IS NOT NULL
            OR emails.status IN ('opened', 'clicked')
            OR email_analytics.event_type IN ('open', 'opened')
          THEN emails.id
        END
      `)
    )
    .first() as any;

  const clickCount = await emailQuery
    .clone()
    .leftJoin('email_analytics', 'email_analytics.email_id', 'emails.id')
    .countDistinct(
      db.raw(`
        CASE
          WHEN emails.clicked_at IS NOT NULL
            OR emails.status = 'clicked'
            OR email_analytics.event_type IN ('click', 'clicked')
          THEN emails.id
        END
      `)
    )
    .first() as any;

  const totalSent = Number(baseCounts?.total_sent || 0);
  const deliveredCount = Number(baseCounts?.delivered_count || 0);
  const openedCount = Number(Object.values(openCount || {})[0] || 0);
  const clickedCount = Number(Object.values(clickCount || {})[0] || 0);
  const bouncedCount = Number(baseCounts?.bounced_count || 0);
  const uniqueRecipients = Number(baseCounts?.unique_recipients || 0);

  return {
    total_sent: totalSent,
    delivered_count: deliveredCount,
    opened_count: openedCount,
    clicked_count: clickedCount,
    bounced_count: bouncedCount,
    unique_recipients: uniqueRecipients,
    delivery_rate: totalSent > 0 ? (deliveredCount / totalSent) * 100 : 0,
    open_rate: deliveredCount > 0 ? (openedCount / deliveredCount) * 100 : 0,
    click_rate: deliveredCount > 0 ? (clickedCount / deliveredCount) * 100 : 0,
    bounce_rate: totalSent > 0 ? (bouncedCount / totalSent) * 100 : 0
  };
};

const roundMetrics = (stats: ReturnType<typeof getOverviewStats> extends Promise<infer T> ? T : never) => ({
  ...stats,
  delivery_rate: Math.round(stats.delivery_rate * 100) / 100,
  open_rate: Math.round(stats.open_rate * 100) / 100,
  click_rate: Math.round(stats.click_rate * 100) / 100,
  bounce_rate: Math.round(stats.bounce_rate * 100) / 100
});

const calculateChange = (current: number, previous: number) => {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
};

router.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate, previousStart, previousEnd } = getDateRange(String(req.query.period || '30d'));

  const [currentStats, previousStats] = await Promise.all([
    getOverviewStats(req.user!.id, startDate, endDate),
    getOverviewStats(req.user!.id, previousStart, previousEnd)
  ]);

  res.json({
    stats: {
      totalEmails: currentStats.total_sent,
      delivered: currentStats.delivered_count,
      opened: currentStats.opened_count,
      clicked: currentStats.clicked_count,
      bounced: currentStats.bounced_count,
      deliveryRate: Math.round(currentStats.delivery_rate * 100) / 100,
      openRate: Math.round(currentStats.open_rate * 100) / 100,
      clickRate: Math.round(currentStats.click_rate * 100) / 100,
      bounceRate: Math.round(currentStats.bounce_rate * 100) / 100,
      emailsChange: Math.round(calculateChange(currentStats.total_sent, previousStats.total_sent) * 100) / 100,
      deliveryChange: Math.round((currentStats.delivery_rate - previousStats.delivery_rate) * 100) / 100,
      openChange: Math.round((currentStats.open_rate - previousStats.open_rate) * 100) / 100,
      clickChange: Math.round((currentStats.click_rate - previousStats.click_rate) * 100) / 100,
      bounceChange: Math.round((currentStats.bounce_rate - previousStats.bounce_rate) * 100) / 100
    }
  });
}));

router.get('/recent-activity', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const activities = await db('email_analytics')
    .join('emails', 'email_analytics.email_id', 'emails.id')
    .select(
      'emails.id as email_id',
      'emails.to_email',
      'emails.subject',
      'email_analytics.event_type',
      'email_analytics.created_at',
      'email_analytics.ip_address',
      'email_analytics.user_agent',
      'email_analytics.metadata'
    )
    .where('emails.user_id', req.user!.id)
    .orderBy('email_analytics.created_at', 'desc')
    .limit(20);

  const normalizedActivities = activities.map((activity: any) => {
    let status = 'Enviado';

    if (['open', 'opened'].includes(activity.event_type)) {
      status = 'Aberto';
    } else if (['click', 'clicked'].includes(activity.event_type)) {
      status = 'Clicado';
    } else if (['bounce', 'bounced'].includes(activity.event_type)) {
      status = 'Rejeitado';
    } else if (activity.event_type === 'delivered') {
      status = 'Entregue';
    }

    return {
      email: activity.to_email,
      subject: activity.subject || 'Sem assunto',
      status,
      event_type: activity.event_type,
      timestamp: activity.created_at,
      ip_address: activity.ip_address,
      user_agent: activity.user_agent,
      metadata: activity.metadata
    };
  });

  res.json({ activities: normalizedActivities });
}));

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate, previousStart, previousEnd } = getDateRange(String(req.query.timeRange || '30d'));

  const [currentStats, previousStats] = await Promise.all([
    getOverviewStats(req.user!.id, startDate, endDate),
    getOverviewStats(req.user!.id, previousStart, previousEnd)
  ]);

  const rounded = roundMetrics(currentStats);

  res.json({
    total_sent: rounded.total_sent,
    delivered_count: rounded.delivered_count,
    opened_count: rounded.opened_count,
    clicked_count: rounded.clicked_count,
    bounced_count: rounded.bounced_count,
    unique_recipients: rounded.unique_recipients,
    delivery_rate: rounded.delivery_rate,
    open_rate: rounded.open_rate,
    click_rate: rounded.click_rate,
    bounce_rate: rounded.bounce_rate,
    sent_change: Math.round(calculateChange(currentStats.total_sent, previousStats.total_sent) * 100) / 100,
    delivery_change: Math.round((currentStats.delivery_rate - previousStats.delivery_rate) * 100) / 100,
    open_change: Math.round((currentStats.open_rate - previousStats.open_rate) * 100) / 100,
    click_change: Math.round((currentStats.click_rate - previousStats.click_rate) * 100) / 100,
    bounce_change: Math.round((currentStats.bounce_rate - previousStats.bounce_rate) * 100) / 100
  });
}));

router.get('/chart', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = getDateRange(String(req.query.timeRange || '30d'));

  const chart = await db('emails')
    .leftJoin('email_analytics', 'email_analytics.email_id', 'emails.id')
    .select(
      db.raw('DATE(emails.created_at) as date'),
      db.raw('COUNT(DISTINCT emails.id) as sent'),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.delivered_at IS NOT NULL
              OR emails.status IN ('sent', 'delivered', 'opened', 'clicked')
            THEN emails.id
          END
        ) as delivered
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.opened_at IS NOT NULL
              OR emails.status IN ('opened', 'clicked')
              OR email_analytics.event_type IN ('open', 'opened')
            THEN emails.id
          END
        ) as opened
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.clicked_at IS NOT NULL
              OR emails.status = 'clicked'
              OR email_analytics.event_type IN ('click', 'clicked')
            THEN emails.id
          END
        ) as clicked
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status IN ('bounced', 'failed')
              OR emails.bounce_reason IS NOT NULL
              OR email_analytics.event_type IN ('bounce', 'bounced')
            THEN emails.id
          END
        ) as bounced
      `)
    )
    .where('emails.user_id', req.user!.id)
    .where('emails.created_at', '>=', startDate)
    .where('emails.created_at', '<=', endDate)
    .groupBy(db.raw('DATE(emails.created_at)'))
    .orderBy('date', 'asc');

  res.json({
    chart: chart.map((row: any) => ({
      date: row.date,
      sent: Number(row.sent || 0),
      delivered: Number(row.delivered || 0),
      opened: Number(row.opened || 0),
      clicked: Number(row.clicked || 0),
      bounced: Number(row.bounced || 0)
    }))
  });
}));

router.get('/top-emails', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = getDateRange(String(req.query.timeRange || '30d'));

  const emails = await db('emails')
    .leftJoin('email_analytics', 'email_analytics.email_id', 'emails.id')
    .select(
      'emails.subject',
      db.raw('COUNT(DISTINCT emails.id) as sent_count'),
      db.raw('MAX(emails.created_at) as sent_at'),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.opened_at IS NOT NULL
              OR emails.status IN ('opened', 'clicked')
              OR email_analytics.event_type IN ('open', 'opened')
            THEN emails.id
          END
        ) as opened_count
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.clicked_at IS NOT NULL
              OR emails.status = 'clicked'
              OR email_analytics.event_type IN ('click', 'clicked')
            THEN emails.id
          END
        ) as clicked_count
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status IN ('bounced', 'failed')
              OR emails.bounce_reason IS NOT NULL
              OR email_analytics.event_type IN ('bounce', 'bounced')
            THEN emails.id
          END
        ) as bounced_count
      `)
    )
    .where('emails.user_id', req.user!.id)
    .where('emails.created_at', '>=', startDate)
    .where('emails.created_at', '<=', endDate)
    .groupBy('emails.subject')
    .orderBy('sent_count', 'desc')
    .limit(10);

  res.json({
    emails: emails.map((email: any, index: number) => {
      const sentCount = Number(email.sent_count || 0);
      const openedCount = Number(email.opened_count || 0);
      const clickedCount = Number(email.clicked_count || 0);
      const bouncedCount = Number(email.bounced_count || 0);

      return {
        id: index + 1,
        subject: email.subject || 'Sem assunto',
        sent_count: sentCount,
        sent_at: email.sent_at,
        open_rate: sentCount > 0 ? (openedCount / sentCount) * 100 : 0,
        click_rate: sentCount > 0 ? (clickedCount / sentCount) * 100 : 0,
        bounce_rate: sentCount > 0 ? (bouncedCount / sentCount) * 100 : 0
      };
    })
  });
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

  if (status && status !== 'all') {
    query = query.where('status', status as string);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const searchTerm = search.trim();
    query = query.where(function() {
      this.where('to_email', 'like', `%${searchTerm}%`)
        .orWhere('subject', 'like', `%${searchTerm}%`)
        .orWhere('html_content', 'like', `%${searchTerm}%`)
        .orWhere('text_content', 'like', `%${searchTerm}%`);
    });
  }

  if (date_filter && date_filter !== 'all') {
    const now = new Date();
    let dateCondition = new Date(0);

    switch (date_filter) {
      case 'today':
        dateCondition = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        dateCondition = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateCondition = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        dateCondition = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    query = query.where('created_at', '>=', dateCondition.toISOString());
  }

  if (domain_filter && domain_filter !== 'all') {
    query = query.where('to_email', 'like', `%@${domain_filter}`);
  }

  const allowedSortFields = ['created_at', 'sent_at', 'to_email', 'subject', 'status'];
  const allowedOrders = ['asc', 'desc'];
  const sortField = allowedSortFields.includes(sort as string) ? sort as string : 'created_at';
  const sortOrder = allowedOrders.includes(order as string) ? order as string : 'desc';

  const emails = await query
    .select('*')
    .orderBy(sortField, sortOrder)
    .limit(parseInt(limit as string))
    .offset(offset);

  const total = await query.clone().clearSelect().count('* as count').first();

  res.json({
    data: {
      emails,
      pagination: {
        page: parseInt(page as string),
        pages: Math.ceil((Number((total as any)?.count || 0)) / parseInt(limit as string)),
        total: Number((total as any)?.count || 0),
        limit: parseInt(limit as string)
      }
    }
  });
}));

router.get('/domains', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = getDateRange(String(req.query.timeRange || '30d'));

  const domains = await db('emails')
    .leftJoin('email_analytics', 'email_analytics.email_id', 'emails.id')
    .select(
      db.raw(`${sqlExtractDomain('emails.from_email')} as domain`),
      db.raw('COUNT(DISTINCT emails.id) as total_emails'),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.delivered_at IS NOT NULL
              OR emails.status IN ('sent', 'delivered', 'opened', 'clicked')
            THEN emails.id
          END
        ) as delivered
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.opened_at IS NOT NULL
              OR emails.status IN ('opened', 'clicked')
              OR email_analytics.event_type IN ('open', 'opened')
            THEN emails.id
          END
        ) as opened
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.clicked_at IS NOT NULL
              OR emails.status = 'clicked'
              OR email_analytics.event_type IN ('click', 'clicked')
            THEN emails.id
          END
        ) as clicked
      `)
    )
    .where('emails.user_id', req.user!.id)
    .where('emails.created_at', '>=', startDate)
    .where('emails.created_at', '<=', endDate)
    .groupBy(db.raw(sqlExtractDomain('emails.from_email')))
    .orderBy('total_emails', 'desc');

  res.json({
    domains: domains.map((domain: any) => {
      const totalEmails = Number(domain.total_emails || 0);
      const delivered = Number(domain.delivered || 0);
      const opened = Number(domain.opened || 0);
      const clicked = Number(domain.clicked || 0);

      return {
        domain: domain.domain,
        total_emails: totalEmails,
        delivered,
        opened,
        clicked,
        delivery_rate: totalEmails > 0 ? (delivered / totalEmails) * 100 : 0,
        open_rate: delivered > 0 ? (opened / delivered) * 100 : 0,
        click_rate: delivered > 0 ? (clicked / delivered) * 100 : 0
      };
    })
  });
}));

// Enhanced routes mantidas por compatibilidade.
router.get('/v2/overview', AnalyticsController.getOverview);
router.get('/v2/campaigns/:campaignId/metrics', AnalyticsController.getCampaignMetrics);
router.get('/v2/engagement', AnalyticsController.getEngagementData);
router.get('/v2/delivery-stats', AnalyticsController.getDeliveryStats);
router.get('/v2/events/:eventType', AnalyticsController.getEventAnalytics);
router.get('/v2/recent-activity', AnalyticsController.getRecentActivity);

export default router;
