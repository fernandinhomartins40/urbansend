import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { TenantContextService, TenantContext } from '../services/TenantContextService';
import { TenantQueueManager } from '../services/TenantQueueManager';
import { DomainValidator } from '../services/DomainValidator';
import { MultiDomainDKIMManager } from '../services/MultiDomainDKIMManager';

export interface EmailDeliveryRecord {
  id: number;
  user_id: number;
  message_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body: string;
  headers?: any;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'bounced';
  attempts: number;
  last_attempt?: Date;
  next_attempt?: Date;
  error_message?: string;
  delivered_at?: Date;
  priority: number;
  created_at: Date;
  updated_at: Date;
}

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
  private domainValidator: DomainValidator;
  private dkimManager: MultiDomainDKIMManager;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private activeTenants: Set<number> = new Set();

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
    this.tenantQueueManager = TenantQueueManager.getInstance();
    this.domainValidator = new DomainValidator();
    this.dkimManager = new MultiDomainDKIMManager();
    this.validateRequiredTables();
  }

  private async validateRequiredTables(): Promise<void> {
    try {
      const requiredTables = [
        'email_delivery_queue',
        'users',
        'domains'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await db.schema.hasTable(tableName);
        if (!hasTable) {
          logger.warn(`TenantEmailWorker: Tabela '${tableName}' não encontrada`);
        }
      }
    } catch (error) {
      logger.error('Erro ao validar tabelas do TenantEmailWorker:', error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('📧 Tenant Email Worker já está rodando');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 UltraZend Tenant Email Worker iniciando...', {
      mode: 'Tenant-Isolated Processing',
      environment: Env.get('NODE_ENV'),
      version: '2.0.0-SaaS'
    });

    // Processar emails por tenant a cada 10 segundos
    this.processInterval = setInterval(async () => {
      try {
        await this.processAllTenantEmails();
      } catch (error) {
        logger.error('📧 Erro no processamento de emails por tenant:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }, 10000);

    // Estatísticas por tenant a cada 60 segundos
    this.statsInterval = setInterval(async () => {
      try {
        await this.logTenantStats();
      } catch (error) {
        logger.debug('Erro no log de estatísticas por tenant:', error);
      }
    }, 60000);

    logger.info('✅ Tenant Email Worker iniciado com sucesso', {
      processInterval: '10 seconds',
      statsInterval: '60 seconds',
      tenantIsolation: 'ENABLED'
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

    // Shutdown tenant queue manager
    await this.tenantQueueManager.shutdown();

    logger.info('🛑 Tenant Email Worker parado');
  }

  private async processAllTenantEmails(): Promise<void> {
    try {
      // Obter lista de todos os tenants ativos
      const activeTenants = await this.tenantContextService.getAllTenants();
      
      if (activeTenants.length === 0) {
        logger.debug('📧 Nenhum tenant ativo encontrado');
        return;
      }

      logger.debug(`📧 Processando emails para ${activeTenants.length} tenants`);

      // Processar emails para cada tenant de forma isolada
      const processingPromises = activeTenants.map(tenantId =>
        this.processEmailsForTenant(tenantId).catch(error => {
          logger.error(`Erro ao processar emails do tenant ${tenantId}:`, error);
        })
      );

      await Promise.all(processingPromises);

    } catch (error) {
      logger.error('📧 Erro ao processar emails de todos os tenants:', error);
    }
  }

  private async processEmailsForTenant(tenantId: number): Promise<void> {
    try {
      // Obter contexto do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      
      if (!tenantContext.isActive) {
        logger.debug(`📧 Tenant ${tenantId} não está ativo, pulando processamento`);
        return;
      }

      // Buscar emails pendentes APENAS deste tenant
      const pendingEmails = await this.getPendingEmailsForTenant(tenantId);
      
      if (pendingEmails.length === 0) {
        return;
      }

      logger.info(`📧 Processando ${pendingEmails.length} emails para tenant ${tenantId}`, {
        tenantId,
        pendingCount: pendingEmails.length,
        plan: tenantContext.plan
      });

      // Processar cada email com validação de tenant
      for (const email of pendingEmails) {
        try {
          await this.processEmailWithTenantValidation(email, tenantContext);
        } catch (error) {
          logger.error(`Erro ao processar email ${email.id} do tenant ${tenantId}:`, error);
          await this.markEmailAsFailed(email.id, error);
        }
      }

      this.activeTenants.add(tenantId);

    } catch (error) {
      logger.error(`Erro geral no processamento do tenant ${tenantId}:`, error);
    }
  }

  private async getPendingEmailsForTenant(tenantId: number): Promise<EmailDeliveryRecord[]> {
    try {
      const emails = await db('email_delivery_queue')
        .where('user_id', tenantId)  // 🔥 CRÍTICO: Agora filtra por tenant!
        .where('status', 'pending')
        .whereNull('next_attempt')
        .orWhere(function() {
          this.where('user_id', tenantId)
              .where('status', 'pending')
              .where('next_attempt', '<=', new Date());
        })
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'asc')
        .limit(20); // Limite por tenant

      return emails;

    } catch (error) {
      logger.error(`Erro ao buscar emails pendentes do tenant ${tenantId}:`, error);
      return [];
    }
  }

  private async processEmailWithTenantValidation(
    email: EmailDeliveryRecord, 
    tenantContext: TenantContext
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // 🔒 VALIDAÇÃO CRÍTICA: Verificar se email pertence ao tenant
      if (email.user_id !== tenantContext.userId) {
        throw new Error(`Email ${email.id} não pertence ao tenant ${tenantContext.userId}`);
      }

      // 🔒 VALIDAÇÃO: Verificar se domínio ainda pertence ao tenant
      const fromDomain = this.extractDomain(email.from_address);
      const domainOwned = tenantContext.verifiedDomains.some(
        domain => domain.domainName === fromDomain && domain.isVerified
      );

      if (!domainOwned) {
        throw new Error(`Domínio ${fromDomain} não pertence mais ao tenant ${tenantContext.userId}`);
      }

      // 🔒 VALIDAÇÃO: Verificar rate limits do tenant
      const canSend = await this.tenantContextService.validateTenantOperation(
        tenantContext.userId,
        {
          operation: 'send_email',
          resource: fromDomain,
          metadata: email
        }
      );

      if (!canSend.allowed) {
        throw new Error(`Rate limit excedido: ${canSend.reason}`);
      }

      // Marcar como processando
      await this.markEmailAsProcessing(email.id);

      // Processar email usando serviços tenant-aware
      const result = await this.deliverEmailForTenant(email, tenantContext);

      if (result.success) {
        await this.markEmailAsDelivered(email.id, result);
        logger.info(`📧 Email ${email.id} entregue para tenant ${tenantContext.userId}`, {
          tenantId: tenantContext.userId,
          emailId: email.id,
          to: email.to_address,
          deliveryTime: Date.now() - startTime
        });
      } else {
        throw new Error(result.errorMessage || 'Falha na entrega');
      }

    } catch (error) {
      logger.error(`Falha ao processar email ${email.id} do tenant ${tenantContext.userId}:`, {
        tenantId: tenantContext.userId,
        emailId: email.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  private async deliverEmailForTenant(
    email: EmailDeliveryRecord,
    tenantContext: TenantContext
  ): Promise<{ success: boolean; errorMessage?: string; messageId?: string }> {
    try {
      // Obter configuração DKIM específica do tenant
      const fromDomain = this.extractDomain(email.from_address);
      const dkimConfig = tenantContext.dkimConfigurations.find(
        config => config.domainName === fromDomain && config.isActive
      );

      if (!dkimConfig) {
        throw new Error(`Configuração DKIM não encontrada para domínio ${fromDomain}`);
      }

      // Usar SMTPDeliveryService com configuração do tenant
      const { SMTPDeliveryService } = await import('../services/smtpDelivery');
      const smtpService = new SMTPDeliveryService();

      // Assinar email com DKIM do tenant
      const signedEmail = await this.dkimManager.signEmailForDomain(
        {
          from: email.from_address,
          to: email.to_address,
          subject: email.subject,
          html: email.body,
          messageId: email.message_id
        },
        dkimConfig
      );

      // Entregar email
      const deliveryResult = await smtpService.deliverEmailDirect({
        ...email,
        ...signedEmail
      });

      return {
        success: true,
        messageId: deliveryResult.messageId
      };

    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown delivery error'
      };
    }
  }

  private async markEmailAsProcessing(emailId: number): Promise<void> {
    await db('email_delivery_queue')
      .where('id', emailId)
      .update({
        status: 'processing',
        last_attempt: new Date(),
        attempts: db.raw('attempts + 1'),
        updated_at: new Date()
      });
  }

  private async markEmailAsDelivered(
    emailId: number, 
    result: { messageId?: string }
  ): Promise<void> {
    await db('email_delivery_queue')
      .where('id', emailId)
      .update({
        status: 'delivered',
        delivered_at: new Date(),
        updated_at: new Date(),
        error_message: null,
        next_attempt: null
      });
  }

  private async markEmailAsFailed(emailId: number, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Verificar se deve tentar novamente
    const email = await db('email_delivery_queue')
      .where('id', emailId)
      .first();

    const maxAttempts = 5;
    const shouldRetry = email && email.attempts < maxAttempts;

    if (shouldRetry) {
      // Calcular próxima tentativa com backoff exponencial
      const nextAttempt = new Date(
        Date.now() + Math.pow(2, email.attempts) * 60000 // 2^attempts minutes
      );

      await db('email_delivery_queue')
        .where('id', emailId)
        .update({
          status: 'pending',
          error_message: errorMessage,
          next_attempt: nextAttempt,
          updated_at: new Date()
        });

      logger.info(`📧 Email ${emailId} agendado para retry`, {
        emailId,
        attempt: email.attempts + 1,
        nextAttempt,
        error: errorMessage
      });

    } else {
      // Marcar como falha permanente
      await db('email_delivery_queue')
        .where('id', emailId)
        .update({
          status: 'failed',
          error_message: errorMessage,
          next_attempt: null,
          updated_at: new Date()
        });

      logger.warn(`📧 Email ${emailId} falhou permanentemente`, {
        emailId,
        attempts: email?.attempts || 0,
        error: errorMessage
      });
    }
  }

  private async logTenantStats(): Promise<void> {
    try {
      const tenantMetrics: TenantEmailMetrics[] = [];

      for (const tenantId of this.activeTenants) {
        try {
          const metrics = await this.getTenantEmailMetrics(tenantId);
          tenantMetrics.push(metrics);
        } catch (error) {
          logger.debug(`Erro ao obter métricas do tenant ${tenantId}:`, error);
        }
      }

      if (tenantMetrics.length > 0) {
        logger.info('📊 Estatísticas de Email por Tenant', {
          totalTenants: tenantMetrics.length,
          metrics: tenantMetrics.map(m => ({
            tenantId: m.tenantId,
            processed: m.processed,
            delivered: m.delivered,
            failed: m.failed
          }))
        });

        // Alertas por tenant
        for (const metric of tenantMetrics) {
          const failureRate = metric.processed > 0 ? 
            (metric.failed / metric.processed) * 100 : 0;

          if (failureRate > 10) { // Mais de 10% de falha
            logger.warn(`🚨 Alta taxa de falha para tenant ${metric.tenantId}`, {
              tenantId: metric.tenantId,
              failureRate: failureRate.toFixed(2),
              failed: metric.failed,
              processed: metric.processed
            });
          }
        }
      }

      // Limpar tenants inativos
      this.activeTenants.clear();

    } catch (error) {
      logger.debug('Erro ao registrar estatísticas por tenant:', error);
    }
  }

  private async getTenantEmailMetrics(tenantId: number): Promise<TenantEmailMetrics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [delivered, failed, bounced, processed] = await Promise.all([
      db('email_delivery_queue')
        .where('user_id', tenantId)
        .where('status', 'delivered')
        .where('updated_at', '>=', today)
        .count('* as count')
        .first(),
      
      db('email_delivery_queue')
        .where('user_id', tenantId)
        .where('status', 'failed')
        .where('updated_at', '>=', today)
        .count('* as count')
        .first(),
      
      db('email_delivery_queue')
        .where('user_id', tenantId)
        .where('status', 'bounced')
        .where('updated_at', '>=', today)
        .count('* as count')
        .first(),
      
      db('email_delivery_queue')
        .where('user_id', tenantId)
        .whereIn('status', ['delivered', 'failed', 'bounced'])
        .where('updated_at', '>=', today)
        .count('* as count')
        .first()
    ]);

    return {
      tenantId,
      delivered: parseInt(String(delivered?.count || 0)),
      failed: parseInt(String(failed?.count || 0)),
      bounced: parseInt(String(bounced?.count || 0)),
      processed: parseInt(String(processed?.count || 0)),
      lastProcessed: new Date()
    };
  }

  private extractDomain(email: string): string {
    return email.split('@')[1] || '';
  }

  // Métodos públicos para controle por tenant
  async pauseTenant(tenantId: number): Promise<void> {
    await this.tenantQueueManager.pauseTenantQueues(tenantId);
    logger.info(`📧 Processamento pausado para tenant ${tenantId}`);
  }

  async resumeTenant(tenantId: number): Promise<void> {
    await this.tenantQueueManager.resumeTenantQueues(tenantId);
    logger.info(`📧 Processamento retomado para tenant ${tenantId}`);
  }

  async getTenantStats(tenantId: number): Promise<TenantEmailMetrics> {
    return await this.getTenantEmailMetrics(tenantId);
  }

  // 🧪 MÉTODO ESPECÍFICO PARA TESTES - Retorna emails processados
  public async processEmailsForTenantTest(tenantId: number): Promise<EmailDeliveryRecord[]> {
    try {
      logger.info(`🧪 [TESTE] Processando emails para tenant ${tenantId}`, { tenantId });

      // Obter contexto do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      
      if (!tenantContext.isActive) {
        logger.warn(`Tenant ${tenantId} está inativo, ignorando processamento`, { tenantId });
        return [];
      }

      // Buscar emails pendentes APENAS deste tenant
      const pendingEmails = await db('email_delivery_queue')
        .where('user_id', tenantId) // 🔥 ISOLAMENTO POR TENANT
        .where('status', 'pending')
        .orderBy('created_at', 'asc')
        .limit(20) as EmailDeliveryRecord[];

      logger.info(`🧪 [TESTE] Encontrados ${pendingEmails.length} emails pendentes para tenant ${tenantId}`, {
        tenantId,
        emailCount: pendingEmails.length
      });

      // Processar cada email (simulação para testes)
      for (const email of pendingEmails) {
        try {
          // Validar que o email pertence ao tenant correto
          if (email.user_id !== tenantId) {
            throw new Error(`Email ${email.id} não pertence ao tenant ${tenantId}`);
          }

          // Para testes, apenas marcar como processado
          await db('email_delivery_queue')
            .where('id', email.id)
            .update({
              status: 'processing',
              last_attempt: new Date(),
              updated_at: new Date()
            });

          logger.info(`🧪 [TESTE] Email ${email.id} processado para tenant ${tenantId}`, {
            tenantId,
            emailId: email.id,
            from: email.from_address,
            to: email.to_address
          });

        } catch (error) {
          logger.error(`🧪 [TESTE] Falha ao processar email ${email.id} para tenant ${tenantId}:`, {
            tenantId,
            emailId: email.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return pendingEmails;

    } catch (error) {
      logger.error(`🧪 [TESTE] Falha no processamento de emails para tenant ${tenantId}:`, {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
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