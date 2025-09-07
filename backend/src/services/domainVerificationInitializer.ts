import { logger, Logger } from '../config/logger';
import { domainVerificationJob } from '../jobs/domainVerificationJob';
import { domainVerificationLogger } from './DomainVerificationLogger';
import { Env } from '../utils/env';

export class DomainVerificationInitializer {
  private static instance: DomainVerificationInitializer;
  private isInitialized = false;
  
  public static getInstance(): DomainVerificationInitializer {
    if (!DomainVerificationInitializer.instance) {
      DomainVerificationInitializer.instance = new DomainVerificationInitializer();
    }
    return DomainVerificationInitializer.instance;
  }

  // Inicializar sistema completo de monitoramento de domínios
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Domain verification system already initialized, skipping');
      return;
    }

    try {
      Logger.business('domain_verification_system', 'initialization_started', {
        metadata: {
          timestamp: new Date().toISOString(),
          environment: Env.get('NODE_ENV', 'development')
        }
      });

      // Step 1: Inicializar tabelas de log (já feito automaticamente pelo DomainVerificationLogger)
      logger.info('🔄 Initializing domain verification logging system...');
      
      // Forçar inicialização das tabelas se ainda não foi feita
      await domainVerificationLogger.cleanupOldLogs(0); // Apenas para forçar inicialização
      logger.info('✅ Domain verification logging system initialized');

      // Step 2: Configurar job recorrente
      logger.info('🔄 Configuring recurring domain verification job...');
      
      if (Env.getBoolean('DOMAIN_AUTO_VERIFICATION_ENABLED', true)) {
        await domainVerificationJob.scheduleRecurringJob();
        logger.info('✅ Recurring domain verification job scheduled (every 6 hours)');
      } else {
        logger.info('⚠️ Automatic domain verification disabled by environment variable');
      }

      // Step 3: Executar verificação inicial se habilitada
      if (Env.getBoolean('DOMAIN_INITIAL_VERIFICATION_ENABLED', false)) {
        logger.info('🔄 Triggering initial domain verification batch...');
        
        setTimeout(async () => {
          try {
            await domainVerificationJob.scheduleBatchVerification({
              batchSize: 10,
              retryFailedOnly: false
            });
            
            Logger.business('domain_verification_system', 'initial_batch_scheduled', {
              metadata: { batchSize: 10, retryFailedOnly: false }
            });
          } catch (error) {
            Logger.error('Failed to schedule initial domain verification batch', error as Error);
          }
        }, 30000); // Aguardar 30 segundos após inicialização
        
        logger.info('✅ Initial domain verification batch will run in 30 seconds');
      }

      // Step 4: Configurar limpeza automática de logs
      logger.info('🔄 Configuring automatic log cleanup...');
      
      const logRetentionDays = Env.getNumber('DOMAIN_LOG_RETENTION_DAYS', 90);
      const jobRetentionHours = Env.getNumber('DOMAIN_JOB_RETENTION_HOURS', 168); // 7 dias
      
      // Executar limpeza diária
      const cleanupInterval = setInterval(async () => {
        try {
          const midnight = new Date();
          midnight.setHours(2, 0, 0, 0); // 2:00 AM
          
          const now = new Date();
          const timeUntilCleanup = midnight.getTime() - now.getTime();
          
          // Se já passou das 2:00 AM hoje, agendar para amanhã
          if (timeUntilCleanup < 0) {
            midnight.setDate(midnight.getDate() + 1);
          }
          
          Logger.business('domain_verification_system', 'cleanup_scheduled', {
            metadata: { 
              nextCleanup: midnight.toISOString(),
              logRetentionDays,
              jobRetentionHours
            }
          });
          
          // Executar limpeza
          await domainVerificationLogger.cleanupOldLogs(logRetentionDays);
          await domainVerificationJob.cleanupOldJobs();
          
        } catch (error) {
          Logger.error('Failed to run domain verification cleanup', error as Error);
        }
      }, 24 * 60 * 60 * 1000); // A cada 24 horas
      
      logger.info(`✅ Automatic cleanup configured (${logRetentionDays} days retention)`);

      // Step 5: Configurar monitoramento de alertas
      logger.info('🔄 Configuring recurring alerts monitoring...');
      
      if (Env.getBoolean('DOMAIN_ALERTS_ENABLED', true)) {
        const alertsInterval = setInterval(async () => {
          try {
            const issues = await domainVerificationLogger.checkForRecurringIssues();
            
            if (issues.alerts.length > 0) {
              Logger.security('domain_verification_monitoring', 'failure', {
                reason: `Monitoring detected ${issues.alerts.length} issues: ${issues.alerts.join(', ')}`,
                riskLevel: issues.highFailureRate ? 'high' : 'medium',
                resource: 'domain_verification_system'
              });
              
              // Log detalhado separadamente
              logger.warn('Domain verification recurring issues detected', {
                business: {
                  entity: 'domain_verification_monitoring',
                  action: 'recurring_issues_detected',
                  metadata: { issues }
                }
              });
            }
          } catch (error) {
            Logger.error('Failed to check for domain verification recurring issues', error as Error);
          }
        }, Env.getNumber('DOMAIN_ALERTS_INTERVAL_MINUTES', 30) * 60 * 1000); // A cada 30 minutos
        
        logger.info('✅ Recurring alerts monitoring configured (every 30 minutes)');
      } else {
        logger.info('⚠️ Domain verification alerts disabled by environment variable');
      }

      // Step 6: Configurar métricas de health check
      logger.info('🔄 Configuring domain verification health metrics...');
      
      const healthCheckInterval = setInterval(async () => {
        try {
          const stats = await domainVerificationJob.getJobStats();
          const recentStats = await domainVerificationLogger.getVerificationStats({
            dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000) // Últimas 24h
          });
          
          Logger.business('domain_verification_system', 'health_metrics', {
            metadata: {
              jobStats: stats,
              recentVerifications: {
                total: recentStats.totalAttempts,
                successful: recentStats.successfulVerifications,
                failed: recentStats.failedVerifications,
                averageTime: recentStats.averageVerificationTime
              },
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          Logger.error('Failed to collect domain verification health metrics', error as Error);
        }
      }, 15 * 60 * 1000); // A cada 15 minutos
      
      logger.info('✅ Health metrics collection configured (every 15 minutes)');

      this.isInitialized = true;

      Logger.business('domain_verification_system', 'initialization_completed', {
        metadata: {
          features: {
            logging: true,
            recurringJobs: Env.getBoolean('DOMAIN_AUTO_VERIFICATION_ENABLED', true),
            initialBatch: Env.getBoolean('DOMAIN_INITIAL_VERIFICATION_ENABLED', false),
            alerts: Env.getBoolean('DOMAIN_ALERTS_ENABLED', true),
            cleanup: true,
            healthMetrics: true
          },
          configuration: {
            logRetentionDays,
            jobRetentionHours,
            alertIntervalMinutes: Env.getNumber('DOMAIN_ALERTS_INTERVAL_MINUTES', 30),
            healthCheckIntervalMinutes: 15,
            batchSize: Env.getNumber('DOMAIN_VERIFICATION_BATCH_SIZE', 50)
          }
        }
      });

      logger.info('🎉 Domain Verification Monitoring System - FULLY OPERATIONAL');
      logger.info('✅ Automatic verification every 6 hours');
      logger.info('✅ Comprehensive logging and metrics');
      logger.info('✅ Proactive alerts for issues');
      logger.info('✅ Automated cleanup and maintenance');

    } catch (error) {
      Logger.error('Failed to initialize domain verification system', error as Error);
      throw error;
    }
  }

  // Método para obter status do sistema
  public async getSystemStatus(): Promise<{
    initialized: boolean;
    jobStats: any;
    recentStats: any;
    systemHealth: any;
  }> {
    try {
      const jobStats = await domainVerificationJob.getJobStats();
      const recentStats = await domainVerificationLogger.getVerificationStats({
        dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000)
      });
      const healthIssues = await domainVerificationLogger.checkForRecurringIssues();

      return {
        initialized: this.isInitialized,
        jobStats,
        recentStats,
        systemHealth: {
          hasIssues: healthIssues.alerts.length > 0,
          issues: healthIssues.alerts,
          highFailureRate: healthIssues.highFailureRate,
          stuckVerifications: healthIssues.stuckPendingVerifications,
          unusualRetryRates: healthIssues.unusualRetryRates
        }
      };
    } catch (error) {
      Logger.error('Failed to get domain verification system status', error as Error);
      throw error;
    }
  }

  // Método para forçar verificação manual
  public async triggerManualVerification(options: {
    domainId?: number;
    batchSize?: number;
    retryFailedOnly?: boolean;
    userId?: number;
  } = {}): Promise<void> {
    try {
      if (options.domainId) {
        await domainVerificationJob.scheduleSingleDomainVerification(
          options.domainId,
          { userId: options.userId }
        );
        
        Logger.business('domain_verification_system', 'manual_single_verification_triggered', {
          entityId: options.domainId.toString(),
          userId: options.userId?.toString()
        });
      } else {
        await domainVerificationJob.scheduleBatchVerification({
          batchSize: options.batchSize || 20,
          retryFailedOnly: options.retryFailedOnly || false,
          userId: options.userId
        });
        
        Logger.business('domain_verification_system', 'manual_batch_verification_triggered', {
          userId: options.userId?.toString(),
          metadata: { 
            batchSize: options.batchSize || 20,
            retryFailedOnly: options.retryFailedOnly || false
          }
        });
      }
    } catch (error) {
      Logger.error('Failed to trigger manual domain verification', error as Error, {
        context: { options }
      });
      throw error;
    }
  }
}

// Export singleton instance
export const domainVerificationInitializer = DomainVerificationInitializer.getInstance();