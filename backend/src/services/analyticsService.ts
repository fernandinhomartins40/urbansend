import { Knex } from 'knex';
import db from '../config/database';
import { logger } from '../config/logger';

export interface EmailMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  complaints: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
}

export interface DomainMetrics {
  domain: string;
  reputation: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  totalEmails: number;
}

export interface CampaignMetrics {
  campaignId: string;
  name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
}

export interface AnalyticsJobData {
  type: 'email_event' | 'campaign_summary' | 'domain_reputation' | 'user_engagement';
  eventType?: string;
  emailId?: string;
  campaignId?: string;
  userId?: string;
  domain?: string;
  timestamp: Date;
  data: any;
  metadata?: Record<string, any>;
}

export interface TimeSeriesData {
  timestamp: Date;
  metric: string;
  value: number;
  tags: Record<string, string>;
}

export class AnalyticsService {
  private db: Knex;

  constructor(database?: Knex) {
    this.db = database || db;
    this.validateRequiredTables();
  }

  private async validateRequiredTables(): Promise<void> {
    try {
      const requiredTables = [
        'email_events',
        'campaign_metrics',
        'domain_metrics',
        'time_series_metrics',
        'user_engagement'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await this.db.schema.hasTable(tableName);
        if (!hasTable) {
          throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);
        }
      }

      logger.info('AnalyticsService: Todas as tabelas obrigatórias validadas com sucesso');
    } catch (error) {
      logger.error('Erro ao validar tabelas do AnalyticsService:', error);
      throw error;
    }
  }

  async processAnalyticsJob(jobData: AnalyticsJobData): Promise<any> {
    try {
      logger.info(`Processando job de analytics: ${jobData.type}`, { jobData });

      switch (jobData.type) {
        case 'email_event':
          return await this.processEmailEvent(jobData);
        case 'campaign_summary':
          return await this.updateCampaignMetrics(jobData.campaignId!);
        case 'domain_reputation':
          return await this.updateDomainReputation(jobData.domain!);
        case 'user_engagement':
          return await this.updateUserEngagement(jobData.userId!, jobData.data);
        default:
          throw new Error(`Tipo de job analytics desconhecido: ${jobData.type}`);
      }
    } catch (error) {
      logger.error('Erro ao processar job de analytics:', error);
      throw error;
    }
  }

  private async processEmailEvent(jobData: AnalyticsJobData): Promise<void> {
    const {
      emailId,
      campaignId,
      userId,
      eventType,
      timestamp,
      data
    } = jobData;

    // Registrar evento
    await this.db('email_events').insert({
      email_id: emailId,
      campaign_id: campaignId,
      user_id: userId,
      event_type: eventType,
      timestamp: new Date(timestamp),
      recipient_email: data.recipientEmail,
      domain: data.domain,
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      metadata: JSON.stringify(data.metadata || {})
    });

    // Atualizar métricas em tempo real
    if (campaignId) {
      await this.incrementCampaignMetric(campaignId, eventType!);
    }

    if (data.domain) {
      await this.updateDomainMetricFromEvent(data.domain, eventType!);
    }

    if (userId) {
      await this.updateUserEngagementFromEvent(userId, data.recipientEmail, eventType!);
    }

    // Registrar métrica temporal
    await this.recordTimeSeriesMetric({
      timestamp: new Date(timestamp),
      metric: `email_${eventType}`,
      value: 1,
      tags: {
        campaign: campaignId || 'unknown',
        domain: data.domain || 'unknown'
      }
    });

    logger.info(`Evento de email processado: ${eventType} para ${emailId}`);
  }

  private async incrementCampaignMetric(campaignId: string, eventType: string): Promise<void> {
    const metricColumn = this.getMetricColumnName(eventType);
    if (!metricColumn) return;

    // Knex não tem UPSERT direto no SQLite, então fazemos manualmente
    const existing = await this.db('campaign_metrics')
      .where('campaign_id', campaignId)
      .first();

    if (existing) {
      await this.db('campaign_metrics')
        .where('campaign_id', campaignId)
        .update({
          [metricColumn]: this.db.raw(`${metricColumn} + 1`),
          last_updated: new Date()
        });
    } else {
      await this.db('campaign_metrics')
        .insert({
          campaign_id: campaignId,
          [metricColumn]: 1
        });
    }
  }

  private async updateDomainMetricFromEvent(domain: string, eventType: string): Promise<void> {
    const existing = await this.db('domain_metrics')
      .where('domain', domain)
      .first();

    const updateData = {
      total_emails: this.db.raw('total_emails + 1'),
      last_updated: new Date()
    };

    switch (eventType) {
      case 'delivered':
        Object.assign(updateData, {
          successful_deliveries: this.db.raw('successful_deliveries + 1'),
          last_delivery: new Date()
        });
        break;
      case 'bounced':
        Object.assign(updateData, {
          bounces: this.db.raw('bounces + 1')
        });
        break;
      case 'complained':
        Object.assign(updateData, {
          complaints: this.db.raw('complaints + 1')
        });
        break;
      default:
        return;
    }

    if (existing) {
      await this.db('domain_metrics')
        .where('domain', domain)
        .update(updateData);
    } else {
      const insertData = {
        domain,
        total_emails: 1,
        successful_deliveries: eventType === 'delivered' ? 1 : 0,
        bounces: eventType === 'bounced' ? 1 : 0,
        complaints: eventType === 'complained' ? 1 : 0,
        last_delivery: eventType === 'delivered' ? new Date() : null
      };
      
      await this.db('domain_metrics').insert(insertData);
    }
  }

  private async updateUserEngagementFromEvent(userId: string, email: string, eventType: string): Promise<void> {
    const existing = await this.db('user_engagement')
      .where('user_id', userId)
      .first();

    const baseUpdate = {
      last_updated: new Date()
    };

    let updateData: any = { ...baseUpdate };
    let insertData: any = {
      user_id: userId,
      email_address: email,
      total_emails_received: 0,
      total_opens: 0,
      total_clicks: 0
    };

    switch (eventType) {
      case 'delivered':
        updateData.total_emails_received = this.db.raw('total_emails_received + 1');
        insertData.total_emails_received = 1;
        break;
      case 'opened':
        updateData.total_opens = this.db.raw('total_opens + 1');
        updateData.last_open = new Date();
        insertData.total_opens = 1;
        insertData.last_open = new Date();
        break;
      case 'clicked':
        updateData.total_clicks = this.db.raw('total_clicks + 1');
        updateData.last_click = new Date();
        insertData.total_clicks = 1;
        insertData.last_click = new Date();
        break;
      default:
        return;
    }

    if (existing) {
      await this.db('user_engagement')
        .where('user_id', userId)
        .update(updateData);
    } else {
      await this.db('user_engagement').insert(insertData);
    }

    // Recalcular engagement score
    await this.recalculateUserEngagementScore(userId);
  }

  private async recalculateUserEngagementScore(userId: string): Promise<void> {
    const user = await this.db('user_engagement')
      .select('total_emails_received', 'total_opens', 'total_clicks')
      .where('user_id', userId)
      .first();

    if (!user) return;

    let score = 0;
    if (user.total_emails_received > 0) {
      const openRate = user.total_opens / user.total_emails_received;
      const clickRate = user.total_clicks / user.total_emails_received;
      score = (openRate * 0.6) + (clickRate * 0.4);
    }

    await this.db('user_engagement')
      .where('user_id', userId)
      .update({
        engagement_score: score,
        last_updated: new Date()
      });
  }

  private getMetricColumnName(eventType: string): string | null {
    const mapping: Record<string, string> = {
      'sent': 'emails_sent',
      'delivered': 'emails_delivered',
      'opened': 'emails_opened',
      'clicked': 'emails_clicked',
      'bounced': 'emails_bounced',
      'complained': 'emails_complained',
      'unsubscribed': 'emails_unsubscribed'
    };
    return mapping[eventType] || null;
  }

  async updateCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
    const metrics = await this.db('campaign_metrics')
      .select(
        'campaign_id',
        'campaign_name',
        'emails_sent',
        'emails_delivered',
        'emails_opened',
        'emails_clicked',
        'emails_bounced',
        'emails_complained',
        'emails_unsubscribed'
      )
      .where('campaign_id', campaignId)
      .first();

    if (!metrics) {
      throw new Error(`Campanha não encontrada: ${campaignId}`);
    }

    const deliveryRate = metrics.emails_sent > 0 ? (metrics.emails_delivered / metrics.emails_sent) * 100 : 0;
    const openRate = metrics.emails_delivered > 0 ? (metrics.emails_opened / metrics.emails_delivered) * 100 : 0;
    const clickRate = metrics.emails_delivered > 0 ? (metrics.emails_clicked / metrics.emails_delivered) * 100 : 0;
    const bounceRate = metrics.emails_sent > 0 ? (metrics.emails_bounced / metrics.emails_sent) * 100 : 0;
    const unsubscribeRate = metrics.emails_delivered > 0 ? (metrics.emails_unsubscribed / metrics.emails_delivered) * 100 : 0;

    return {
      campaignId: metrics.campaign_id,
      name: metrics.campaign_name,
      sent: metrics.emails_sent,
      delivered: metrics.emails_delivered,
      opened: metrics.emails_opened,
      clicked: metrics.emails_clicked,
      bounced: metrics.emails_bounced,
      unsubscribed: metrics.emails_unsubscribed,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
      bounceRate: Math.round(bounceRate * 100) / 100,
      unsubscribeRate: Math.round(unsubscribeRate * 100) / 100
    };
  }

  async updateDomainReputation(domain: string): Promise<DomainMetrics> {
    const metrics = await this.db('domain_metrics')
      .where('domain', domain)
      .first();

    if (!metrics) {
      throw new Error(`Domínio não encontrado: ${domain}`);
    }

    const deliveryRate = metrics.total_emails > 0 ? (metrics.successful_deliveries / metrics.total_emails) : 1;
    const bounceRate = metrics.total_emails > 0 ? (metrics.bounces / metrics.total_emails) : 0;
    const complaintRate = metrics.total_emails > 0 ? (metrics.complaints / metrics.total_emails) : 0;

    // Calcular score de reputação (0-1)
    let reputationScore = 1.0;
    reputationScore -= (bounceRate * 0.5);
    reputationScore -= (complaintRate * 0.3);
    reputationScore = Math.max(0, Math.min(1, reputationScore));

    // Atualizar score na base de dados
    await this.db('domain_metrics')
      .where('domain', domain)
      .update({
        reputation_score: reputationScore,
        last_updated: new Date()
      });

    return {
      domain: metrics.domain,
      reputation: Math.round(reputationScore * 100) / 100,
      deliveryRate: Math.round(deliveryRate * 100 * 100) / 100,
      bounceRate: Math.round(bounceRate * 100 * 100) / 100,
      complaintRate: Math.round(complaintRate * 100 * 100) / 100,
      totalEmails: metrics.total_emails
    };
  }

  async updateUserEngagement(userId: string, data: any): Promise<void> {
    await this.recalculateUserEngagementScore(userId);
    logger.info(`Engagement do usuário ${userId} atualizado`);
  }

  async recordTimeSeriesMetric(data: TimeSeriesData): Promise<void> {
    await this.db('time_series_metrics').insert({
      timestamp: data.timestamp,
      metric_name: data.metric,
      metric_value: data.value,
      tags: JSON.stringify(data.tags)
    });
  }

  async getEmailMetrics(timeRange?: { start: Date; end: Date }): Promise<EmailMetrics> {
    let whereClause = '';
    let params: any[] = [];

    if (timeRange) {
      whereClause = 'WHERE timestamp BETWEEN ? AND ?';
      params = [timeRange.start.toISOString(), timeRange.end.toISOString()];
    }

    let query = this.db('email_events');
    
    if (timeRange) {
      query = query.whereBetween('timestamp', [timeRange.start, timeRange.end]);
    }
    
    const metrics: any = await query
      .select(
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as sent', ['sent']),
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as delivered', ['delivered']),
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as bounced', ['bounced']),
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as complaints', ['complained']),
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as opens', ['opened']),
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as clicks', ['clicked']),
        this.db.raw('SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END) as unsubscribes', ['unsubscribed'])
      )
      .first();

    return {
      sent: metrics.sent || 0,
      delivered: metrics.delivered || 0,
      bounced: metrics.bounced || 0,
      complaints: metrics.complaints || 0,
      opens: metrics.opens || 0,
      clicks: metrics.clicks || 0,
      unsubscribes: metrics.unsubscribes || 0
    };
  }

  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
    return await this.updateCampaignMetrics(campaignId);
  }

  async getDomainMetrics(domain: string): Promise<DomainMetrics> {
    return await this.updateDomainReputation(domain);
  }

  async getTopDomains(limit: number = 10): Promise<DomainMetrics[]> {
    const domains = await this.db('domain_metrics')
      .select('domain', 'reputation_score', 'total_emails', 'successful_deliveries', 'bounces', 'complaints')
      .where('total_emails', '>', 0)
      .orderBy('reputation_score', 'desc')
      .orderBy('total_emails', 'desc')
      .limit(limit);

    return domains.map(domain => ({
      domain: domain.domain,
      reputation: Math.round(domain.reputation_score * 100) / 100,
      deliveryRate: Math.round((domain.successful_deliveries / domain.total_emails) * 100 * 100) / 100,
      bounceRate: Math.round((domain.bounces / domain.total_emails) * 100 * 100) / 100,
      complaintRate: Math.round((domain.complaints / domain.total_emails) * 100 * 100) / 100,
      totalEmails: domain.total_emails
    }));
  }

  async getEngagementStats(): Promise<any> {
    const stats: any = await this.db('user_engagement')
      .select(
        this.db.raw('AVG(engagement_score) as average_engagement'),
        this.db.raw('COUNT(*) as total_users'),
        this.db.raw('COUNT(CASE WHEN engagement_score > 0.5 THEN 1 END) as highly_engaged'),
        this.db.raw('COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users')
      )
      .first();

    return {
      averageEngagement: Math.round((stats.average_engagement || 0) * 100) / 100,
      totalUsers: stats.total_users || 0,
      highlyEngaged: stats.highly_engaged || 0,
      activeUsers: stats.active_users || 0,
      engagementRate: stats.total_users > 0 ? Math.round((stats.highly_engaged / stats.total_users) * 100 * 100) / 100 : 0
    };
  }

  async getAnalyticsHealthStatus(): Promise<any> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [eventCount, campaignCount, domainCount, userCount]: any[] = await Promise.all([
      this.db('email_events').count('* as count').where('timestamp', '>', oneDayAgo).first(),
      this.db('campaign_metrics').count('* as count').first(),
      this.db('domain_metrics').count('* as count').first(),
      this.db('user_engagement').count('* as count').where('is_active', true).first()
    ]);

    return {
      status: 'healthy',
      eventsLast24h: eventCount.count,
      totalCampaigns: campaignCount.count,
      totalDomains: domainCount.count,
      activeUsers: userCount.count,
      lastUpdated: new Date().toISOString()
    };
  }

  async close(): Promise<void> {
    try {
      await this.db.destroy();
      logger.info('AnalyticsService: Conexão fechada');
    } catch (error) {
      logger.error('Erro ao fechar conexão do AnalyticsService:', error);
      throw error;
    }
  }
}