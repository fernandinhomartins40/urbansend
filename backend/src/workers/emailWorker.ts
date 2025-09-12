import { logger } from '../config/logger';
import { Env } from '../utils/env';
import { TenantContextService } from '../services/TenantContextService';
import { TenantAwareQueueService } from '../services/TenantAwareQueueService';

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
  private queueService: TenantAwareQueueService;
  private isRunning: boolean = false;
  private statsInterval: NodeJS.Timeout | null = null;
  private activeTenants: Set<number> = new Set();

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
    this.queueService = new TenantAwareQueueService();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('📧 Tenant Email Worker Bull já está rodando');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 UltraZend TenantAware Email Worker iniciando...', {
      mode: 'Unified Queue Architecture',
      environment: Env.get('NODE_ENV'),
      version: '4.0.0-Unified-SaaS'
    });

    try {
      // Inicializar arquitetura unificada
      // Workers são automaticamente inicializados no TenantAwareQueueService
      logger.info('✅ TenantAwareQueueService iniciado - arquitetura unificada ativa');

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

    // Shutdown unified queue service
    await this.queueService.shutdown();

    logger.info('🛑 Tenant Email Worker Bull parado');
  }

  /**
   * Log estatísticas da fila global unificada
   */
  private async logQueueStats(): Promise<void> {
    try {
      const activeTenants = await this.tenantContextService.getAllTenants();
      
      if (activeTenants.length === 0) {
        return;
      }

      // Obter estatísticas da fila unificada
      const globalStats = await this.queueService.getQueueStats();

      logger.info('📊 Unified Queue Stats', {
        architecture: 'TenantAware',
        totalTenants: activeTenants.length,
        globalQueue: {
          waiting: globalStats.waiting,
          active: globalStats.active,
          completed: globalStats.completed,
          failed: globalStats.failed
        }
      });

    } catch (error) {
      logger.debug('Erro no log de estatísticas da fila unificada:', error);
    }
  }

  // Métodos públicos para controle via arquitetura unificada
  async getGlobalStats(): Promise<any> {
    return await this.queueService.getQueueStats();
  }

  async getTenantStats(tenantId: number): Promise<any> {
    // Retorna estatísticas globais com contexto do tenant
    const globalStats = await this.queueService.getQueueStats();
    return {
      tenantId,
      globalQueue: globalStats,
      architecture: 'unified'
    };
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