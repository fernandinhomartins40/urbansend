import * as cron from 'node-cron';
import { AlertingService } from '../services/AlertingService';
import { EmailAuditService } from '../services/EmailAuditService';
import { logger } from '../config/logger';

/**
 * Scheduler para verificações automáticas de saúde do sistema
 * Implementação da Fase 4 - Monitoramento e Alertas
 */
export class HealthCheckScheduler {
  private alertingService: AlertingService;
  private auditService: EmailAuditService;
  private isRunning: boolean = false;
  private scheduledJobs: cron.ScheduledTask[] = [];

  constructor() {
    this.alertingService = AlertingService.getInstance();
    this.auditService = EmailAuditService.getInstance();
  }

  /**
   * Iniciar todos os cron jobs de monitoramento
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Health check scheduler already running');
      return;
    }

    logger.info('Starting health check scheduler');

    // Verificações críticas a cada 5 minutos
    this.scheduledJobs.push(
      cron.schedule('*/5 * * * *', async () => {
        try {
          logger.debug('Running critical health checks');
          await this.alertingService.checkDeliveryHealth();
        } catch (error) {
          logger.error('Critical health check failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Verificações de atividade suspeita a cada 15 minutos
    this.scheduledJobs.push(
      cron.schedule('*/15 * * * *', async () => {
        try {
          logger.debug('Running suspicious activity checks');
          await this.alertingService.checkSuspiciousActivity();
        } catch (error) {
          logger.error('Suspicious activity check failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Verificações de saúde de domínio a cada 30 minutos
    this.scheduledJobs.push(
      cron.schedule('*/30 * * * *', async () => {
        try {
          logger.debug('Running domain health checks');
          await this.alertingService.checkDomainHealth();
        } catch (error) {
          logger.error('Domain health check failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Verificações de performance do sistema a cada hora
    this.scheduledJobs.push(
      cron.schedule('0 * * * *', async () => {
        try {
          logger.debug('Running system performance checks');
          await this.alertingService.checkSystemPerformance();
        } catch (error) {
          logger.error('System performance check failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Verificações completas de saúde a cada 4 horas
    this.scheduledJobs.push(
      cron.schedule('0 */4 * * *', async () => {
        try {
          logger.info('Running complete health checks');
          await this.alertingService.runHealthChecks();
        } catch (error) {
          logger.error('Complete health checks failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Limpeza de logs antigos diariamente às 02:00
    this.scheduledJobs.push(
      cron.schedule('0 2 * * *', async () => {
        try {
          logger.info('Running audit log cleanup');
          const deletedCount = await this.auditService.cleanupOldLogs(90); // 90 dias
          logger.info('Audit log cleanup completed', { deletedCount });
        } catch (error) {
          logger.error('Audit log cleanup failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Relatório de saúde semanal às segundas-feiras às 08:00
    this.scheduledJobs.push(
      cron.schedule('0 8 * * 1', async () => {
        try {
          logger.info('Generating weekly health report');
          await this.generateWeeklyHealthReport();
        } catch (error) {
          logger.error('Weekly health report generation failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Verificação de alertas órfãos a cada 6 horas
    this.scheduledJobs.push(
      cron.schedule('0 */6 * * *', async () => {
        try {
          logger.debug('Checking for orphaned alerts');
          await this.checkOrphanedAlerts();
        } catch (error) {
          logger.error('Orphaned alerts check failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Iniciar todos os jobs
    this.scheduledJobs.forEach((job, index) => {
      job.start();
    });

    this.isRunning = true;
    logger.info('Health check scheduler started successfully', {
      totalJobs: this.scheduledJobs.length
    });
  }

  /**
   * Parar todos os cron jobs
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Health check scheduler not running');
      return;
    }

    logger.info('Stopping health check scheduler');

    this.scheduledJobs.forEach(job => {
      job.stop();
    });

    this.scheduledJobs = [];
    this.isRunning = false;

    logger.info('Health check scheduler stopped successfully');
  }

  /**
   * Obter status dos cron jobs
   */
  getStatus(): {
    isRunning: boolean;
    jobs: Array<{
      name: string;
      isRunning: boolean;
      nextRun?: Date;
    }>;
  } {
    return {
      isRunning: this.isRunning,
      jobs: this.scheduledJobs.map((job, index) => ({
        name: `job-${index}`,
        isRunning: job.getStatus() === 'scheduled',
        // nextRun: job.nextDate()?.toDate() // Disponível em versões mais recentes
      }))
    };
  }

  /**
   * Executar verificação manual de todas as verificações de saúde
   */
  async runManualHealthCheck(): Promise<void> {
    try {
      logger.info('Running manual health check');
      
      await Promise.all([
        this.alertingService.checkDeliveryHealth(),
        this.alertingService.checkSuspiciousActivity(),
        this.alertingService.checkDomainHealth(),
        this.alertingService.checkSystemPerformance()
      ]);

      logger.info('Manual health check completed successfully');
    } catch (error) {
      logger.error('Manual health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Gerar relatório de saúde semanal
   */
  private async generateWeeklyHealthReport(): Promise<void> {
    try {
      const metrics = await this.alertingService.getSystemHealthMetrics();
      const activeAlerts = await this.alertingService.getActiveAlerts(10);
      
      logger.info('Weekly health report', {
        week: new Date().toISOString().slice(0, 10),
        metrics: {
          emailsLast24Hours: metrics.emailsLast24Hours,
          successRate: metrics.successRate,
          activeUsers: metrics.activeUsers,
          domainCount: metrics.domainCount,
          alertsOpen: metrics.alertsOpen
        },
        topAlerts: activeAlerts.map(alert => ({
          type: alert.type,
          severity: alert.severity,
          createdAt: alert.created_at
        }))
      });

      // Aqui pode implementar envio por email se necessário
      // await this.sendWeeklyReportEmail(metrics, activeAlerts);
      
    } catch (error) {
      logger.error('Failed to generate weekly health report', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Verificar alertas órfãos (não resolvidos há muito tempo)
   */
  private async checkOrphanedAlerts(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Buscar alertas não resolvidos há mais de 7 dias
      const orphanedAlerts = await this.alertingService.getActiveAlerts(100)
        .then(alerts => alerts.filter(alert => 
          new Date(alert.created_at) < sevenDaysAgo
        ));

      if (orphanedAlerts.length > 0) {
        logger.warn('Found orphaned alerts', {
          count: orphanedAlerts.length,
          oldestAlert: Math.min(...orphanedAlerts.map(a => 
            Date.now() - new Date(a.created_at).getTime()
          )) / (1000 * 60 * 60 * 24) + ' days'
        });

        // Criar alerta sobre alertas órfãos
        // Usando método privado sendAlert do AlertingService seria ideal,
        // mas como não temos acesso, vamos logar
        logger.error('ORPHANED_ALERTS detected', {
          type: 'ORPHANED_ALERTS',
          severity: 'MEDIUM',
          message: `${orphanedAlerts.length} alertas não resolvidos há mais de 7 dias`,
          data: { count: orphanedAlerts.length, cutoffDate: sevenDaysAgo }
        });
      } else {
        logger.debug('No orphaned alerts found');
      }
    } catch (error) {
      logger.error('Failed to check orphaned alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Reiniciar o scheduler (útil para atualizações de configuração)
   */
  restart(): void {
    logger.info('Restarting health check scheduler');
    this.stop();
    setTimeout(() => {
      this.start();
    }, 1000);
  }
}

// Instância singleton do scheduler
export const healthCheckScheduler = new HealthCheckScheduler();

// Iniciar automaticamente se NODE_ENV não for test
if (process.env.NODE_ENV !== 'test') {
  // Aguardar um pouco para garantir que o banco de dados esteja conectado
  setTimeout(() => {
    healthCheckScheduler.start();
  }, 5000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, stopping health check scheduler');
  healthCheckScheduler.stop();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, stopping health check scheduler');
  healthCheckScheduler.stop();
});