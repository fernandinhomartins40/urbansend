import { Database } from 'sqlite3';
import { promisify } from 'util';
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
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(database?: Database) {
    this.db = database || new Database('./ultrazend.sqlite');
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
    this.initializeTables();
  }

  private async initializeTables(): Promise<void> {
    try {
      // Tabela de eventos de email
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS email_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email_id TEXT NOT NULL,
          campaign_id TEXT,
          user_id TEXT,
          event_type TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          recipient_email TEXT,
          domain TEXT,
          ip_address TEXT,
          user_agent TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de métricas agregadas por campanha
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS campaign_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id TEXT UNIQUE NOT NULL,
          campaign_name TEXT,
          emails_sent INTEGER DEFAULT 0,
          emails_delivered INTEGER DEFAULT 0,
          emails_opened INTEGER DEFAULT 0,
          emails_clicked INTEGER DEFAULT 0,
          emails_bounced INTEGER DEFAULT 0,
          emails_complained INTEGER DEFAULT 0,
          emails_unsubscribed INTEGER DEFAULT 0,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de métricas por domínio
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS domain_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain TEXT UNIQUE NOT NULL,
          reputation_score REAL DEFAULT 1.0,
          total_emails INTEGER DEFAULT 0,
          successful_deliveries INTEGER DEFAULT 0,
          bounces INTEGER DEFAULT 0,
          complaints INTEGER DEFAULT 0,
          last_delivery DATETIME,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de séries temporais para métricas
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS time_series_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME NOT NULL,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          tags TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de engajamento de usuários
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS user_engagement (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          email_address TEXT NOT NULL,
          total_emails_received INTEGER DEFAULT 0,
          total_opens INTEGER DEFAULT 0,
          total_clicks INTEGER DEFAULT 0,
          last_open DATETIME,
          last_click DATETIME,
          engagement_score REAL DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Índices para performance
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON email_events(email_id)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id ON email_events(campaign_id)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_email_events_timestamp ON email_events(timestamp)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_time_series_timestamp ON time_series_metrics(timestamp)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_domain_metrics_domain ON domain_metrics(domain)`);

      logger.info('AnalyticsService: Tabelas inicializadas com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar tabelas do AnalyticsService:', error);
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
    await this.dbRun(`
      INSERT INTO email_events (
        email_id, campaign_id, user_id, event_type, timestamp,
        recipient_email, domain, ip_address, user_agent, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      emailId,
      campaignId,
      userId,
      eventType,
      timestamp,
      data.recipientEmail,
      data.domain,
      data.ipAddress,
      data.userAgent,
      JSON.stringify(data.metadata || {})
    ]);

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

    await this.dbRun(`
      INSERT INTO campaign_metrics (campaign_id, ${metricColumn})
      VALUES (?, 1)
      ON CONFLICT(campaign_id) DO UPDATE SET
      ${metricColumn} = ${metricColumn} + 1,
      last_updated = CURRENT_TIMESTAMP
    `, [campaignId]);
  }

  private async updateDomainMetricFromEvent(domain: string, eventType: string): Promise<void> {
    switch (eventType) {
      case 'delivered':
        await this.dbRun(`
          INSERT INTO domain_metrics (domain, successful_deliveries, total_emails)
          VALUES (?, 1, 1)
          ON CONFLICT(domain) DO UPDATE SET
          successful_deliveries = successful_deliveries + 1,
          total_emails = total_emails + 1,
          last_delivery = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
        `, [domain]);
        break;
      case 'bounced':
        await this.dbRun(`
          INSERT INTO domain_metrics (domain, bounces, total_emails)
          VALUES (?, 1, 1)
          ON CONFLICT(domain) DO UPDATE SET
          bounces = bounces + 1,
          total_emails = total_emails + 1,
          last_updated = CURRENT_TIMESTAMP
        `, [domain]);
        break;
      case 'complained':
        await this.dbRun(`
          INSERT INTO domain_metrics (domain, complaints, total_emails)
          VALUES (?, 1, 1)
          ON CONFLICT(domain) DO UPDATE SET
          complaints = complaints + 1,
          total_emails = total_emails + 1,
          last_updated = CURRENT_TIMESTAMP
        `, [domain]);
        break;
    }
  }

  private async updateUserEngagementFromEvent(userId: string, email: string, eventType: string): Promise<void> {
    switch (eventType) {
      case 'delivered':
        await this.dbRun(`
          INSERT INTO user_engagement (user_id, email_address, total_emails_received)
          VALUES (?, ?, 1)
          ON CONFLICT(user_id) DO UPDATE SET
          total_emails_received = total_emails_received + 1,
          last_updated = CURRENT_TIMESTAMP
        `, [userId, email]);
        break;
      case 'opened':
        await this.dbRun(`
          INSERT INTO user_engagement (user_id, email_address, total_opens)
          VALUES (?, ?, 1)
          ON CONFLICT(user_id) DO UPDATE SET
          total_opens = total_opens + 1,
          last_open = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
        `, [userId, email]);
        break;
      case 'clicked':
        await this.dbRun(`
          INSERT INTO user_engagement (user_id, email_address, total_clicks)
          VALUES (?, ?, 1)
          ON CONFLICT(user_id) DO UPDATE SET
          total_clicks = total_clicks + 1,
          last_click = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
        `, [userId, email]);
        break;
    }

    // Recalcular engagement score
    await this.recalculateUserEngagementScore(userId);
  }

  private async recalculateUserEngagementScore(userId: string): Promise<void> {
    const user = await this.dbGet(`
      SELECT total_emails_received, total_opens, total_clicks
      FROM user_engagement
      WHERE user_id = ?
    `, [userId]);

    if (!user) return;

    let score = 0;
    if (user.total_emails_received > 0) {
      const openRate = user.total_opens / user.total_emails_received;
      const clickRate = user.total_clicks / user.total_emails_received;
      score = (openRate * 0.6) + (clickRate * 0.4);
    }

    await this.dbRun(`
      UPDATE user_engagement
      SET engagement_score = ?, last_updated = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [score, userId]);
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
    const metrics = await this.dbGet(`
      SELECT 
        campaign_id,
        campaign_name,
        emails_sent,
        emails_delivered,
        emails_opened,
        emails_clicked,
        emails_bounced,
        emails_complained,
        emails_unsubscribed
      FROM campaign_metrics
      WHERE campaign_id = ?
    `, [campaignId]);

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
    const metrics = await this.dbGet(`
      SELECT *
      FROM domain_metrics
      WHERE domain = ?
    `, [domain]);

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
    await this.dbRun(`
      UPDATE domain_metrics
      SET reputation_score = ?, last_updated = CURRENT_TIMESTAMP
      WHERE domain = ?
    `, [reputationScore, domain]);

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
    await this.dbRun(`
      INSERT INTO time_series_metrics (timestamp, metric_name, metric_value, tags)
      VALUES (?, ?, ?, ?)
    `, [
      data.timestamp.toISOString(),
      data.metric,
      data.value,
      JSON.stringify(data.tags)
    ]);
  }

  async getEmailMetrics(timeRange?: { start: Date; end: Date }): Promise<EmailMetrics> {
    let whereClause = '';
    let params: any[] = [];

    if (timeRange) {
      whereClause = 'WHERE timestamp BETWEEN ? AND ?';
      params = [timeRange.start.toISOString(), timeRange.end.toISOString()];
    }

    const metrics = await this.dbGet(`
      SELECT 
        SUM(CASE WHEN event_type = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN event_type = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN event_type = 'bounced' THEN 1 ELSE 0 END) as bounced,
        SUM(CASE WHEN event_type = 'complained' THEN 1 ELSE 0 END) as complaints,
        SUM(CASE WHEN event_type = 'opened' THEN 1 ELSE 0 END) as opens,
        SUM(CASE WHEN event_type = 'clicked' THEN 1 ELSE 0 END) as clicks,
        SUM(CASE WHEN event_type = 'unsubscribed' THEN 1 ELSE 0 END) as unsubscribes
      FROM email_events
      ${whereClause}
    `, params);

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
    const domains = await this.dbAll(`
      SELECT domain, reputation_score, total_emails, successful_deliveries, bounces, complaints
      FROM domain_metrics
      WHERE total_emails > 0
      ORDER BY reputation_score DESC, total_emails DESC
      LIMIT ?
    `, [limit]);

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
    const stats = await this.dbGet(`
      SELECT 
        AVG(engagement_score) as average_engagement,
        COUNT(*) as total_users,
        COUNT(CASE WHEN engagement_score > 0.5 THEN 1 END) as highly_engaged,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users
      FROM user_engagement
    `);

    return {
      averageEngagement: Math.round((stats.average_engagement || 0) * 100) / 100,
      totalUsers: stats.total_users || 0,
      highlyEngaged: stats.highly_engaged || 0,
      activeUsers: stats.active_users || 0,
      engagementRate: stats.total_users > 0 ? Math.round((stats.highly_engaged / stats.total_users) * 100 * 100) / 100 : 0
    };
  }

  async getAnalyticsHealthStatus(): Promise<any> {
    const [eventCount, campaignCount, domainCount, userCount] = await Promise.all([
      this.dbGet('SELECT COUNT(*) as count FROM email_events WHERE timestamp > datetime("now", "-1 day")'),
      this.dbGet('SELECT COUNT(*) as count FROM campaign_metrics'),
      this.dbGet('SELECT COUNT(*) as count FROM domain_metrics'),
      this.dbGet('SELECT COUNT(*) as count FROM user_engagement WHERE is_active = 1')
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
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Erro ao fechar conexão do AnalyticsService:', err);
          reject(err);
        } else {
          logger.info('AnalyticsService: Conexão fechada');
          resolve();
        }
      });
    });
  }
}