import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { TenantContextService } from '../services/TenantContextService';
import { TenantQueueManager } from '../services/TenantQueueManager';

class QueueProcessor {
  private tenantContextService: TenantContextService;
  private tenantQueueManager: TenantQueueManager;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private activeTenants: Set<number> = new Set();

  constructor() {
    this.tenantContextService = new TenantContextService();
    this.tenantQueueManager = new TenantQueueManager();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('🔄 Queue Processor already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 UltraZend Queue Processor starting...', {
      mode: 'Pure UltraZend SMTP',
      environment: Env.get('NODE_ENV'),
      version: '1.0.0'
    });

    // Processar filas a cada 10 segundos
    this.processInterval = setInterval(async () => {
      try {
        await this.processAllQueues();
      } catch (error) {
        logger.error('🔄 Queue Processor error:', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 10000);

    // Limpeza de filas a cada 1 hora
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performQueueCleanup();
      } catch (error) {
        logger.error('🧹 Queue cleanup error:', error);
      }
    }, 60 * 60 * 1000); // 1 hora

    logger.info('✅ UltraZend Queue Processor started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    try {
      await this.tenantQueueManager.closeAllQueues();
    } catch (error) {
      logger.error('Error closing tenant queue manager:', error);
    }

    this.activeTenants.clear();
    logger.info('🛑 UltraZend Queue Processor stopped');
  }

  private async processAllQueues(): Promise<void> {
    try {
      // 🔥 NOVA ABORDAGEM: Descobrir tenants ativos e processar por tenant
      const activeTenants = await this.discoverActiveTenants();
      
      logger.debug('🔄 Processing queues for active tenants', {
        tenants: activeTenants.length
      });

      for (const tenantId of activeTenants) {
        try {
          await this.processTenantQueues(tenantId);
        } catch (error) {
          logger.error(`❌ Error processing tenant ${tenantId} queues:`, {
            tenantId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Verificar saúde geral das filas
      await this.performHealthChecks();

    } catch (error) {
      logger.error('Error processing queues:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // 🔥 NOVO MÉTODO: Descobrir tenants com atividade pendente
  private async discoverActiveTenants(): Promise<number[]> {
    try {
      const tenantsWithPendingEmails = await db('email_delivery_queue')
        .distinct('user_id')
        .where('status', 'pending')
        .whereNotNull('user_id')
        .pluck('user_id');

      const tenantsWithPendingWebhooks = await db('webhook_delivery_queue')
        .distinct('user_id') 
        .where('status', 'pending')
        .whereNotNull('user_id')
        .pluck('user_id')
        .catch(() => []); // Tabela pode não existir ainda

      // Combinar todos os tenants únicos
      const allTenants = [...new Set([...tenantsWithPendingEmails, ...tenantsWithPendingWebhooks])];
      
      return allTenants;
    } catch (error) {
      logger.error('Error discovering active tenants:', error);
      return [];
    }
  }

  // 🔥 NOVO MÉTODO: Processar todas as filas de um tenant específico
  private async processTenantQueues(tenantId: number): Promise<void> {
    try {
      // Validar contexto do tenant primeiro
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      
      if (!tenantContext.isActive) {
        logger.warn(`⚠️ Skipping inactive tenant ${tenantId}`);
        return;
      }

      // Processar emails do tenant
      await this.processTenantEmailQueue(tenantId, tenantContext);

      // Processar webhooks do tenant
      await this.processTenantWebhookQueue(tenantId, tenantContext);

      // Processar analytics do tenant
      await this.processTenantAnalyticsQueue(tenantId, tenantContext);

    } catch (error) {
      logger.error(`Error processing tenant ${tenantId} queues:`, error);
    }
  }

  // 🔥 NOVO MÉTODO: Processar emails específicos de um tenant
  private async processTenantEmailQueue(tenantId: number, tenantContext: any): Promise<void> {
    try {
      // 🔥 CRÍTICO: Buscar SOMENTE emails deste tenant
      const pendingEmails = await db('email_delivery_queue')
        .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .where('status', 'pending')
        .where(function(this: any) {
          this.whereNull('next_attempt')
            .orWhere('next_attempt', '<=', new Date());
        })
        .orderBy('created_at', 'asc')
        .limit(10); // Limite por tenant para evitar monopolização

      if (pendingEmails.length === 0) {
        return;
      }

      logger.info(`📧 Processing ${pendingEmails.length} pending emails for tenant ${tenantId}`);

      const { SMTPDeliveryService } = await import('../services/smtpDelivery');
      const smtpService = new SMTPDeliveryService();

      for (const emailRecord of pendingEmails) {
        try {
          // Validar se tenant pode enviar este email
          const canSendEmail = await this.tenantContextService.validateTenantOperation(
            tenantId, 
            {
              type: 'email_send',
              data: { 
                from: emailRecord.from_address,
                to: emailRecord.to_address,
                domain: emailRecord.from_address.split('@')[1] 
              }
            }
          );

          if (!canSendEmail.allowed) {
            logger.warn(`🚫 Tenant ${tenantId} cannot send email:`, { 
              reason: canSendEmail.reason,
              emailId: emailRecord.id 
            });
            
            await db('email_delivery_queue')
              .where('id', emailRecord.id)
              .update({
                status: 'failed',
                error_message: `Tenant validation failed: ${canSendEmail.reason}`,
                updated_at: new Date()
              });
            continue;
          }

          // Marcar como em processamento
          await db('email_delivery_queue')
            .where('id', emailRecord.id)
            .update({
              status: 'processing',
              last_attempt: new Date(),
              updated_at: new Date()
            });

          // Processar email com contexto de tenant
          const emailData = {
            from: emailRecord.from_address,
            to: emailRecord.to_address,
            subject: emailRecord.subject,
            html: emailRecord.body,
            text: emailRecord.body,
            headers: emailRecord.headers ? JSON.parse(emailRecord.headers) : {},
            tenantContext // 🔥 NOVO: Passar contexto do tenant
          };

          const success = await smtpService.deliverEmail(emailData);

          if (success) {
            await db('email_delivery_queue')
              .where('id', emailRecord.id)
              .update({
                status: 'delivered',
                delivered_at: new Date(),
                updated_at: new Date()
              });

            logger.info(`✅ Email delivered for tenant ${tenantId}`, {
              id: emailRecord.id,
              to: emailRecord.to_address
            });
          } else {
            throw new Error('Delivery failed without specific error');
          }

        } catch (error) {
          await this.handleEmailFailure(emailRecord, error, tenantId);
        }
      }

    } catch (error) {
      logger.error(`Error processing tenant ${tenantId} email queue:`, error);
    }
  }

  // 🔥 NOVO MÉTODO: Tratar falhas de email com contexto de tenant
  private async handleEmailFailure(emailRecord: any, error: any, tenantId: number): Promise<void> {
    const attempts = (emailRecord.attempts || 0) + 1;
    const maxAttempts = 5;

    logger.warn(`❌ Email delivery failed for tenant ${tenantId}`, {
      id: emailRecord.id,
      to: emailRecord.to_address,
      attempts,
      maxAttempts,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (attempts >= maxAttempts) {
      await db('email_delivery_queue')
        .where('id', emailRecord.id)
        .update({
          status: 'failed',
          attempts,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date()
        });
    } else {
      const nextAttempt = new Date(Date.now() + Math.pow(2, attempts) * 60000);
      
      await db('email_delivery_queue')
        .where('id', emailRecord.id)
        .update({
          status: 'pending',
          attempts,
          next_attempt: nextAttempt,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date()
        });
    }
  }

  // 🔥 NOVO MÉTODO: Processar webhooks específicos de um tenant
  private async processTenantWebhookQueue(tenantId: number, tenantContext: any): Promise<void> {
    try {
      // 🔥 CRÍTICO: Buscar SOMENTE webhooks deste tenant
      const pendingWebhooks = await db('webhook_delivery_queue')
        .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .where('status', 'pending')
        .where(function(this: any) {
          this.whereNull('next_attempt')
            .orWhere('next_attempt', '<=', new Date());
        })
        .orderBy('created_at', 'asc')
        .limit(5) // Limite menor para webhooks
        .catch(() => []); // Tabela pode não existir ainda

      if (pendingWebhooks.length === 0) {
        return;
      }

      logger.info(`🔗 Processing ${pendingWebhooks.length} pending webhooks for tenant ${tenantId}`);

      // TODO: Implementar WebhookDeliveryService tenant-aware
      logger.debug(`📡 Webhook processing for tenant ${tenantId} - implementation pending`);

    } catch (error) {
      logger.error(`Error processing tenant ${tenantId} webhook queue:`, error);
    }
  }

  // 🔥 NOVO MÉTODO: Processar analytics específicos de um tenant
  private async processTenantAnalyticsQueue(tenantId: number, tenantContext: any): Promise<void> {
    try {
      // 🔥 CRÍTICO: Buscar SOMENTE analytics deste tenant
      const pendingAnalytics = await db('analytics_processing_queue')
        .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .where('status', 'pending')
        .where(function(this: any) {
          this.whereNull('next_attempt')
            .orWhere('next_attempt', '<=', new Date());
        })
        .orderBy('created_at', 'asc')
        .limit(10)
        .catch(() => []); // Tabela pode não existir ainda

      if (pendingAnalytics.length === 0) {
        return;
      }

      logger.info(`📊 Processing ${pendingAnalytics.length} pending analytics for tenant ${tenantId}`);

      // TODO: Implementar AnalyticsProcessingService tenant-aware
      logger.debug(`📊 Analytics processing for tenant ${tenantId} - implementation pending`);

    } catch (error) {
      logger.error(`Error processing tenant ${tenantId} analytics queue:`, error);
    }
  }

  // 🔥 NOVO MÉTODO: Verificações de saúde tenant-aware
  private async performHealthChecks(): Promise<void> {
    try {
      logger.debug('🔧 Performing tenant-aware health checks...');
      
      // Limpar jobs presos há muito tempo (todos os tenants, mas mantendo isolamento)
      const stalledEmailJobs = await db('email_delivery_queue')
        .where('status', 'processing')
        .where('last_attempt', '<', new Date(Date.now() - 10 * 60 * 1000)) // 10 minutos atrás
        .update({
          status: 'pending',
          next_attempt: new Date(Date.now() + 60000) // Retry em 1 minuto
        });

      if (stalledEmailJobs > 0) {
        logger.info('🔄 Reset stalled email jobs', { count: stalledEmailJobs });
      }

      // Limpar webhook jobs presos
      const stalledWebhookJobs = await db('webhook_delivery_queue')
        .where('status', 'processing')
        .where('last_attempt', '<', new Date(Date.now() - 10 * 60 * 1000))
        .update({
          status: 'pending',
          next_attempt: new Date(Date.now() + 60000)
        })
        .catch(() => 0); // Tabela pode não existir

      if (stalledWebhookJobs > 0) {
        logger.info('🔄 Reset stalled webhook jobs', { count: stalledWebhookJobs });
      }

      // Verificar status das filas por tenant (sample dos maiores)
      await this.checkTenantQueuesHealth();

    } catch (error) {
      logger.error('Error performing health checks:', error);
    }
  }

  // 🔥 NOVO MÉTODO: Verificar saúde das filas por tenant
  private async checkTenantQueuesHealth(): Promise<void> {
    try {
      // Identificar tenants com mais jobs pendentes
      const topTenants = await db('email_delivery_queue')
        .select('user_id')
        .count('* as pending_count')
        .where('status', 'pending')
        .groupBy('user_id')
        .orderBy('pending_count', 'desc')
        .limit(5);

      for (const tenant of topTenants) {
        const tenantId = tenant.user_id;
        const pendingCount = Number(tenant.pending_count);
        
        if (pendingCount > 50) { // Threshold de alerta
          logger.warn(`📊 High queue volume for tenant ${tenantId}`, {
            tenantId,
            pendingEmails: pendingCount
          });

          // Verificar se tenant ainda está ativo
          const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
          if (!tenantContext.isActive) {
            logger.warn(`⚠️ Inactive tenant ${tenantId} has ${pendingCount} pending emails - needs cleanup`);
          }
        }
      }

    } catch (error) {
      logger.error('Error checking tenant queues health:', error);
    }
  }

  // 🔥 NOVO MÉTODO: Limpeza tenant-aware com retenção de dados
  private async performQueueCleanup(): Promise<void> {
    try {
      logger.info('🧹 Performing tenant-aware queue cleanup...');

      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 dias atrás

      // Limpar emails antigos entregues (mantendo por tenant para auditoria)
      const deletedEmails = await db('email_delivery_queue')
        .where('status', 'delivered')
        .where('delivered_at', '<', cutoffDate)
        .del();

      // Limpar emails falhados antigos (manter por mais tempo para debugging)
      const oldFailedCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 dias
      const deletedFailedEmails = await db('email_delivery_queue')
        .where('status', 'failed')
        .where('updated_at', '<', oldFailedCutoff)
        .del();

      // Limpar webhooks antigos
      const deletedWebhooks = await db('webhook_delivery_queue')
        .where('status', 'delivered')
        .where('delivered_at', '<', cutoffDate)
        .del()
        .catch(() => 0); // Tabela pode não existir

      // Limpar analytics processados antigos
      const deletedAnalytics = await db('analytics_processing_queue')
        .where('status', 'completed')
        .where('processed_at', '<', cutoffDate)
        .del()
        .catch(() => 0); // Tabela pode não existir

      // Limpar estatísticas de entrega antigas (por tenant)
      const deletedStats = await db('delivery_stats')
        .where('delivered_at', '<', cutoffDate)
        .orWhere('failed_at', '<', cutoffDate)
        .del()
        .catch(() => 0); // Tabela pode não existir

      logger.info('✅ Tenant-aware queue cleanup completed', {
        deletedEmails,
        deletedFailedEmails,
        deletedWebhooks,
        deletedAnalytics,
        deletedStats
      });

      // Cleanup das filas Redis por tenant
      await this.cleanupTenantQueues();

    } catch (error) {
      logger.error('Error during queue cleanup:', error);
    }
  }

  // 🔥 NOVO MÉTODO: Limpeza das filas Redis tenant-specific
  private async cleanupTenantQueues(): Promise<void> {
    try {
      // Obter lista de tenants ativos para manter suas filas
      const activeTenants = await this.discoverActiveTenants();
      
      logger.debug('🧹 Cleaning up tenant-specific Redis queues', {
        activeTenants: activeTenants.length
      });

      // TODO: Implementar limpeza de filas Redis antigas/órfãs
      // Isso deve ser feito quando TenantQueueManager estiver totalmente implementado

    } catch (error) {
      logger.error('Error cleaning up tenant queues:', error);
    }
  }
}

// Função principal para executar o processador
async function startQueueProcessor(): Promise<void> {
  const processor = new QueueProcessor();

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    logger.info('🔄 Queue Processor received SIGINT, shutting down gracefully...');
    await processor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('🔄 Queue Processor received SIGTERM, shutting down gracefully...');
    await processor.stop();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('🔄 Queue Processor unhandled rejection:', {
      reason,
      promise: promise.toString()
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('🔄 Queue Processor uncaught exception:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  // Iniciar processador
  try {
    await processor.start();
    
    // Manter processo vivo
    process.on('message', (message) => {
      if (message === 'shutdown') {
        processor.stop().then(() => process.exit(0));
      }
    });

  } catch (error) {
    logger.error('🔄 Failed to start Queue Processor:', error);
    process.exit(1);
  }
}

// Executar se este arquivo for chamado diretamente
if (require.main === module) {
  startQueueProcessor().catch((error) => {
    console.error('Failed to start queue processor:', error);
    process.exit(1);
  });
}

export { QueueProcessor, startQueueProcessor };