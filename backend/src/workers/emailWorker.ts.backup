import { logger } from '../config/logger';
import { Env } from '../utils/env';
import { TenantContextService } from '../services/TenantContextService';
import { TenantQueueManager } from '../services/TenantQueueManager';

export interface TenantEmailMetrics {
  tenantId: number;
  processed: number;
  delivered: number;
  failed: number;
  bounced: number;
  lastProcessed?: Date;
}

class TenantEmailWorker {
  private tenantContextService: TenantContextService;
  private tenantQueueManager: TenantQueueManager;
  private isRunning: boolean = false;
  private statsInterval: NodeJS.Timeout | null = null;
  private activeTenants: Set<number> = new Set();

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
    this.tenantQueueManager = TenantQueueManager.getInstance();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('📧 Tenant Email Worker Bull já está rodando');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 UltraZend Tenant Email Worker Bull iniciando...', {
      mode: 'Bull Queue Processing',
      environment: Env.get('NODE_ENV'),
      version: '3.0.0-Bull-SaaS'
    });

    try {
      // Inicializar tenant queue manager
      // As filas são criadas automaticamente quando jobs são adicionados
      logger.info('✅ TenantQueueManager iniciado - filas serão criadas dinamicamente');

      // Estatísticas das filas a cada 60 segundos
      this.statsInterval = setInterval(async () => {
        try {
          await this.logQueueStats();
        } catch (error) {
          logger.debug('Erro no log de estatísticas das filas:', error);
        }
      }, 60000);

      logger.info('✅ Tenant Email Worker Bull iniciado com sucesso', {
        queueSystem: 'Bull/Redis',
        statsInterval: '60 seconds',
        tenantIsolation: 'ENABLED'
      });

    } catch (error) {
      this.isRunning = false;
      logger.error('❌ Falha ao iniciar Tenant Email Worker Bull:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    // Shutdown tenant queue manager
    await this.tenantQueueManager.shutdown();

    logger.info('🛑 Tenant Email Worker Bull parado');
  }

  /**
   * Log estatísticas das filas Bull por tenant
   */
  private async logQueueStats(): Promise<void> {
    try {
      const activeTenants = await this.tenantContextService.getAllTenants();
      
      if (activeTenants.length === 0) {
        return;
      }

      const tenantStats = [];

      for (const tenantId of activeTenants) {
        try {
          const stats = await this.tenantQueueManager.getTenantQueueStats(tenantId);
          tenantStats.push(stats);
          this.activeTenants.add(tenantId);
        } catch (error) {
          logger.debug(`Erro ao obter stats do tenant ${tenantId}:`, error);
        }
      }

      if (tenantStats.length > 0) {
        logger.info('📊 Bull Queue Stats por Tenant', {
          totalTenants: tenantStats.length,
          stats: tenantStats.map(s => ({
            tenantId: s.tenantId,
            emailQueue: s.queues['email-processing'],
            webhookQueue: s.queues['webhook-delivery'],
            analyticsQueue: s.queues['analytics-processing']
          }))
        });
      }

      // Limpar tenants antigos
      this.activeTenants.clear();

    } catch (error) {
      logger.debug('Erro no log de estatísticas das filas Bull:', error);
    }
  }

  // Métodos públicos para controle por tenant via Bull queues
  async pauseTenant(tenantId: number): Promise<void> {
    await this.tenantQueueManager.pauseTenantQueues(tenantId);
    logger.info(`📧 Filas Bull pausadas para tenant ${tenantId}`);
  }

  async resumeTenant(tenantId: number): Promise<void> {
    await this.tenantQueueManager.resumeTenantQueues(tenantId);
    logger.info(`📧 Filas Bull retomadas para tenant ${tenantId}`);
  }

  async getTenantStats(tenantId: number): Promise<any> {
    return await this.tenantQueueManager.getTenantQueueStats(tenantId);
  }

  async cleanupTenant(tenantId: number): Promise<void> {
    await this.tenantQueueManager.cleanupTenantQueues(tenantId);
    logger.info(`📧 Filas Bull limpas para tenant ${tenantId}`);
  }
}

// Função principal para executar o worker
async function startTenantEmailWorker(): Promise<void> {
  const worker = new TenantEmailWorker();

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    logger.info('📧 Tenant Email Worker recebeu SIGINT, parando gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('📧 Tenant Email Worker recebeu SIGTERM, parando gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('📧 Tenant Email Worker unhandled rejection:', {
      reason,
      promise: promise.toString()
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('📧 Tenant Email Worker uncaught exception:', {
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
    logger.error('📧 Falha ao iniciar Tenant Email Worker:', error);
    process.exit(1);
  }
}

// Executar se este arquivo for chamado diretamente
if (require.main === module) {
  startTenantEmailWorker().catch((error) => {
    console.error('Failed to start tenant email worker:', error);
    process.exit(1);
  });
}

export { TenantEmailWorker, startTenantEmailWorker };
// Alias para compatibilidade com testes
export { TenantEmailWorker as EmailWorker };