import db from '../config/database';
import { logger } from '../config/logger';
import { EmailAuditService } from './EmailAuditService';

export interface Alert {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data: any;
  actions: string[];
  userId?: number;
}

export interface AlertThresholds {
  highFailureRate: number;
  criticalFailureRate: number;
  suspiciousModificationRate: number;
  maxFailuresPerHour: number;
  maxModificationsPerDay: number;
  minDeliveryRatePercent: number;
}

export interface SystemHealthMetrics {
  emailsLastHour: number;
  emailsLast24Hours: number;
  successRate: number;
  averageProcessingTime: number;
  activeUsers: number;
  domainCount: number;
  alertsOpen: number;
  systemLoad: number;
  timestamp: Date;
}

export class AlertingService {
  private static instance: AlertingService;
  private auditService: EmailAuditService;
  
  private readonly DEFAULT_THRESHOLDS: AlertThresholds = {
    highFailureRate: 10,           // 10 falhas por hora
    criticalFailureRate: 25,       // 25 falhas por hora  
    suspiciousModificationRate: 50, // 50% de emails modificados
    maxFailuresPerHour: 50,        // 50 falhas máximas por hora
    maxModificationsPerDay: 100,   // 100 modificações por usuário/dia
    minDeliveryRatePercent: 95     // 95% de taxa de entrega mínima
  };

  private constructor() {
    this.auditService = EmailAuditService.getInstance();
  }

  public static getInstance(): AlertingService {
    if (!AlertingService.instance) {
      AlertingService.instance = new AlertingService();
    }
    return AlertingService.instance;
  }

  /**
   * Executar todas as verificações de saúde do sistema
   */
  async runHealthChecks(): Promise<void> {
    try {
      logger.info('Starting system health checks');

      await Promise.all([
        this.checkDeliveryHealth(),
        this.checkSuspiciousActivity(), 
        this.checkDomainHealth(),
        this.checkSystemPerformance()
      ]);

      logger.info('System health checks completed successfully');
    } catch (error) {
      logger.error('System health checks failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await this.sendAlert({
        type: 'HEALTH_CHECK_FAILURE',
        severity: 'HIGH',
        message: 'Falha ao executar verificações de saúde do sistema',
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
        actions: [
          'Verificar logs do sistema',
          'Reiniciar serviço de monitoramento',
          'Contatar equipe técnica'
        ]
      });
    }
  }

  /**
   * Verificar saúde de entrega de emails
   */
  async checkDeliveryHealth(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentFailures = await db('email_audit_logs')
        .where('delivery_status', 'in', ['failed', 'bounced', 'rejected'])
        .where('timestamp', '>=', oneHourAgo)
        .count('* as count')
        .first();

      const failureCount = parseInt(recentFailures?.count as string) || 0;

      if (failureCount > this.DEFAULT_THRESHOLDS.criticalFailureRate) {
        await this.sendAlert({
          type: 'CRITICAL_FAILURE_RATE',
          severity: 'CRITICAL',
          message: `Taxa crítica de falhas de email detectada: ${failureCount} falhas na última hora`,
          data: { 
            failureCount, 
            timeWindow: '1 hour',
            threshold: this.DEFAULT_THRESHOLDS.criticalFailureRate
          },
          actions: [
            'Verificar configuração DKIM imediatamente',
            'Validar registros DNS SPF/DMARC',
            'Verificar saúde do servidor SMTP',
            'Analisar logs de entrega detalhados'
          ]
        });
      } else if (failureCount > this.DEFAULT_THRESHOLDS.highFailureRate) {
        await this.sendAlert({
          type: 'HIGH_FAILURE_RATE',
          severity: 'HIGH',
          message: `Alta taxa de falhas de email detectada: ${failureCount} falhas na última hora`,
          data: { 
            failureCount, 
            timeWindow: '1 hour',
            threshold: this.DEFAULT_THRESHOLDS.highFailureRate
          },
          actions: [
            'Verificar configuração DKIM',
            'Validar registros DNS',
            'Revisar saúde do servidor SMTP'
          ]
        });
      }

      // Verificar taxa de entrega geral
      const totalEmails = await db('email_audit_logs')
        .where('timestamp', '>=', oneHourAgo)
        .count('* as count')
        .first();

      const totalCount = parseInt(totalEmails?.count as string) || 0;
      
      if (totalCount > 0) {
        const deliveryRate = ((totalCount - failureCount) / totalCount) * 100;
        
        if (deliveryRate < this.DEFAULT_THRESHOLDS.minDeliveryRatePercent) {
          await this.sendAlert({
            type: 'LOW_DELIVERY_RATE',
            severity: 'HIGH', 
            message: `Taxa de entrega baixa: ${deliveryRate.toFixed(1)}%`,
            data: {
              deliveryRate,
              totalEmails: totalCount,
              failedEmails: failureCount
            },
            actions: [
              'Investigar causas das falhas',
              'Verificar blacklists de IP/domínio',
              'Revisar configurações de autenticação'
            ]
          });
        }
      }

    } catch (error) {
      logger.error('Failed to check delivery health', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Detectar atividade suspeita
   */
  async checkSuspiciousActivity(): Promise<void> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Detectar usuários com alta taxa de modificação
      const suspiciousModifications = await db('email_audit_logs')
        .select('user_id')
        .where('was_modified', true)
        .where('timestamp', '>=', oneDayAgo)
        .groupBy('user_id')
        .havingRaw('COUNT(*) > ?', [this.DEFAULT_THRESHOLDS.maxModificationsPerDay])
        .orderByRaw('COUNT(*) DESC');

      for (const pattern of suspiciousModifications) {
        const userModifications = await db('email_audit_logs')
          .where('user_id', pattern.user_id)
          .where('was_modified', true)
          .where('timestamp', '>=', oneDayAgo)
          .count('* as count')
          .first();

        const modificationCount = parseInt(userModifications?.count as string) || 0;

        await this.sendAlert({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'MEDIUM',
          message: `Alta taxa de modificações detectada para usuário ${pattern.user_id}`,
          data: { 
            userId: pattern.user_id,
            modificationCount,
            timeWindow: '24 hours',
            threshold: this.DEFAULT_THRESHOLDS.maxModificationsPerDay
          },
          userId: pattern.user_id,
          actions: [
            'Revisar configuração de domínio do usuário',
            'Verificar endereços FROM mal configurados',
            'Considerar educação sobre configuração adequada',
            'Investigar possível uso inadequado da API'
          ]
        });
      }

      // Detectar padrões anômalos de envio
      const anomalousPatterns = await db('email_audit_logs')
        .select(['user_id', 'dkim_domain'])
        .where('timestamp', '>=', oneDayAgo)
        .groupBy(['user_id', 'dkim_domain'])
        .havingRaw('COUNT(*) > 1000') // Muitos emails de um domínio
        .orderByRaw('COUNT(*) DESC');

      for (const pattern of anomalousPatterns) {
        const emailCount = await db('email_audit_logs')
          .where('user_id', pattern.user_id)
          .where('dkim_domain', pattern.dkim_domain)
          .where('timestamp', '>=', oneDayAgo)
          .count('* as count')
          .first();

        const count = parseInt(emailCount?.count as string) || 0;

        await this.sendAlert({
          type: 'UNUSUAL_PATTERNS',
          severity: 'LOW',
          message: `Padrão de envio incomum detectado`,
          data: {
            userId: pattern.user_id,
            domain: pattern.dkim_domain,
            emailCount: count,
            timeWindow: '24 hours'
          },
          userId: pattern.user_id,
          actions: [
            'Verificar se o volume é esperado',
            'Confirmar uso legítimo da API',
            'Monitorar taxa de entrega'
          ]
        });
      }

    } catch (error) {
      logger.error('Failed to check suspicious activity', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Verificar saúde dos domínios
   */
  async checkDomainHealth(): Promise<void> {
    try {
      const domainStats = await this.auditService.getDomainDeliveryStats();
      
      for (const stat of domainStats) {
        if (stat.deliveryRate < 90 && stat.totalEmails > 10) {
          await this.sendAlert({
            type: 'DOMAIN_DELIVERY_ISSUES',
            severity: 'MEDIUM',
            message: `Problemas de entrega detectados no domínio ${stat.domain}`,
            data: {
              domain: stat.domain,
              deliveryRate: stat.deliveryRate,
              totalEmails: stat.totalEmails,
              failedEmails: stat.failedEmails
            },
            actions: [
              'Verificar configuração DNS do domínio',
              'Validar registros DKIM/SPF/DMARC',
              'Verificar reputação do domínio',
              'Contatar administrador do domínio'
            ]
          });
        }

        // Verificar domínios inativos há muito tempo
        const daysSinceLastActivity = Math.floor(
          (Date.now() - stat.lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceLastActivity > 30 && stat.totalEmails > 0) {
          await this.sendAlert({
            type: 'DOMAIN_INACTIVE',
            severity: 'LOW',
            message: `Domínio ${stat.domain} inativo há ${daysSinceLastActivity} dias`,
            data: {
              domain: stat.domain,
              daysSinceLastActivity,
              lastActivity: stat.lastActivity,
              totalEmails: stat.totalEmails
            },
            actions: [
              'Verificar se o domínio ainda é necessário',
              'Considerar remover domínios não utilizados',
              'Confirmar configuração com o usuário'
            ]
          });
        }
      }

    } catch (error) {
      logger.error('Failed to check domain health', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Verificar performance do sistema
   */
  async checkSystemPerformance(): Promise<void> {
    try {
      const metrics = await this.getSystemHealthMetrics();

      if (metrics.successRate < 95) {
        await this.sendAlert({
          type: 'SYSTEM_PERFORMANCE_DEGRADED',
          severity: 'HIGH',
          message: `Performance do sistema degradada: ${metrics.successRate}% de sucesso`,
          data: metrics,
          actions: [
            'Verificar recursos do servidor',
            'Analisar logs de erro',
            'Considerar scaling do sistema',
            'Verificar conectividade SMTP'
          ]
        });
      }

      if (metrics.alertsOpen > 10) {
        await this.sendAlert({
          type: 'TOO_MANY_ALERTS',
          severity: 'MEDIUM',
          message: `Muitos alertas abertos: ${metrics.alertsOpen}`,
          data: { alertsOpen: metrics.alertsOpen },
          actions: [
            'Revisar e resolver alertas pendentes',
            'Verificar se alertas são falsos positivos',
            'Ajustar thresholds se necessário'
          ]
        });
      }

    } catch (error) {
      logger.error('Failed to check system performance', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Obter métricas de saúde do sistema
   */
  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        emailsLastHour,
        emailsLast24Hours,
        successfulEmails,
        activeUsers,
        domainCount,
        alertsOpen
      ] = await Promise.all([
        db('email_audit_logs').where('timestamp', '>=', oneHourAgo).count('* as count').first(),
        db('email_audit_logs').where('timestamp', '>=', oneDayAgo).count('* as count').first(),
        db('email_audit_logs').where('timestamp', '>=', oneDayAgo).where('delivery_status', 'sent').count('* as count').first(),
        db('email_audit_logs').where('timestamp', '>=', oneDayAgo).countDistinct('user_id as count').first(),
        db('domains').where('is_verified', true).count('* as count').first(),
        db('system_alerts').where('resolved', false).count('* as count').first()
      ]);

      const emailsHour = parseInt(emailsLastHour?.count as string) || 0;
      const emailsDay = parseInt(emailsLast24Hours?.count as string) || 0;
      const successful = parseInt(successfulEmails?.count as string) || 0;

      return {
        emailsLastHour: emailsHour,
        emailsLast24Hours: emailsDay,
        successRate: emailsDay > 0 ? (successful / emailsDay) * 100 : 100,
        averageProcessingTime: 0, // Implementar se necessário
        activeUsers: parseInt(activeUsers?.count as string) || 0,
        domainCount: parseInt(domainCount?.count as string) || 0,
        alertsOpen: parseInt(alertsOpen?.count as string) || 0,
        systemLoad: 0, // Implementar se necessário
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get system health metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        emailsLastHour: 0,
        emailsLast24Hours: 0,
        successRate: 0,
        averageProcessingTime: 0,
        activeUsers: 0,
        domainCount: 0,
        alertsOpen: 0,
        systemLoad: 0,
        timestamp: new Date()
      };
    }
  }

  /**
   * Enviar um alerta
   */
  private async sendAlert(alert: Alert): Promise<void> {
    try {
      // Verificar se já existe alerta similar recente
      const recentAlert = await db('system_alerts')
        .where('type', alert.type)
        .where('resolved', false)
        .where('created_at', '>', new Date(Date.now() - 60 * 60 * 1000)) // 1 hora
        .first();

      if (recentAlert) {
        logger.debug('Skipping duplicate alert', { type: alert.type });
        return;
      }

      // Salvar alerta no banco
      await db('system_alerts').insert({
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        data: JSON.stringify(alert.data),
        actions: JSON.stringify(alert.actions),
        resolved: false,
        created_at: new Date()
      });

      // Log estruturado
      logger.warn('System alert triggered', {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        userId: alert.userId,
        data: alert.data
      });

      // Enviar notificações (implementar conforme necessário)
      await this.sendNotifications(alert);

    } catch (error) {
      logger.error('Failed to send alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        alert
      });
    }
  }

  /**
   * Enviar notificações para alertas críticos
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    // Implementar notificações via:
    // - Email para admins
    // - Webhook/Slack
    // - SMS para alertas críticos
    // - Dashboard em tempo real

    if (alert.severity === 'CRITICAL') {
      logger.error('CRITICAL ALERT', {
        type: alert.type,
        message: alert.message,
        actions: alert.actions
      });

      // Aqui implementar notificação urgente
      // Exemplo: enviar email para admin@ultrazend.com.br
      // Exemplo: webhook para Slack/Discord
      // Exemplo: SMS para equipe técnica
    }
  }

  /**
   * Resolver um alerta
   */
  async resolveAlert(alertId: number, userId: number): Promise<void> {
    try {
      await db('system_alerts')
        .where('id', alertId)
        .update({
          resolved: true,
          resolved_at: new Date(),
          resolved_by: userId
        });

      logger.info('Alert resolved', { alertId, resolvedBy: userId });
    } catch (error) {
      logger.error('Failed to resolve alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        alertId,
        userId
      });
    }
  }

  /**
   * Obter alertas ativos
   */
  async getActiveAlerts(limit: number = 50): Promise<any[]> {
    try {
      return await db('system_alerts')
        .where('resolved', false)
        .orderBy('created_at', 'desc')
        .limit(limit);
    } catch (error) {
      logger.error('Failed to get active alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }
}