import Bull, { Queue, Job } from 'bull';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import { TenantContextService, TenantContext } from './TenantContextService';

export interface TenantQueueOptions {
  concurrency?: number;
  attempts?: number;
  backoff?: {
    type: string;
    delay: number;
  };
  removeOnComplete?: number;
  removeOnFail?: number;
  delay?: number;
}

export interface TenantJobData {
  tenantId: number;
  jobId: string;
  createdAt: Date;
  metadata?: any;
}

export interface EmailJobData extends TenantJobData {
  emailId: number;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  priority: number;
}

export interface WebhookJobData extends TenantJobData {
  url: string;
  method: string;
  payload: any;
  headers?: Record<string, string>;
  eventType: string;
  entityId: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface AnalyticsJobData extends TenantJobData {
  eventType: string;
  entityId: number;
  entityType: string;
  eventData: any;
  timestamp: Date;
}

export class TenantQueueManager {
  private static instance: TenantQueueManager;
  private tenantContextService: TenantContextService;
  private queues: Map<string, Queue> = new Map();
  private processors: Map<string, any> = new Map();
  private redisConfig: any;

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
    this.redisConfig = {
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getNumber('REDIS_PORT', 6379),
      password: Env.get('REDIS_PASSWORD'),
      db: Env.getNumber('REDIS_DB', 0),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 3
    };

    this.setupGlobalQueues();
  }

  public static getInstance(): TenantQueueManager {
    if (!TenantQueueManager.instance) {
      TenantQueueManager.instance = new TenantQueueManager();
    }
    return TenantQueueManager.instance;
  }

  private setupGlobalQueues(): void {
    // Configurar filas globais para operações de sistema
    this.createQueue('system-maintenance', {
      concurrency: 1,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 50
    });

    this.createQueue('domain-verification', {
      concurrency: 5,
      attempts: 2,
      removeOnComplete: 50,
      removeOnFail: 25
    });

    logger.info('TenantQueueManager: Filas globais configuradas');
  }

  private createQueue(queueName: string, options: TenantQueueOptions = {}): Queue {
    const queue = new Bull(queueName, {
      redis: this.redisConfig,
      defaultJobOptions: {
        attempts: options.attempts || 3,
        backoff: options.backoff || {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: options.removeOnComplete || 10,
        removeOnFail: options.removeOnFail || 5,
        delay: options.delay || 0
      }
    });

    this.queues.set(queueName, queue);

    // Event handlers
    queue.on('error', (error) => {
      logger.error(`Queue error on ${queueName}:`, error);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job stalled on queue ${queueName}:`, {
        jobId: job.id,
        data: job.data
      });
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job failed on queue ${queueName}:`, {
        jobId: job.id,
        error: err.message,
        data: job.data
      });
    });

    return queue;
  }

  getQueueForTenant(userId: number, queueType: string): Queue {
    const queueName = this.getTenantQueueName(userId, queueType);
    
    if (!this.queues.has(queueName)) {
      this.createTenantQueue(userId, queueType);
    }

    return this.queues.get(queueName)!;
  }

  private getTenantQueueName(userId: number, queueType: string): string {
    // Implementar particionamento inteligente se necessário
    // Por enquanto, uma fila por tenant por tipo
    return `${queueType}:tenant:${userId}`;
  }

  private createTenantQueue(userId: number, queueType: string): Queue {
    const queueName = this.getTenantQueueName(userId, queueType);
    
    const options = this.getQueueOptionsForType(queueType);
    const queue = this.createQueue(queueName, options);

    // Configurar processador específico para o tipo de fila
    this.setupQueueProcessor(queue, queueType);

    logger.info(`Tenant queue created: ${queueName}`, {
      tenantId: userId,
      queueType,
      options
    });

    return queue;
  }

  private getQueueOptionsForType(queueType: string): TenantQueueOptions {
    const optionsMap: Record<string, TenantQueueOptions> = {
      'email-processing': {
        concurrency: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 50,
        removeOnFail: 25
      },
      'webhook-delivery': {
        concurrency: 3,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 25,
        removeOnFail: 15
      },
      'analytics-processing': {
        concurrency: 10,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: 100,
        removeOnFail: 50
      },
      'domain-verification': {
        concurrency: 2,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000
        },
        removeOnComplete: 20,
        removeOnFail: 10
      }
    };

    return optionsMap[queueType] || {
      concurrency: 3,
      attempts: 3,
      removeOnComplete: 25,
      removeOnFail: 10
    };
  }

  private setupQueueProcessor(queue: Queue, queueType: string): void {
    const options = this.getQueueOptionsForType(queueType);

    switch (queueType) {
      case 'email-processing':
        queue.process(options.concurrency || 5, async (job: Job<EmailJobData>) => {
          return await this.processEmailJob(job);
        });
        break;

      case 'webhook-delivery':
        queue.process(options.concurrency || 3, async (job: Job<WebhookJobData>) => {
          return await this.processWebhookJob(job);
        });
        break;

      case 'analytics-processing':
        queue.process(options.concurrency || 10, async (job: Job<AnalyticsJobData>) => {
          return await this.processAnalyticsJob(job);
        });
        break;

      case 'domain-verification':
        queue.process(options.concurrency || 2, async (job: Job) => {
          return await this.processDomainVerificationJob(job);
        });
        break;

      default:
        logger.warn(`No processor defined for queue type: ${queueType}`);
    }
  }

  private async processEmailJob(job: Job<EmailJobData>): Promise<any> {
    const { tenantId, emailId } = job.data;

    try {
      // Validar contexto do tenant
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      if (!context.isActive) {
        throw new Error('Tenant não está ativo');
      }

      // Validar operação de envio
      const validation = await this.tenantContextService.validateTenantOperation(
        tenantId,
        {
          operation: 'send_email',
          resource: this.extractDomain(job.data.from),
          metadata: job.data
        }
      );

      if (!validation.allowed) {
        throw new Error(`Email sending not allowed: ${validation.reason}`);
      }

      // Importar e usar EmailProcessor de forma tenant-aware
      const { TenantEmailProcessor } = await import('./TenantEmailProcessor');
      const emailProcessor = new TenantEmailProcessor(context);
      
      const result = await emailProcessor.processEmail(job.data);

      logger.info('Email job processed successfully', {
        tenantId,
        emailId,
        jobId: job.id,
        to: job.data.to
      });

      return result;

    } catch (error) {
      logger.error('Email job processing failed', {
        tenantId,
        emailId,
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  private async processWebhookJob(job: Job<WebhookJobData>): Promise<any> {
    const { tenantId } = job.data;

    try {
      // Validar contexto do tenant
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      if (!context.isActive) {
        throw new Error('Tenant não está ativo');
      }

      // Importar e usar WebhookProcessor de forma tenant-aware
      const { TenantWebhookProcessor } = await import('./TenantWebhookProcessor');
      const webhookProcessor = new TenantWebhookProcessor(context);
      
      const result = await webhookProcessor.processWebhook(job.data);

      logger.info('Webhook job processed successfully', {
        tenantId,
        jobId: job.id,
        url: job.data.url,
        eventType: job.data.eventType
      });

      return result;

    } catch (error) {
      logger.error('Webhook job processing failed', {
        tenantId,
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  private async processAnalyticsJob(job: Job<AnalyticsJobData>): Promise<any> {
    const { tenantId } = job.data;

    try {
      // Validar contexto do tenant
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      if (!context.isActive) {
        throw new Error('Tenant não está ativo');
      }

      // Importar e usar AnalyticsProcessor de forma tenant-aware
      const { TenantAnalyticsProcessor } = await import('./TenantAnalyticsProcessor');
      const analyticsProcessor = new TenantAnalyticsProcessor(context);
      
      const result = await analyticsProcessor.processAnalytics(job.data);

      logger.debug('Analytics job processed successfully', {
        tenantId,
        jobId: job.id,
        eventType: job.data.eventType
      });

      return result;

    } catch (error) {
      logger.error('Analytics job processing failed', {
        tenantId,
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  private async processDomainVerificationJob(job: Job): Promise<any> {
    // Para jobs de verificação de domínio, usar o processador existente
    const { domainVerificationJob } = await import('../jobs/domainVerificationJob');
    return await domainVerificationJob.processDomainVerificationJob(job);
  }

  // Métodos públicos para adicionar jobs
  async addEmailJob(tenantId: number, jobData: Omit<EmailJobData, 'tenantId' | 'createdAt'>): Promise<Job<EmailJobData>> {
    // Validar tenant primeiro
    const context = await this.tenantContextService.getTenantContext(tenantId);
    
    if (!context.isActive) {
      throw new Error('Tenant não está ativo');
    }

    const queue = this.getQueueForTenant(tenantId, 'email-processing');
    
    const fullJobData: EmailJobData = {
      ...jobData,
      tenantId,
      createdAt: new Date()
    };

    const job = await queue.add(fullJobData, {
      priority: jobData.priority || 0,
      delay: 0
    });

    logger.info('Email job added to tenant queue', {
      tenantId,
      jobId: job.id,
      to: jobData.to
    });

    return job;
  }

  async addWebhookJob(tenantId: number, jobData: Omit<WebhookJobData, 'tenantId' | 'createdAt'>): Promise<Job<WebhookJobData>> {
    // Validar tenant primeiro
    const context = await this.tenantContextService.getTenantContext(tenantId);
    
    if (!context.isActive) {
      throw new Error('Tenant não está ativo');
    }

    const queue = this.getQueueForTenant(tenantId, 'webhook-delivery');
    
    const fullJobData: WebhookJobData = {
      ...jobData,
      tenantId,
      createdAt: new Date()
    };

    const job = await queue.add(fullJobData, {
      attempts: jobData.maxRetries || 5,
      delay: 0
    });

    logger.info('Webhook job added to tenant queue', {
      tenantId,
      jobId: job.id,
      url: jobData.url,
      eventType: jobData.eventType
    });

    return job;
  }

  async addAnalyticsJob(tenantId: number, jobData: Omit<AnalyticsJobData, 'tenantId' | 'createdAt'>): Promise<Job<AnalyticsJobData>> {
    const queue = this.getQueueForTenant(tenantId, 'analytics-processing');
    
    const fullJobData: AnalyticsJobData = {
      ...jobData,
      tenantId,
      createdAt: new Date()
    };

    const job = await queue.add(fullJobData, {
      delay: 0
    });

    logger.debug('Analytics job added to tenant queue', {
      tenantId,
      jobId: job.id,
      eventType: jobData.eventType
    });

    return job;
  }

  // Métodos para obter estatísticas das filas por tenant
  async getTenantQueueStats(tenantId: number): Promise<any> {
    const queueTypes = ['email-processing', 'webhook-delivery', 'analytics-processing'];
    const stats: any = {
      tenantId,
      queues: {}
    };

    for (const queueType of queueTypes) {
      const queueName = this.getTenantQueueName(tenantId, queueType);
      
      if (this.queues.has(queueName)) {
        const queue = this.queues.get(queueName)!;
        
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed()
        ]);

        stats.queues[queueType] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length
        };
      } else {
        stats.queues[queueType] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0
        };
      }
    }

    return stats;
  }

  async pauseTenantQueues(tenantId: number): Promise<void> {
    const queueTypes = ['email-processing', 'webhook-delivery', 'analytics-processing'];
    
    for (const queueType of queueTypes) {
      const queueName = this.getTenantQueueName(tenantId, queueType);
      
      if (this.queues.has(queueName)) {
        const queue = this.queues.get(queueName)!;
        await queue.pause();
        logger.info(`Queue paused: ${queueName}`, { tenantId });
      }
    }
  }

  async resumeTenantQueues(tenantId: number): Promise<void> {
    const queueTypes = ['email-processing', 'webhook-delivery', 'analytics-processing'];
    
    for (const queueType of queueTypes) {
      const queueName = this.getTenantQueueName(tenantId, queueType);
      
      if (this.queues.has(queueName)) {
        const queue = this.queues.get(queueName)!;
        await queue.resume();
        logger.info(`Queue resumed: ${queueName}`, { tenantId });
      }
    }
  }

  async cleanupTenantQueues(tenantId: number): Promise<void> {
    const queueTypes = ['email-processing', 'webhook-delivery', 'analytics-processing'];
    
    for (const queueType of queueTypes) {
      const queueName = this.getTenantQueueName(tenantId, queueType);
      
      if (this.queues.has(queueName)) {
        const queue = this.queues.get(queueName)!;
        
        // Limpar jobs completados e falhos antigos
        await queue.clean(24 * 60 * 60 * 1000, 'completed', 10); // 24h, manter 10
        await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed', 5); // 7 dias, manter 5
        
        logger.info(`Queue cleaned: ${queueName}`, { tenantId });
      }
    }
  }

  private extractDomain(email: string): string {
    return email.split('@')[1] || '';
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down TenantQueueManager...');
    
    const shutdownPromises = Array.from(this.queues.values()).map(queue => 
      queue.close()
    );

    await Promise.all(shutdownPromises);
    this.queues.clear();
    
    logger.info('TenantQueueManager shutdown completed');
  }
}

// Export singleton instance
export const tenantQueueManager = TenantQueueManager.getInstance();