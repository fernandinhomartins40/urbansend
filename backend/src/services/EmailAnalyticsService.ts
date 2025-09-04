import db from '../config/database';
// Logger will be added when available
const logger = console;

export interface EmailAnalyticsEvent {
  email_id: string;
  event_type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced';
  recipient_email: string;
  campaign_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
  created_at: Date;
}

export interface DeliveryStats {
  total_emails: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export class EmailAnalyticsService {
  /**
   * Record an email event in the analytics table
   */
  async recordEmailEvent(
    emailId: string, 
    eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced', 
    recipientEmail: string,
    userId: number,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await db('email_analytics').insert({
        user_id: userId,
        email_id: emailId,
        event_type: eventType,
        recipient_email: recipientEmail,
        campaign_id: metadata?.campaign_id || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: new Date(),
        updated_at: new Date()
      });

      logger.info('Email analytics event recorded', {
        emailId,
        eventType,
        recipientEmail,
        userId
      });
    } catch (error) {
      logger.error('Failed to record email analytics event', {
        error,
        emailId,
        eventType,
        recipientEmail,
        userId
      });
      throw error;
    }
  }

  /**
   * Get email statistics for a user within a date range
   */
  async getEmailStats(userId: number, startDate?: Date, endDate?: Date): Promise<DeliveryStats> {
    try {
      const query = db('email_analytics')
        .where('user_id', userId);

      if (startDate) {
        query.where('created_at', '>=', startDate);
      }
      if (endDate) {
        query.where('created_at', '<=', endDate);
      }

      const stats = await query.select(
        db.raw('COUNT(*) as total_emails'),
        db.raw('COUNT(CASE WHEN event_type = "delivered" THEN 1 END) as delivered'),
        db.raw('COUNT(CASE WHEN event_type = "opened" THEN 1 END) as opened'),
        db.raw('COUNT(CASE WHEN event_type = "clicked" THEN 1 END) as clicked'),
        db.raw('COUNT(CASE WHEN event_type = "bounced" THEN 1 END) as bounced')
      ).first();

      const totalEmails = parseInt((stats as any).total_emails) || 0;
      const delivered = parseInt((stats as any).delivered) || 0;
      const opened = parseInt((stats as any).opened) || 0;
      const clicked = parseInt((stats as any).clicked) || 0;
      const bounced = parseInt((stats as any).bounced) || 0;

      return {
        total_emails: totalEmails,
        delivered,
        opened,
        clicked,
        bounced,
        delivery_rate: totalEmails > 0 ? (delivered / totalEmails) * 100 : 0,
        open_rate: delivered > 0 ? (opened / delivered) * 100 : 0,
        click_rate: delivered > 0 ? (clicked / delivered) * 100 : 0,
        bounce_rate: totalEmails > 0 ? (bounced / totalEmails) * 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get email stats', { error, userId, startDate, endDate });
      throw error;
    }
  }

  /**
   * Get recent activities for a user
   */
  async getRecentActivities(userId: number, limit: number = 50): Promise<EmailAnalyticsEvent[]> {
    try {
      const activities = await db('email_analytics')
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .select('*');

      return activities.map(activity => ({
        ...activity,
        metadata: activity.metadata ? JSON.parse(activity.metadata) : null
      }));
    } catch (error) {
      logger.error('Failed to get recent activities', { error, userId, limit });
      throw error;
    }
  }

  /**
   * Get analytics data by event type
   */
  async getAnalyticsByEventType(
    userId: number, 
    eventType: string, 
    startDate?: Date, 
    endDate?: Date
  ): Promise<any[]> {
    try {
      const query = db('email_analytics')
        .where('user_id', userId)
        .where('event_type', eventType);

      if (startDate) {
        query.where('created_at', '>=', startDate);
      }
      if (endDate) {
        query.where('created_at', '<=', endDate);
      }

      const results = await query
        .select('*')
        .orderBy('created_at', 'desc');

      return results.map(result => ({
        ...result,
        metadata: result.metadata ? JSON.parse(result.metadata) : null
      }));
    } catch (error) {
      logger.error('Failed to get analytics by event type', { 
        error, userId, eventType, startDate, endDate 
      });
      throw error;
    }
  }

  /**
   * Get detailed delivery statistics with breakdown
   */
  async getDeliveryStats(userId: number, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const query = db('emails').where('user_id', userId);
      
      if (startDate) query.where('created_at', '>=', startDate);
      if (endDate) query.where('created_at', '<=', endDate);

      const deliveryStats = await query.select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(CASE WHEN status = "sent" THEN 1 END) as sent'),
        db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
        db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced'),
        db.raw('COUNT(CASE WHEN status = "failed" THEN 1 END) as failed')
      ).first() as any;

      const total = deliveryStats.total || 0;
      const sent = deliveryStats.sent || 0;
      const delivered = deliveryStats.delivered || 0;
      const bounced = deliveryStats.bounced || 0;
      const failed = deliveryStats.failed || 0;

      return {
        total,
        sent,
        delivered,
        bounced,
        failed,
        deliveryRate: total > 0 ? Math.round((delivered / total) * 10000) / 100 : 0,
        bounceRate: total > 0 ? Math.round((bounced / total) * 10000) / 100 : 0,
        failureRate: total > 0 ? Math.round((failed / total) * 10000) / 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get delivery stats', { error, userId });
      throw error;
    }
  }

  /**
   * Get campaign metrics (if campaign_id is available)
   */
  async getCampaignMetrics(campaignId: string, userId: number): Promise<any> {
    try {
      const campaignStats = await db('email_analytics')
        .where('user_id', userId)
        .where('campaign_id', campaignId)
        .select(
          db.raw('COUNT(DISTINCT email_id) as emails_sent'),
          db.raw('COUNT(CASE WHEN event_type = "delivered" THEN 1 END) as delivered'),
          db.raw('COUNT(CASE WHEN event_type = "opened" THEN 1 END) as opened'),
          db.raw('COUNT(CASE WHEN event_type = "clicked" THEN 1 END) as clicked'),
          db.raw('COUNT(CASE WHEN event_type = "bounced" THEN 1 END) as bounced')
        ).first() as any;

      const emailsSent = campaignStats.emails_sent || 0;
      const delivered = campaignStats.delivered || 0;
      const opened = campaignStats.opened || 0;
      const clicked = campaignStats.clicked || 0;
      const bounced = campaignStats.bounced || 0;

      return {
        campaignId,
        emailsSent,
        delivered,
        opened,
        clicked,
        bounced,
        deliveryRate: emailsSent > 0 ? Math.round((delivered / emailsSent) * 10000) / 100 : 0,
        openRate: delivered > 0 ? Math.round((opened / delivered) * 10000) / 100 : 0,
        clickRate: opened > 0 ? Math.round((clicked / opened) * 10000) / 100 : 0,
        bounceRate: emailsSent > 0 ? Math.round((bounced / emailsSent) * 10000) / 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get campaign metrics', { error, campaignId, userId });
      throw error;
    }
  }

  /**
   * Get geographic statistics based on IP addresses
   */
  async getGeographicStats(userId: number, limit = 10): Promise<any[]> {
    try {
      const geoStats = await db('email_analytics')
        .where('user_id', userId)
        .whereNotNull('ip_address')
        .select('ip_address')
        .count('* as events')
        .groupBy('ip_address')
        .orderBy('events', 'desc')
        .limit(limit) as any[];

      // In a real implementation, you would resolve IP addresses to geographic locations
      // For now, we'll return IP-based stats with placeholder location data
      return geoStats.map(stat => ({
        ipAddress: stat.ip_address,
        events: stat.events,
        // Placeholder - in production you'd use a geo-IP service
        country: 'Brazil',
        city: 'São Paulo',
        region: 'SP'
      }));
    } catch (error) {
      logger.error('Failed to get geographic stats', { error, userId });
      throw error;
    }
  }

  /**
   * Get engagement trends over time
   */
  async getEngagementTrends(userId: number, days = 30): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const trends = await db('email_analytics')
        .where('user_id', userId)
        .where('created_at', '>=', startDate)
        .select(
          db.raw('DATE(created_at) as date'),
          db.raw('COUNT(CASE WHEN event_type = "delivered" THEN 1 END) as delivered'),
          db.raw('COUNT(CASE WHEN event_type = "opened" THEN 1 END) as opened'),
          db.raw('COUNT(CASE WHEN event_type = "clicked" THEN 1 END) as clicked'),
          db.raw('COUNT(CASE WHEN event_type = "bounced" THEN 1 END) as bounced')
        )
        .groupBy(db.raw('DATE(created_at)'))
        .orderBy('date', 'asc') as any[];

      return trends.map(trend => ({
        date: trend.date,
        delivered: trend.delivered || 0,
        opened: trend.opened || 0,
        clicked: trend.clicked || 0,
        bounced: trend.bounced || 0,
        openRate: trend.delivered > 0 ? Math.round((trend.opened / trend.delivered) * 10000) / 100 : 0,
        clickRate: trend.opened > 0 ? Math.round((trend.clicked / trend.opened) * 10000) / 100 : 0
      }));
    } catch (error) {
      logger.error('Failed to get engagement trends', { error, userId, days });
      throw error;
    }
  }
}