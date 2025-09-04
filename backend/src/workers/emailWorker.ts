import { QueueService } from '../services/queueService';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';

class EmailWorker {
  private queueService: QueueService;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.queueService = new QueueService();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('📧 Email Worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 UltraZend Email Worker starting...', {
      mode: 'Direct MX Delivery',
      postfixEnabled: false,
      environment: Env.get('NODE_ENV'),
      version: '1.0.0'
    });

    // Processar fila de emails a cada 5 segundos
    this.processInterval = setInterval(async () => {
      try {
        await this.processEmailQueue();
      } catch (error) {
        logger.error('📧 Email Worker processing error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }, 5000);

    // Estatísticas a cada 30 segundos
    this.statsInterval = setInterval(async () => {
      try {
        await this.logQueueStats();
      } catch (error) {
        logger.debug('Stats logging error:', error);
      }
    }, 30000);

    logger.info('✅ UltraZend Email Worker started successfully', {
      processInterval: '5 seconds',
      statsInterval: '30 seconds'
    });
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

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    logger.info('🛑 UltraZend Email Worker stopped');
  }

  private async processEmailQueue(): Promise<void> {
    try {
      const stats = await this.queueService.getQueueStats();
      
      if (stats.email.waiting > 0) {
        logger.info('📧 Processing emails in queue', {
          waiting: stats.email.waiting,
          active: stats.email.active,
          failed: stats.email.failed
        });

        // O QueueService já tem processadores configurados
        // Este worker apenas monitora e força processamento se necessário
        if (stats.email.active === 0 && stats.email.waiting > 0) {
          logger.info('🔄 Queue stalled, forcing processing...');
          // Forçar processamento manual se a fila estiver travada
          await this.forceQueueProcessing();
        }
      }

      // Verificar emails falhados para retry
      if (stats.email.failed > 0) {
        logger.info('♻️ Checking failed emails for retry', {
          failedCount: stats.email.failed
        });
        await this.retryFailedEmails();
      }

    } catch (error) {
      logger.error('📧 Error processing email queue:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async forceQueueProcessing(): Promise<void> {
    try {
      // Usar método do SMTPDeliveryService para processar fila manualmente
      const { SMTPDeliveryService } = await import('../services/smtpDelivery');
      const smtpService = new SMTPDeliveryService();
      await smtpService.processEmailQueue();
    } catch (error) {
      logger.error('Failed to force queue processing:', error);
    }
  }

  private async retryFailedEmails(): Promise<void> {
    try {
      // Buscar emails falhados recentes (últimas 2 horas)
      const recentFailed = await db('email_delivery_queue')
        .where('status', 'failed')
        .where('attempts', '<', 5)  // Máximo 5 tentativas
        .where('created_at', '>', new Date(Date.now() - 2 * 60 * 60 * 1000)) // Últimas 2h
        .limit(10); // Processar até 10 por vez

      for (const email of recentFailed) {
        try {
          logger.info('♻️ Retrying failed email', {
            id: email.id,
            to: email.to_address,
            attempts: email.attempts
          });

          // Marcar como pending para retry
          await db('email_delivery_queue')
            .where('id', email.id)
            .update({
              status: 'pending',
              next_attempt: new Date(Date.now() + 60000), // Retry em 1 minuto
              updated_at: new Date()
            });

        } catch (error) {
          logger.error('Failed to retry email:', { emailId: email.id, error });
        }
      }

    } catch (error) {
      logger.error('Error retrying failed emails:', error);
    }
  }

  private async logQueueStats(): Promise<void> {
    try {
      const stats = await this.queueService.getQueueStats();
      const health = await this.queueService.getHealth();

      logger.info('📊 UltraZend Queue Statistics', {
        email: {
          waiting: stats.email.waiting,
          active: stats.email.active,
          completed: stats.email.completed,
          failed: stats.email.failed,
          paused: stats.email.paused
        },
        webhook: {
          waiting: stats.webhook.waiting,
          active: stats.webhook.active
        },
        analytics: {
          waiting: stats.analytics.waiting,
          active: stats.analytics.active
        },
        healthy: health.healthy
      });

      // Alertas se necessário
      if (!health.healthy) {
        logger.warn('🚨 Queue health check failed!', { health });
      }

      if (stats.email.failed > 50) {
        logger.warn('🚨 High number of failed emails detected!', {
          failedCount: stats.email.failed
        });
      }

    } catch (error) {
      logger.debug('Error logging queue stats:', error);
    }
  }
}

// Função principal para executar o worker
async function startEmailWorker(): Promise<void> {
  const worker = new EmailWorker();

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    logger.info('📧 Email Worker received SIGINT, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('📧 Email Worker received SIGTERM, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('📧 Email Worker unhandled rejection:', {
      reason,
      promise: promise.toString()
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('📧 Email Worker uncaught exception:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  // Iniciar worker
  try {
    await worker.start();
    
    // Manter processo vivo
    process.on('message', (message) => {
      if (message === 'shutdown') {
        worker.stop().then(() => process.exit(0));
      }
    });

  } catch (error) {
    logger.error('📧 Failed to start Email Worker:', error);
    process.exit(1);
  }
}

// Executar se este arquivo for chamado diretamente
if (require.main === module) {
  startEmailWorker().catch((error) => {
    console.error('Failed to start email worker:', error);
    process.exit(1);
  });
}

export { EmailWorker, startEmailWorker };