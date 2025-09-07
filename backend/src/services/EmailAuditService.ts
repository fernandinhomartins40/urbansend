import db from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface EmailAuditLog {
  id: string;
  userId: number;
  emailId?: string;
  originalFrom: string;
  finalFrom: string;
  wasModified: boolean;
  modificationReason?: string;
  dkimDomain: string;
  deliveryStatus: 'queued' | 'sent' | 'failed' | 'bounced' | 'rejected';
  timestamp: Date;
  metadata?: any;
}

export interface AuditFilters {
  startDate?: Date;
  endDate?: Date;
  wasModified?: boolean;
  deliveryStatus?: string;
  limit?: number;
}

export interface SecurityReport {
  userId: number;
  period: string;
  totalEmails: number;
  modifiedEmails: number;
  modificationRate: number;
  failedDeliveries: number;
  deliveryRate: number;
  securityFlags: SecurityFlag[];
  recommendations: string[];
  generatedAt: Date;
}

export interface SecurityFlag {
  type: 'HIGH_MODIFICATION_RATE' | 'FREQUENT_FAILURES' | 'SUSPICIOUS_DOMAINS' | 'UNUSUAL_PATTERNS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  count: number;
  threshold: number;
}

export interface DomainDeliveryStats {
  domain: string;
  totalEmails: number;
  successfulEmails: number;
  failedEmails: number;
  deliveryRate: number;
  averageProcessingTime: number;
  lastActivity: Date;
}

export class EmailAuditService {
  private static instance: EmailAuditService;

  public static getInstance(): EmailAuditService {
    if (!EmailAuditService.instance) {
      EmailAuditService.instance = new EmailAuditService();
    }
    return EmailAuditService.instance;
  }

  /**
   * Log um evento de email para auditoria
   */
  async logEmailEvent(event: Partial<EmailAuditLog>): Promise<void> {
    try {
      const auditLog: EmailAuditLog = {
        id: this.generateAuditId(),
        timestamp: new Date(),
        deliveryStatus: 'queued',
        wasModified: false,
        ...event
      } as EmailAuditLog;

      // Salvar em tabela de auditoria
      await db('email_audit_logs').insert({
        id: auditLog.id,
        user_id: auditLog.userId,
        email_id: auditLog.emailId,
        original_from: auditLog.originalFrom,
        final_from: auditLog.finalFrom,
        was_modified: auditLog.wasModified,
        modification_reason: auditLog.modificationReason,
        dkim_domain: auditLog.dkimDomain,
        delivery_status: auditLog.deliveryStatus,
        timestamp: auditLog.timestamp,
        metadata: auditLog.metadata ? JSON.stringify(auditLog.metadata) : null
      });

      // Log estruturado para observabilidade
      logger.info('Email audit event logged', {
        auditId: auditLog.id,
        userId: auditLog.userId,
        action: this.determineAction(auditLog),
        security: {
          wasModified: auditLog.wasModified,
          reason: auditLog.modificationReason
        },
        performance: {
          dkimDomain: auditLog.dkimDomain,
          deliveryStatus: auditLog.deliveryStatus
        }
      });

    } catch (error) {
      logger.error('Failed to log email audit event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event
      });
      // Não falhar o processo principal se audit falhar
    }
  }

  /**
   * Atualizar status de entrega de um email
   */
  async updateDeliveryStatus(emailId: string, status: EmailAuditLog['deliveryStatus'], metadata?: any): Promise<void> {
    try {
      await db('email_audit_logs')
        .where('email_id', emailId)
        .update({
          delivery_status: status,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          timestamp: new Date()
        });

      logger.debug('Email delivery status updated', {
        emailId,
        status,
        metadata
      });
    } catch (error) {
      logger.error('Failed to update email delivery status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        emailId,
        status
      });
    }
  }

  /**
   * Obter logs de auditoria para um usuário
   */
  async getAuditLogsForUser(userId: number, filters?: AuditFilters): Promise<EmailAuditLog[]> {
    try {
      let query = db('email_audit_logs')
        .select([
          'id',
          'user_id as userId',
          'email_id as emailId',
          'original_from as originalFrom',
          'final_from as finalFrom',
          'was_modified as wasModified',
          'modification_reason as modificationReason',
          'dkim_domain as dkimDomain',
          'delivery_status as deliveryStatus',
          'timestamp',
          'metadata'
        ])
        .where('user_id', userId);

      if (filters?.startDate) {
        query = query.where('timestamp', '>=', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.where('timestamp', '<=', filters.endDate);
      }

      if (filters?.wasModified !== undefined) {
        query = query.where('was_modified', filters.wasModified);
      }

      if (filters?.deliveryStatus) {
        query = query.where('delivery_status', filters.deliveryStatus);
      }

      const results = await query
        .orderBy('timestamp', 'desc')
        .limit(filters?.limit || 100);

      return results.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null
      }));

    } catch (error) {
      logger.error('Failed to get audit logs for user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        filters
      });
      return [];
    }
  }

  /**
   * Gerar relatório de segurança para um usuário
   */
  async generateSecurityReport(userId: number, days: number = 30): Promise<SecurityReport> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const logs = await this.getAuditLogsForUser(userId, {
        startDate,
        limit: 10000 // Limite alto para análise completa
      });

      const totalEmails = logs.length;
      const modifiedEmails = logs.filter(log => log.wasModified).length;
      const failedDeliveries = logs.filter(log => 
        ['failed', 'bounced', 'rejected'].includes(log.deliveryStatus)
      ).length;

      const deliveryRate = totalEmails > 0 
        ? ((totalEmails - failedDeliveries) / totalEmails) * 100 
        : 100;

      const modificationRate = totalEmails > 0 
        ? (modifiedEmails / totalEmails) * 100 
        : 0;

      const securityFlags = await this.identifySecurityFlags(logs);
      const recommendations = this.generateRecommendations(logs, securityFlags);

      return {
        userId,
        period: `${days} days`,
        totalEmails,
        modifiedEmails,
        modificationRate,
        failedDeliveries,
        deliveryRate,
        securityFlags,
        recommendations,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Failed to generate security report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        days
      });

      // Return empty report on error
      return {
        userId,
        period: `${days} days`,
        totalEmails: 0,
        modifiedEmails: 0,
        modificationRate: 0,
        failedDeliveries: 0,
        deliveryRate: 0,
        securityFlags: [],
        recommendations: [],
        generatedAt: new Date()
      };
    }
  }

  /**
   * Obter estatísticas de entrega por domínio
   */
  async getDomainDeliveryStats(userId?: number): Promise<DomainDeliveryStats[]> {
    try {
      let query = db('email_audit_logs')
        .select([
          'dkim_domain as domain',
          db.raw('COUNT(*) as totalEmails'),
          db.raw("COUNT(CASE WHEN delivery_status = 'sent' THEN 1 END) as successfulEmails"),
          db.raw("COUNT(CASE WHEN delivery_status IN ('failed', 'bounced', 'rejected') THEN 1 END) as failedEmails"),
          db.raw('MAX(timestamp) as lastActivity')
        ])
        .groupBy('dkim_domain');

      if (userId) {
        query = query.where('user_id', userId);
      }

      const results = await query;

      return results.map((row: any) => ({
        domain: row.domain,
        totalEmails: parseInt(row.totalEmails),
        successfulEmails: parseInt(row.successfulEmails),
        failedEmails: parseInt(row.failedEmails),
        deliveryRate: row.totalEmails > 0 
          ? (row.successfulEmails / row.totalEmails) * 100 
          : 0,
        averageProcessingTime: 0, // Implementar se necessário
        lastActivity: new Date(row.lastActivity)
      }));

    } catch (error) {
      logger.error('Failed to get domain delivery stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return [];
    }
  }

  /**
   * Limpar logs antigos (manutenção)
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      const deletedCount = await db('email_audit_logs')
        .where('timestamp', '<', cutoffDate)
        .del();

      logger.info('Cleaned up old audit logs', {
        deletedCount,
        cutoffDate,
        daysToKeep
      });

      return deletedCount;

    } catch (error) {
      logger.error('Failed to cleanup old logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        daysToKeep
      });
      return 0;
    }
  }

  private generateAuditId(): string {
    return `audit_${uuidv4().replace(/-/g, '')}`;
  }

  private determineAction(auditLog: EmailAuditLog): string {
    if (auditLog.wasModified) {
      return 'email_modified';
    }

    switch (auditLog.deliveryStatus) {
      case 'sent':
        return 'email_sent';
      case 'failed':
        return 'email_failed';
      case 'bounced':
        return 'email_bounced';
      case 'rejected':
        return 'email_rejected';
      default:
        return 'email_queued';
    }
  }

  private async identifySecurityFlags(logs: EmailAuditLog[]): Promise<SecurityFlag[]> {
    const flags: SecurityFlag[] = [];

    // Flag 1: Alta taxa de modificação
    const modificationRate = logs.length > 0 
      ? (logs.filter(l => l.wasModified).length / logs.length) * 100 
      : 0;

    if (modificationRate > 50) {
      flags.push({
        type: 'HIGH_MODIFICATION_RATE',
        severity: 'HIGH',
        description: 'Taxa de modificação de emails muito alta',
        count: logs.filter(l => l.wasModified).length,
        threshold: 50
      });
    }

    // Flag 2: Muitas falhas
    const failureRate = logs.length > 0 
      ? (logs.filter(l => ['failed', 'bounced', 'rejected'].includes(l.deliveryStatus)).length / logs.length) * 100 
      : 0;

    if (failureRate > 20) {
      flags.push({
        type: 'FREQUENT_FAILURES',
        severity: 'MEDIUM',
        description: 'Taxa de falhas de entrega elevada',
        count: logs.filter(l => ['failed', 'bounced', 'rejected'].includes(l.deliveryStatus)).length,
        threshold: 20
      });
    }

    // Flag 3: Domínios suspeitos
    const domainCounts = logs.reduce((acc, log) => {
      acc[log.dkimDomain] = (acc[log.dkimDomain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const suspiciousDomains = Object.entries(domainCounts)
      .filter(([domain, count]) => count > 100 && !domain.includes('ultrazend.com.br'))
      .length;

    if (suspiciousDomains > 0) {
      flags.push({
        type: 'SUSPICIOUS_DOMAINS',
        severity: 'MEDIUM',
        description: 'Atividade alta em domínios externos',
        count: suspiciousDomains,
        threshold: 1
      });
    }

    return flags;
  }

  private generateRecommendations(logs: EmailAuditLog[], flags: SecurityFlag[]): string[] {
    const recommendations: string[] = [];

    if (flags.some(f => f.type === 'HIGH_MODIFICATION_RATE')) {
      recommendations.push('Configure domínios próprios para reduzir modificações automáticas');
      recommendations.push('Verifique se os endereços FROM estão corretos');
    }

    if (flags.some(f => f.type === 'FREQUENT_FAILURES')) {
      recommendations.push('Verifique configurações DKIM e SPF dos seus domínios');
      recommendations.push('Analise logs detalhados dos emails que falharam');
    }

    if (logs.filter(l => l.wasModified).length > logs.length * 0.3) {
      recommendations.push('Considere configurar domínios adicionais');
    }

    if (recommendations.length === 0) {
      recommendations.push('Configuração de email está funcionando corretamente');
    }

    return recommendations;
  }
}