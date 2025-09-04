import { QueueService } from '../services/queueService';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';

class QueueProcessor {
  private queueService: QueueService;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.queueService = new QueueService();
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
      await this.queueService.close();
    } catch (error) {
      logger.error('Error closing queue service:', error);
    }

    logger.info('🛑 UltraZend Queue Processor stopped');
  }

  private async processAllQueues(): Promise<void> {
    try {
      const stats = await this.queueService.getQueueStats();

      // Processar fila de emails
      if (stats.email.waiting > 0) {
        logger.debug('🔄 Processing email queue', {
          waiting: stats.email.waiting,
          active: stats.email.active
        });
        await this.processEmailQueue();
      }

      // Processar fila de webhooks
      if (stats.webhook.waiting > 0) {
        logger.debug('🔗 Processing webhook queue', {
          waiting: stats.webhook.waiting,
          active: stats.webhook.active
        });
        await this.processWebhookQueue();
      }

      // Processar fila de analytics
      if (stats.analytics.waiting > 0) {
        logger.debug('📊 Processing analytics queue', {
          waiting: stats.analytics.waiting,
          active: stats.analytics.active
        });
        await this.processAnalyticsQueue();
      }

      // Verificar saúde das filas
      const health = await this.queueService.getHealth();
      if (!health.healthy) {
        logger.warn('🚨 Queue health issues detected', { health });
        await this.handleUnhealthyQueues();
      }

    } catch (error) {
      logger.error('Error processing queues:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processEmailQueue(): Promise<void> {
    try {
      // Buscar emails pendentes diretamente do banco
      const pendingEmails = await db('email_delivery_queue')
        .where('status', 'pending')
        .whereNull('next_attempt')
        .orWhere('next_attempt', '<=', new Date())
        .orderBy('created_at', 'asc')
        .limit(20); // Processar até 20 por vez

      if (pendingEmails.length === 0) {
        return;
      }

      logger.info('📧 Processing pending emails from database', {
        count: pendingEmails.length
      });

      const { SMTPDeliveryService } = await import('../services/smtpDelivery');
      const smtpService = new SMTPDeliveryService();

      for (const emailRecord of pendingEmails) {
        try {
          // Marcar como em processamento
          await db('email_delivery_queue')
            .where('id', emailRecord.id)
            .update({
              status: 'processing',
              last_attempt: new Date(),
              updated_at: new Date()
            });

          // Processar email
          const emailData = {
            from: emailRecord.from_address,
            to: emailRecord.to_address,
            subject: emailRecord.subject,
            html: emailRecord.body,
            text: emailRecord.body,
            headers: emailRecord.headers ? JSON.parse(emailRecord.headers) : {}
          };

          const success = await smtpService.deliverEmail(emailData);

          if (success) {
            // Marcar como entregue
            await db('email_delivery_queue')
              .where('id', emailRecord.id)
              .update({
                status: 'delivered',
                delivered_at: new Date(),
                updated_at: new Date()
              });

            logger.info('✅ Email delivered successfully via UltraZend SMTP', {
              id: emailRecord.id,
              to: emailRecord.to_address
            });
          } else {
            throw new Error('Delivery failed without specific error');
          }

        } catch (error) {
          const attempts = (emailRecord.attempts || 0) + 1;
          const maxAttempts = 5;

          logger.warn('❌ Email delivery failed', {
            id: emailRecord.id,
            to: emailRecord.to_address,
            attempts,
            maxAttempts,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          if (attempts >= maxAttempts) {
            // Marcar como falhado definitivamente
            await db('email_delivery_queue')
              .where('id', emailRecord.id)
              .update({
                status: 'failed',
                attempts,
                error_message: error instanceof Error ? error.message : 'Unknown error',
                updated_at: new Date()
              });
          } else {
            // Agendar próxima tentativa (backoff exponencial)
            const nextAttempt = new Date(Date.now() + Math.pow(2, attempts) * 60000); // 2^attempts minutos
            
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
      }

    } catch (error) {
      logger.error('Error processing email queue:', error);
    }
  }

  private async processWebhookQueue(): Promise<void> {
    // Implementar processamento de webhooks se necessário
    logger.debug('📡 Webhook queue processing - not implemented yet');
  }

  private async processAnalyticsQueue(): Promise<void> {
    // Implementar processamento de analytics se necessário
    logger.debug('📊 Analytics queue processing - not implemented yet');
  }

  private async handleUnhealthyQueues(): Promise<void> {
    try {
      logger.warn('🔧 Attempting to restore queue health...');
      
      // Tentar resumir filas pausadas
      await this.queueService.resumeQueues();
      
      // Limpar jobs presos há muito tempo
      const stalledJobs = await db('email_delivery_queue')
        .where('status', 'processing')
        .where('last_attempt', '<', new Date(Date.now() - 10 * 60 * 1000)) // 10 minutos atrás
        .update({
          status: 'pending',
          next_attempt: new Date(Date.now() + 60000) // Retry em 1 minuto
        });

      if (stalledJobs > 0) {
        logger.info('🔄 Reset stalled jobs', { count: stalledJobs });
      }

    } catch (error) {
      logger.error('Error handling unhealthy queues:', error);
    }
  }

  private async performQueueCleanup(): Promise<void> {
    try {
      logger.info('🧹 Performing queue cleanup...');

      // Limpar jobs completados antigos (mais de 24h)
      const cleanupResult = await this.queueService.cleanQueues();
      
      // Limpar registros de entrega antigos (mais de 30 dias)
      const deletedStats = await db('delivery_stats')
        .where('delivered_at', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .orWhere('failed_at', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .del();

      logger.info('✅ Queue cleanup completed', {
        deletedStats
      });

    } catch (error) {
      logger.error('Error during queue cleanup:', error);
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