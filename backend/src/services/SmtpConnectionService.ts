import db from '../config/database';
import { logger } from '../config/logger';

export interface ConnectionStats {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  uniqueHosts: number;
  connectionsByType: { [key: string]: number };
  successRate: number;
  averageConnectionTime?: number;
}

export interface ActiveConnection {
  id: number;
  remote_address: string;
  hostname: string;
  server_type: string;
  status: string;
  connected_at: Date;
  duration?: number;
}

export interface ConnectionEvent {
  remoteAddress: string;
  hostname: string;
  serverType: 'smtp' | 'imap' | 'pop3';
  status: 'connected' | 'disconnected' | 'failed' | 'timeout';
  metadata?: any;
}

export class SmtpConnectionService {
  /**
   * Record an SMTP connection event
   */
  async recordConnection(
    remoteAddress: string, 
    hostname: string, 
    serverType: string, 
    status: string,
    metadata?: any
  ): Promise<void> {
    try {
      await db('smtp_connections').insert({
        remote_address: remoteAddress,
        hostname,
        server_type: serverType,
        status,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: new Date(),
        updated_at: new Date()
      });

      logger.info('SMTP connection recorded', {
        remoteAddress,
        hostname,
        serverType,
        status
      });
    } catch (error) {
      logger.error('Failed to record SMTP connection', {
        error,
        remoteAddress,
        hostname,
        serverType,
        status
      });
      throw error;
    }
  }

  /**
   * Get connection statistics for a given timeframe
   */
  async getConnectionStats(timeframe: string = '24h'): Promise<ConnectionStats> {
    try {
      const timeframeDates = this.parseTimeframe(timeframe);
      
      const basicStats = await db('smtp_connections')
        .where('created_at', '>=', timeframeDates.startDate)
        .where('created_at', '<=', timeframeDates.endDate)
        .select(
          db.raw('COUNT(*) as total'),
          db.raw("COUNT(CASE WHEN status = 'connected' THEN 1 END) as successful"),
          db.raw("COUNT(CASE WHEN status IN ('failed', 'timeout') THEN 1 END) as failed"),
          db.raw('COUNT(DISTINCT remote_address) as unique_hosts')
        )
        .first() as any;

      // Get connections by server type
      const connectionsByType = await db('smtp_connections')
        .where('created_at', '>=', timeframeDates.startDate)
        .where('created_at', '<=', timeframeDates.endDate)
        .select('server_type')
        .count('* as count')
        .groupBy('server_type') as any[];

      const typeStats: { [key: string]: number } = {};
      connectionsByType.forEach(stat => {
        typeStats[stat.server_type] = stat.count;
      });

      const total = basicStats?.total || 0;
      const successful = basicStats?.successful || 0;
      const failed = basicStats?.failed || 0;

      return {
        totalConnections: total,
        successfulConnections: successful,
        failedConnections: failed,
        uniqueHosts: basicStats?.unique_hosts || 0,
        connectionsByType: typeStats,
        successRate: total > 0 ? Math.round((successful / total) * 10000) / 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get connection stats', { error, timeframe });
      throw error;
    }
  }

  /**
   * Get currently active connections (mock implementation)
   * Note: In a real implementation, this would track active sessions
   */
  async getActiveConnections(): Promise<ActiveConnection[]> {
    try {
      // For now, return recent successful connections as "active"
      // In a real implementation, this would track actual active sessions
      const recentConnections = await db('smtp_connections')
        .where('status', 'connected')
        .where('created_at', '>=', new Date(Date.now() - 5 * 60 * 1000)) // Last 5 minutes
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(50) as any[];

      return recentConnections.map((conn: any) => ({
        id: conn.id,
        remote_address: conn.remote_address,
        hostname: conn.hostname,
        server_type: conn.server_type,
        status: conn.status,
        connected_at: conn.created_at,
        duration: Math.floor((Date.now() - new Date(conn.created_at).getTime()) / 1000)
      }));
    } catch (error) {
      logger.error('Failed to get active connections', { error });
      throw error;
    }
  }

  /**
   * Get connection trends over time
   */
  async getConnectionTrends(days: number = 7): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const trends = await db('smtp_connections')
        .where('created_at', '>=', startDate)
        .select(
          db.raw('DATE(created_at) as date'),
          db.raw('COUNT(*) as total_connections'),
          db.raw("COUNT(CASE WHEN status = 'connected' THEN 1 END) as successful"),
          db.raw("COUNT(CASE WHEN status IN ('failed', 'timeout') THEN 1 END) as failed"),
          db.raw('COUNT(DISTINCT remote_address) as unique_hosts')
        )
        .groupBy(db.raw('DATE(created_at)'))
        .orderBy('date', 'asc') as any[];

      return trends.map(trend => ({
        date: trend.date,
        totalConnections: trend.total_connections || 0,
        successful: trend.successful || 0,
        failed: trend.failed || 0,
        uniqueHosts: trend.unique_hosts || 0,
        successRate: trend.total_connections > 0 
          ? Math.round((trend.successful / trend.total_connections) * 10000) / 100 
          : 0
      }));
    } catch (error) {
      logger.error('Failed to get connection trends', { error, days });
      throw error;
    }
  }

  /**
   * Get top connecting hosts
   */
  async getTopHosts(limit: number = 10, timeframe: string = '24h'): Promise<any[]> {
    try {
      const timeframeDates = this.parseTimeframe(timeframe);

      const topHosts = await db('smtp_connections')
        .where('created_at', '>=', timeframeDates.startDate)
        .where('created_at', '<=', timeframeDates.endDate)
        .select('remote_address', 'hostname')
        .count('* as connection_count')
        .sum(db.raw("CASE WHEN status = 'connected' THEN 1 ELSE 0 END as successful_count"))
        .groupBy('remote_address', 'hostname')
        .orderBy('connection_count', 'desc')
        .limit(limit) as any[];

      return topHosts.map(host => ({
        remoteAddress: host.remote_address,
        hostname: host.hostname,
        totalConnections: host.connection_count,
        successfulConnections: host.successful_count || 0,
        successRate: host.connection_count > 0 
          ? Math.round(((host.successful_count || 0) / host.connection_count) * 10000) / 100
          : 0
      }));
    } catch (error) {
      logger.error('Failed to get top hosts', { error, limit, timeframe });
      throw error;
    }
  }

  /**
   * Parse timeframe string to date range
   */
  private parseTimeframe(timeframe: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    const timeframeRegex = /^(\d+)([hmd])$/;
    const match = timeframe.match(timeframeRegex);

    if (!match) {
      // Default to 24 hours
      startDate.setHours(startDate.getHours() - 24);
      return { startDate, endDate };
    }

    const [, amount, unit] = match;
    const value = parseInt(amount, 10);

    switch (unit) {
      case 'h':
        startDate.setHours(startDate.getHours() - value);
        break;
      case 'd':
        startDate.setDate(startDate.getDate() - value);
        break;
      case 'm':
        startDate.setMonth(startDate.getMonth() - value);
        break;
      default:
        startDate.setHours(startDate.getHours() - 24);
    }

    return { startDate, endDate };
  }
}

// Export singleton instance
export const smtpConnectionService = new SmtpConnectionService();