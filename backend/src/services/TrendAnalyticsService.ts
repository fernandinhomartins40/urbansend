import { Knex } from 'knex';
import db from '../config/database';
import { logger } from '../config/logger';

/**
 * SPRINT 3 - Trend Analytics Service
 * Serviço responsável por fornecer dados de tendências e analytics temporais
 * Implementa gráficos avançados com dados reais do banco
 */
export class TrendAnalyticsService {
  private defaultDateRange: number = 30; // 30 dias por padrão

  constructor() {}

  /**
   * Obter dados de tendência de envios ao longo do tempo
   */
  async getSendsTrendData(userId: number, options: any = {}): Promise<any[]> {
    try {
      const { 
        startDate, 
        endDate, 
        granularity = 'daily',
        domainId = null 
      } = options;

      const { start, end } = this.getDateRange(startDate, endDate);

      logger.info('TrendAnalyticsService: Obtendo dados de tendência de envios', {
        userId,
        dateRange: { start, end },
        granularity,
        domainId
      });

      let query = db('emails')
        .where('emails.user_id', userId)
        .whereBetween('emails.created_at', [start, end]);

      // Filtro opcional por domínio
      if (domainId) {
        query = query
          .join('domains', 'emails.domain_id', 'domains.id')
          .where('domains.id', domainId);
      }

      // Para SQLite, usar strftime ao invés de DATE_FORMAT
      const dateFormat = this.getSQLiteDateFormat(granularity);
      
      const results = await query
        .select(
          db.raw(`strftime('${dateFormat}', emails.created_at) as period`),
          db.raw('COUNT(*) as total_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "sent" THEN 1 END) as sent_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "delivered" THEN 1 END) as delivered_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "bounced" THEN 1 END) as bounced_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "failed" THEN 1 END) as failed_emails')
        )
        .groupBy('period')
        .orderBy('period');

      // Calcular taxas
      const trendsData = results.map((row: any) => ({
        period: row.period,
        date: this.formatPeriodToDate(row.period, granularity),
        total_emails: parseInt(row.total_emails) || 0,
        sent_emails: parseInt(row.sent_emails) || 0,
        delivered_emails: parseInt(row.delivered_emails) || 0,
        bounced_emails: parseInt(row.bounced_emails) || 0,
        failed_emails: parseInt(row.failed_emails) || 0,
        delivery_rate: row.sent_emails > 0 ? 
          Math.round((row.delivered_emails / row.sent_emails) * 100 * 100) / 100 : 0,
        bounce_rate: row.sent_emails > 0 ? 
          Math.round((row.bounced_emails / row.sent_emails) * 100 * 100) / 100 : 0
      }));

      logger.info('TrendAnalyticsService: Dados de tendência obtidos', {
        userId,
        periodsReturned: trendsData.length,
        totalEmails: trendsData.reduce((sum, period) => sum + period.total_emails, 0)
      });

      return trendsData;
    } catch (error) {
      logger.error('TrendAnalyticsService: Erro ao obter dados de tendência', {
        userId,
        options,
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Obter dados de performance por domínio
   */
  async getDomainPerformanceData(userId: number, options: any = {}): Promise<any[]> {
    try {
      const { startDate, endDate } = options;
      const { start, end } = this.getDateRange(startDate, endDate);

      logger.info('TrendAnalyticsService: Obtendo dados de performance por domínio', {
        userId,
        dateRange: { start, end }
      });

      const results = await db('emails')
        .leftJoin('domains', 'emails.domain_id', 'domains.id')
        .where('emails.user_id', userId)
        .whereBetween('emails.created_at', [start, end])
        .select(
          'domains.domain',
          db.raw('COUNT(*) as total_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "delivered" THEN 1 END) as delivered_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "bounced" THEN 1 END) as bounced_emails'),
          db.raw('COUNT(CASE WHEN emails.status = "failed" THEN 1 END) as failed_emails')
        )
        .groupBy('domains.domain')
        .orderBy('total_emails', 'desc');

      const performanceData = results.map((row: any) => ({
        domain: row.domain || 'Sem domínio',
        total_emails: parseInt(row.total_emails) || 0,
        delivered_emails: parseInt(row.delivered_emails) || 0,
        bounced_emails: parseInt(row.bounced_emails) || 0,
        failed_emails: parseInt(row.failed_emails) || 0,
        delivery_rate: row.total_emails > 0 ? 
          Math.round((row.delivered_emails / row.total_emails) * 100 * 100) / 100 : 0,
        bounce_rate: row.total_emails > 0 ? 
          Math.round((row.bounced_emails / row.total_emails) * 100 * 100) / 100 : 0
      }));

      return performanceData;
    } catch (error) {
      logger.error('TrendAnalyticsService: Erro ao obter dados de performance por domínio', {
        userId,
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Obter dados de engajamento por hora
   */
  async getHourlyEngagementData(userId: number, options: any = {}): Promise<any[]> {
    try {
      const { startDate, endDate } = options;
      const { start, end } = this.getDateRange(startDate, endDate);

      const results = await db('emails')
        .where('user_id', userId)
        .whereBetween('created_at', [start, end])
        .select(
          db.raw("strftime('%H', created_at) as hour"),
          db.raw('COUNT(*) as total_emails'),
          db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered_emails')
        )
        .groupBy('hour')
        .orderBy('hour');

      const hourlyData = Array.from({ length: 24 }, (_, i) => {
        const hourStr = i.toString().padStart(2, '0');
        const found = results.find((row: any) => row.hour === hourStr) as any;
        return {
          hour: i,
          hour_label: `${hourStr}:00`,
          total_emails: found ? parseInt(found.total_emails) : 0,
          delivered_emails: found ? parseInt(found.delivered_emails) : 0,
          delivery_rate: found && found.total_emails > 0 ? 
            Math.round((found.delivered_emails / found.total_emails) * 100) : 0
        };
      });

      return hourlyData;
    } catch (error) {
      logger.error('TrendAnalyticsService: Erro ao obter dados de engajamento por hora', {
        userId,
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Obter dados de engajamento por dia da semana
   */
  async getDayOfWeekEngagementData(userId: number, options: any = {}): Promise<any[]> {
    try {
      const { startDate, endDate } = options;
      const { start, end } = this.getDateRange(startDate, endDate);

      const results = await db('emails')
        .where('user_id', userId)
        .whereBetween('created_at', [start, end])
        .select(
          db.raw("strftime('%w', created_at) as day_of_week"),
          db.raw('COUNT(*) as total_emails'),
          db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered_emails')
        )
        .groupBy('day_of_week')
        .orderBy('day_of_week');

      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      
      const weeklyData = Array.from({ length: 7 }, (_, i) => {
        const found = results.find((row: any) => parseInt(row.day_of_week) === i) as any;
        return {
          day_of_week: i,
          day_name: dayNames[i],
          total_emails: found ? parseInt(found.total_emails) : 0,
          delivered_emails: found ? parseInt(found.delivered_emails) : 0,
          delivery_rate: found && found.total_emails > 0 ? 
            Math.round((found.delivered_emails / found.total_emails) * 100) : 0
        };
      });

      return weeklyData;
    } catch (error) {
      logger.error('TrendAnalyticsService: Erro ao obter dados de engajamento por dia da semana', {
        userId,
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Obter analytics comparativos
   */
  async getComparativeAnalytics(userId: number, options: any = {}): Promise<any> {
    try {
      const { startDate, endDate, comparePeriod = 'previous' } = options;
      const { start, end } = this.getDateRange(startDate, endDate);
      
      // Calcular período de comparação
      const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const compareStart = new Date(start);
      const compareEnd = new Date(end);
      
      if (comparePeriod === 'previous') {
        compareStart.setDate(compareStart.getDate() - periodDays);
        compareEnd.setDate(compareEnd.getDate() - periodDays);
      }

      // Buscar dados do período atual
      const currentData = await this.getPeriodSummary(userId, start, end);
      
      // Buscar dados do período de comparação
      const compareData = await this.getPeriodSummary(userId, compareStart, compareEnd);

      return {
        current: currentData,
        previous: compareData,
        comparison: {
          sent_emails_change: this.calculatePercentageChange(compareData.sent_emails, currentData.sent_emails),
          delivered_emails_change: this.calculatePercentageChange(compareData.delivered_emails, currentData.delivered_emails),
          delivery_rate_change: this.calculatePercentageChange(compareData.delivery_rate, currentData.delivery_rate),
          bounce_rate_change: this.calculatePercentageChange(compareData.bounce_rate, currentData.bounce_rate)
        }
      };
    } catch (error) {
      logger.error('TrendAnalyticsService: Erro ao obter analytics comparativos', {
        userId,
        error: (error as Error).message
      });
      return null;
    }
  }

  // Métodos utilitários privados
  private getDateRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - (this.defaultDateRange * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  private getSQLiteDateFormat(granularity: string): string {
    switch (granularity) {
      case 'hourly':
        return '%Y-%m-%d %H';
      case 'daily':
        return '%Y-%m-%d';
      case 'weekly':
        return '%Y-W%W';
      case 'monthly':
        return '%Y-%m';
      default:
        return '%Y-%m-%d';
    }
  }

  private formatPeriodToDate(period: string, granularity: string): string {
    // Simplificado para SQLite
    return period;
  }

  private async getPeriodSummary(userId: number, start: Date, end: Date): Promise<any> {
    const results = await db('emails')
      .where('user_id', userId)
      .whereBetween('created_at', [start, end])
      .select(
        db.raw('COUNT(*) as total_emails'),
        db.raw('COUNT(CASE WHEN status = "sent" THEN 1 END) as sent_emails'),
        db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered_emails'),
        db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced_emails'),
        db.raw('COUNT(CASE WHEN status = "failed" THEN 1 END) as failed_emails')
      )
      .first() as any;

    const sentEmails = parseInt(results?.sent_emails) || 0;
    const deliveredEmails = parseInt(results?.delivered_emails) || 0;
    const bouncedEmails = parseInt(results?.bounced_emails) || 0;

    return {
      total_emails: parseInt(results?.total_emails) || 0,
      sent_emails: sentEmails,
      delivered_emails: deliveredEmails,
      bounced_emails: bouncedEmails,
      failed_emails: parseInt(results?.failed_emails) || 0,
      delivery_rate: sentEmails > 0 ? Math.round((deliveredEmails / sentEmails) * 100 * 100) / 100 : 0,
      bounce_rate: sentEmails > 0 ? Math.round((bouncedEmails / sentEmails) * 100 * 100) / 100 : 0
    };
  }

  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100 * 100) / 100;
  }
}