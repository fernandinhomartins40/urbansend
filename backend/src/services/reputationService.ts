import { logger } from '../config/logger';
import db from '../config/database';

export interface ReputationMetrics {
  bounce_rate: number;
  complaint_rate: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  total_sent: number;
  total_delivered: number;
  total_bounced: number;
  total_complained: number;
  total_opened: number;
  total_clicked: number;
}

export interface ReputationStatus {
  status: 'excellent' | 'good' | 'warning' | 'poor' | 'critical';
  score: number; // 0-100
  bounce_rate: number;
  complaint_rate: number;
  delivery_rate: number;
  recommendations: string[];
  alerts: string[];
}

export interface ReputationTrend {
  date: string;
  bounce_rate: number;
  complaint_rate: number;
  delivery_rate: number;
  volume: number;
}

class ReputationService {

  /**
   * Calculate bounce rate for a user within a time period
   */
  async getBounceRate(userId: number, days: number = 7): Promise<number> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const stats = await db('emails')
        .select(
          db.raw('COUNT(*) as total_sent'),
          db.raw('SUM(CASE WHEN status = "bounced" THEN 1 ELSE 0 END) as bounces')
        )
        .where('user_id', userId)
        .where('created_at', '>=', since)
        .first();

      const totalSent = Number((stats as any)?.total_sent) || 0;
      const bounces = Number((stats as any)?.bounces) || 0;

      return totalSent > 0 ? (bounces / totalSent) * 100 : 0;
    } catch (error) {
      logger.error('Failed to calculate bounce rate', { userId, days, error });
      return 0;
    }
  }

  /**
   * Calculate complaint rate for a user within a time period
   */
  async getComplaintRate(userId: number, days: number = 7): Promise<number> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const stats = await db('emails')
        .select(
          db.raw('COUNT(*) as total_sent'),
          db.raw('SUM(CASE WHEN status = "complained" THEN 1 ELSE 0 END) as complaints')
        )
        .where('user_id', userId)
        .where('created_at', '>=', since)
        .first();

      const totalSent = Number((stats as any)?.total_sent) || 0;
      const complaints = Number((stats as any)?.complaints) || 0;

      return totalSent > 0 ? (complaints / totalSent) * 100 : 0;
    } catch (error) {
      logger.error('Failed to calculate complaint rate', { userId, days, error });
      return 0;
    }
  }

  /**
   * Get comprehensive reputation metrics
   */
  async getReputationMetrics(userId: number, days: number = 7): Promise<ReputationMetrics> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      // Get email stats
      const emailStats = await db('emails')
        .select(
          db.raw('COUNT(*) as total_sent'),
          db.raw('SUM(CASE WHEN status = "delivered" THEN 1 ELSE 0 END) as total_delivered'),
          db.raw('SUM(CASE WHEN status = "bounced" THEN 1 ELSE 0 END) as total_bounced'),
          db.raw('SUM(CASE WHEN status = "complained" THEN 1 ELSE 0 END) as total_complained')
        )
        .where('user_id', userId)
        .where('created_at', '>=', since)
        .first();

      // Get engagement stats from analytics
      const engagementStats = await db('email_analytics as ea')
        .join('emails as e', 'ea.email_id', 'e.id')
        .select(
          db.raw('SUM(CASE WHEN ea.event_type = "opened" THEN 1 ELSE 0 END) as total_opened'),
          db.raw('SUM(CASE WHEN ea.event_type = "clicked" THEN 1 ELSE 0 END) as total_clicked')
        )
        .where('e.user_id', userId)
        .where('ea.timestamp', '>=', since)
        .first();

      const totalSent = Number((emailStats as any)?.total_sent) || 0;
      const totalDelivered = Number((emailStats as any)?.total_delivered) || 0;
      const totalBounced = Number((emailStats as any)?.total_bounced) || 0;
      const totalComplained = Number((emailStats as any)?.total_complained) || 0;
      const totalOpened = Number((engagementStats as any)?.total_opened) || 0;
      const totalClicked = Number((engagementStats as any)?.total_clicked) || 0;

      return {
        bounce_rate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
        complaint_rate: totalSent > 0 ? (totalComplained / totalSent) * 100 : 0,
        delivery_rate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
        open_rate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
        click_rate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_bounced: totalBounced,
        total_complained: totalComplained,
        total_opened: totalOpened,
        total_clicked: totalClicked
      };
    } catch (error) {
      logger.error('Failed to get reputation metrics', { userId, days, error });
      throw error;
    }
  }

  /**
   * Check reputation status and provide recommendations
   */
  async checkReputationStatus(userId: number, days: number = 7): Promise<ReputationStatus> {
    try {
      const metrics = await this.getReputationMetrics(userId, days);
      
      const recommendations: string[] = [];
      const alerts: string[] = [];
      let status: ReputationStatus['status'] = 'good';
      let score = 100;

      // Analyze bounce rate
      if (metrics.bounce_rate > 10) {
        status = 'critical';
        score -= 40;
        alerts.push('Taxa de bounce crítica (>10%) - Alto risco de bloqueio');
        recommendations.push('Limpe sua lista de emails imediatamente');
        recommendations.push('Implemente validação de email em tempo real');
        recommendations.push('Considere implementar double opt-in');
      } else if (metrics.bounce_rate > 5) {
        if (status === 'good') status = 'poor';
        score -= 25;
        alerts.push('Taxa de bounce alta (>5%) - Monitore cuidadosamente');
        recommendations.push('Verifique a qualidade das listas de email');
        recommendations.push('Remova emails inválidos da lista');
      } else if (metrics.bounce_rate > 2) {
        if (status === 'good') status = 'warning';
        score -= 10;
        recommendations.push('Monitore a qualidade dos emails');
      }

      // Analyze complaint rate
      if (metrics.complaint_rate > 0.5) {
        status = 'critical';
        score -= 30;
        alerts.push('Taxa de spam crítica (>0.5%) - Risco de blacklist');
        recommendations.push('Revise o conteúdo dos emails');
        recommendations.push('Implemente unsubscribe claro');
        recommendations.push('Segmente melhor sua audiência');
      } else if (metrics.complaint_rate > 0.1) {
        if (status === 'good') status = 'poor';
        score -= 15;
        alerts.push('Taxa de spam elevada (>0.1%)');
        recommendations.push('Melhore o conteúdo dos emails');
        recommendations.push('Facilite o processo de unsubscribe');
      }

      // Analyze delivery rate
      if (metrics.delivery_rate < 85) {
        if (status === 'good') status = 'poor';
        score -= 20;
        alerts.push('Taxa de entrega baixa (<85%)');
        recommendations.push('Verifique configuração DNS (SPF, DKIM, DMARC)');
        recommendations.push('Melhore a reputação do IP');
      } else if (metrics.delivery_rate < 95) {
        if (status === 'good') status = 'warning';
        score -= 5;
        recommendations.push('Monitore a reputação do sender');
      }

      // Analyze engagement (low engagement can hurt reputation)
      if (metrics.open_rate < 15 && metrics.total_sent > 100) {
        score -= 10;
        recommendations.push('Taxa de abertura baixa - Melhore subject lines');
        recommendations.push('Segmente melhor sua audiência');
      }

      if (metrics.click_rate < 2 && metrics.total_opened > 50) {
        score -= 5;
        recommendations.push('Taxa de clique baixa - Melhore o conteúdo dos emails');
      }

      // Volume considerations
      if (metrics.total_sent === 0) {
        status = 'good';
        score = 100;
        recommendations.push('Nenhum email enviado no período');
      }

      // Adjust final status based on score
      if (score >= 90) status = 'excellent';
      else if (score >= 75) status = 'good';
      else if (score >= 50) status = 'warning';
      else if (score >= 25) status = 'poor';
      else status = 'critical';

      // Ensure score is within bounds
      score = Math.max(0, Math.min(100, score));

      return {
        status,
        score,
        bounce_rate: metrics.bounce_rate,
        complaint_rate: metrics.complaint_rate,
        delivery_rate: metrics.delivery_rate,
        recommendations: [...new Set(recommendations)], // Remove duplicates
        alerts: [...new Set(alerts)] // Remove duplicates
      };
    } catch (error) {
      logger.error('Failed to check reputation status', { userId, days, error });
      throw error;
    }
  }

  /**
   * Get reputation trend over time
   */
  async getReputationTrend(userId: number, days: number = 30): Promise<ReputationTrend[]> {
    try {
      const trends: ReputationTrend[] = [];
      const endDate = new Date();
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(endDate);
        date.setDate(date.getDate() - i);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dateStr = date.toISOString().split('T')[0];

        const stats = await db('emails')
          .select(
            db.raw('COUNT(*) as total_sent'),
            db.raw('SUM(CASE WHEN status = "delivered" THEN 1 ELSE 0 END) as delivered'),
            db.raw('SUM(CASE WHEN status = "bounced" THEN 1 ELSE 0 END) as bounced'),
            db.raw('SUM(CASE WHEN status = "complained" THEN 1 ELSE 0 END) as complained')
          )
          .where('user_id', userId)
          .where('created_at', '>=', date)
          .where('created_at', '<', nextDate)
          .first();

        const totalSent = Number((stats as any)?.total_sent) || 0;
        const delivered = Number((stats as any)?.delivered) || 0;
        const bounced = Number((stats as any)?.bounced) || 0;
        const complained = Number((stats as any)?.complained) || 0;

        trends.push({
          date: dateStr,
          bounce_rate: totalSent > 0 ? (bounced / totalSent) * 100 : 0,
          complaint_rate: totalSent > 0 ? (complained / totalSent) * 100 : 0,
          delivery_rate: totalSent > 0 ? (delivered / totalSent) * 100 : 0,
          volume: totalSent
        });
      }

      return trends;
    } catch (error) {
      logger.error('Failed to get reputation trend', { userId, days, error });
      throw error;
    }
  }

  /**
   * Check if user should be throttled based on reputation
   */
  async shouldThrottle(userId: number): Promise<{
    should_throttle: boolean;
    reason?: string;
    suggested_limit?: number;
  }> {
    try {
      const status = await this.checkReputationStatus(userId, 7);

      if (status.status === 'critical') {
        return {
          should_throttle: true,
          reason: 'Critical reputation issues detected',
          suggested_limit: 10 // Max 10 emails per hour
        };
      }

      if (status.status === 'poor') {
        return {
          should_throttle: true,
          reason: 'Poor reputation metrics',
          suggested_limit: 50 // Max 50 emails per hour
        };
      }

      if (status.bounce_rate > 5) {
        return {
          should_throttle: true,
          reason: 'High bounce rate detected',
          suggested_limit: 25 // Max 25 emails per hour
        };
      }

      return { should_throttle: false };
    } catch (error) {
      logger.error('Failed to check throttle status', { userId, error });
      return { should_throttle: false }; // Fail-safe: don't throttle on error
    }
  }

  /**
   * Get global reputation stats (all users)
   */
  async getGlobalReputationStats(): Promise<{
    avg_bounce_rate: number;
    avg_complaint_rate: number;
    avg_delivery_rate: number;
    total_emails_sent: number;
    users_with_issues: number;
  }> {
    try {
      const globalStats = await db('emails')
        .select(
          db.raw('COUNT(*) as total_emails_sent'),
          db.raw('AVG(CASE WHEN status = "bounced" THEN 100 ELSE 0 END) as avg_bounce_rate'),
          db.raw('AVG(CASE WHEN status = "complained" THEN 100 ELSE 0 END) as avg_complaint_rate'),
          db.raw('AVG(CASE WHEN status = "delivered" THEN 100 ELSE 0 END) as avg_delivery_rate')
        )
        .where('created_at', '>=', db.raw('DATE_SUB(NOW(), INTERVAL 7 DAY)'))
        .first();

      // Count users with reputation issues
      const usersWithIssues = await db('users')
        .select('users.id')
        .join('emails', 'users.id', 'emails.user_id')
        .select(
          'users.id',
          db.raw('COUNT(*) as total_sent'),
          db.raw('SUM(CASE WHEN emails.status = "bounced" THEN 1 ELSE 0 END) as bounces')
        )
        .where('emails.created_at', '>=', db.raw('DATE_SUB(NOW(), INTERVAL 7 DAY)'))
        .groupBy('users.id')
        .having(db.raw('(bounces / total_sent) * 100 > 5'));

      return {
        avg_bounce_rate: Number((globalStats as any)?.avg_bounce_rate) || 0,
        avg_complaint_rate: Number((globalStats as any)?.avg_complaint_rate) || 0,
        avg_delivery_rate: Number((globalStats as any)?.avg_delivery_rate) || 0,
        total_emails_sent: Number((globalStats as any)?.total_emails_sent) || 0,
        users_with_issues: usersWithIssues.length
      };
    } catch (error) {
      logger.error('Failed to get global reputation stats', { error });
      throw error;
    }
  }
}

export default ReputationService;