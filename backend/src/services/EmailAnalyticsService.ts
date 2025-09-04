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
}