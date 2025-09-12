// @ts-nocheck - Disable strict type checks temporarily for legacy code
import Bull, { Queue, Job, JobOptions } from 'bull';
import { logger } from '../config/optimizedLogger';
import { logQueueProcessing, logOperationScope } from '../utils/smartLoggingReplacements';
import { Env } from '../utils/env';
import db from '../config/database';
import { EmailService } from './emailService';
import { WebhookService } from './webhookService';
import { AnalyticsService } from './analyticsService';
import { SMTPDeliveryService } from './smtpDelivery';
import { optimizedBulkProcessor } from './optimizedBulkProcessor';

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    lazyConnect: boolean;
  };
  defaultJobOptions: JobOptions;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface EmailJobData {
  emailId?: number;
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: any[];
  priority?: number;
  delay?: number;
  userId?: number;
  campaignId?: number;
  templateId?: number;
  metadata?: any;
}

export interface BatchEmailJobData {
  emails: EmailJobData[];
  batchId: string;
  userId: number;
  campaignId?: number;
  totalEmails: number;
}

export interface WebhookJobData {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  payload?: any;
  eventType: string;
  entityId: number;
  userId: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface AnalyticsJobData {
  type: 'email_event' | 'campaign_summary' | 'domain_reputation' | 'user_engagement';
  eventType?: string;
  emailId?: string;
  campaignId?: string;
  userId?: string;
  domain?: string;
  timestamp: Date;
  data: any;
  metadata?: Record<string, any>;
}

export class QueueService {
  private emailQueue: Queue;
  private webhookQueue: Queue;
  private analyticsQueue: Queue;
  private redisConfig: any;
  private isInitialized = false;

  constructor() {
    this.setupRedisConfig();
    this.initializeQueues();
    this.setupProcessors();
    this.setupEventHandlers();
  }

  private setupRedisConfig(): void {
    this.redisConfig = {
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getNumber('REDIS_PORT', 6379),
      password: Env.get('REDIS_PASSWORD'),
      db: Env.getNumber('REDIS_DB', 0),
      
      // Configuração específica para Bull Queue
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      
      // Connection pool settings
      family: 4,
      keepAlive: true,
      keyPrefix: Env.get('REDIS_PREFIX', 'ultrazend:'),
      
      // Timeouts otimizados
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnClusterDown: 300
    };
    
    logger.info('🔧 Redis config optimized for Bull Queue', {
      host: this.redisConfig.host,
      port: this.redisConfig.port,
      keyPrefix: this.redisConfig.keyPrefix
    });
  }

  private initializeQueues(): void {
    try {
      // Email processing queue
      this.emailQueue = new Bull('email-processing', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          delay: 0,
          jobId: undefined,
          priority: 0,
          repeat: undefined,
          timeout: 300000 // 5 minutos
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 3
        }
      });

      // Webhook processing queue
      this.webhookQueue = new Bull('webhook-processing', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          timeout: 30000 // 30 segundos
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 2
        }
      });

      // Analytics processing queue
      this.analyticsQueue = new Bull('analytics-processing', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 200,
          removeOnFail: 50,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 1000
          },
          timeout: 60000 // 1 minuto
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1
        }
      });

      logger.info('Queue service initialized', {
        queues: ['email-processing', 'webhook-processing', 'analytics-processing']
      });

    } catch (error) {
      logger.error('Failed to initialize queues', { error });
      logger.warn('Queue service will operate in fallback mode without Redis');
      
      // Implementar fallback mode se Redis não estiver disponível
      this.initializeFallbackMode();
    }
  }

  private setupProcessors(): void {
    try {
      // Email processing jobs
      this.emailQueue.process('send-email', 50, async (job: Job<EmailJobData>) => {
        return this.processEmailJob(job);
      });

      this.emailQueue.process('send-batch', 10, async (job: Job<BatchEmailJobData>) => {
        return this.processBatchEmailJob(job);
      });

      this.emailQueue.process('send-verification', 20, async (job: Job<EmailJobData>) => {
        return this.processVerificationEmailJob(job);
      });

      this.emailQueue.process('send-template', 30, async (job: Job<EmailJobData>) => {
        return this.processTemplateEmailJob(job);
      });

      // Webhook processing jobs
      this.webhookQueue.process('send-webhook', 20, async (job: Job<WebhookJobData>) => {
        return this.processWebhookJob(job);
      });

      this.webhookQueue.process('delivery-notification', 15, async (job: Job<WebhookJobData>) => {
        return this.processDeliveryNotificationJob(job);
      });

      // Analytics processing jobs
      this.analyticsQueue.process('update-analytics', 10, async (job: Job<AnalyticsJobData>) => {
        return this.processAnalyticsJob(job);
      });

      this.analyticsQueue.process('email-opened', 25, async (job: Job<AnalyticsJobData>) => {
        return this.processEmailOpenedJob(job);
      });

      this.analyticsQueue.process('email-clicked', 25, async (job: Job<AnalyticsJobData>) => {
        return this.processEmailClickedJob(job);
      });

      logger.info('Queue processors configured');

    } catch (error) {
      logger.error('Failed to setup queue processors', { error });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Email queue events
    this.emailQueue.on('completed', (job: Job, result: any) => {
      // ✅ LOGGING OTIMIZADO: Usar agregação para jobs completos
      logQueueProcessing('email', job.id!, 'complete', {
        jobName: job.name,
        duration: Date.now() - job.processedOn!,
        result: result?.messageId || 'success'
      });
    });

    this.emailQueue.on('failed', (job: Job, err: Error) => {
      // ✅ LOGGING OTIMIZADO: Erros sempre logados mas com contexto
      logQueueProcessing('email', job.id!, 'failed', {
        jobName: job.name,
        error: err.message,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        to: job.data.to,
        subject: job.data.subject
      });

      // Registrar falha para análise posterior
      this.recordJobFailure('email', job, err);
    });

    this.emailQueue.on('stalled', (job: Job) => {
      // ✅ LOGGING OTIMIZADO: Jobs travados com sampling
      logger.warnIf(Math.random() < 0.1, 'Email job stalled', {
        jobId: job.id,
        jobName: job.name,
        queue: 'email',
        stallCount: job.opts.attempts
      });
    });

    this.emailQueue.on('progress', (job: Job, progress: any) => {
      logger.debug('Email job progress', {
        jobId: job.id,
        jobName: job.name,
        progress
      });
    });

    // Webhook queue events
    this.webhookQueue.on('completed', (job: Job, result: any) => {
      logger.info('Webhook job completed', {
        jobId: job.id,
        queue: 'webhook',
        url: job.data.url,
        duration: Date.now() - job.processedOn!,
        statusCode: result?.statusCode
      });
    });

    this.webhookQueue.on('failed', (job: Job, err: Error) => {
      logger.error('Webhook job failed', {
        jobId: job.id,
        queue: 'webhook',
        url: job.data.url,
        error: err.message,
        attempts: job.attemptsMade
      });

      this.recordJobFailure('webhook', job, err);
    });

    this.webhookQueue.on('stalled', (job: Job) => {
      logger.warn('Webhook job stalled', {
        jobId: job.id,
        queue: 'webhook',
        url: job.data.url
      });
    });

    // Analytics queue events
    this.analyticsQueue.on('completed', (job: Job) => {
      logger.debug('Analytics job completed', {
        jobId: job.id,
        queue: 'analytics',
        type: job.data.type
      });
    });

    this.analyticsQueue.on('failed', (job: Job, err: Error) => {
      logger.error('Analytics job failed', {
        jobId: job.id,
        queue: 'analytics',
        type: job.data.type,
        error: err.message,
        attempts: job.attemptsMade
      });
    });

    logger.info('Queue event handlers configured');
  }

  private async processEmailJob(job: Job<EmailJobData>): Promise<any> {
    logger.info('Processing email job', {
      jobId: job.id,
      to: job.data.to,
      subject: job.data.subject
    });

    try {
      // Import dinamico para evitar dependências circulares
      const emailService = new EmailService();
      
      const result = await emailService.processEmailJob(job.data);
      
      // Atualizar progresso
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Email job processing failed', {
        jobId: job.id,
        error: (error as Error).message,
        data: job.data
      });
      throw error;
    }
  }

  private async processBatchEmailJob(job: Job<BatchEmailJobData>): Promise<any> {
    // 🆕 PROCESSAMENTO OTIMIZADO FASE 3: Usar bulk processor avançado com processamento paralelo
    // ✅ LOGGING OTIMIZADO: Batch jobs logados apenas no início
    logger.info('Processing batch email job with optimized processor', {
      jobId: job.id,
      batchId: job.data.batchId,
      totalEmails: job.data.totalEmails
    }, 'batch-processor');

    try {
      const stats = await optimizedBulkProcessor.processBatchEmailsOptimized(job);
      
      // Manter compatibilidade com formato esperado pelo sistema antigo
      return {
        batchId: stats.batchId,
        totalEmails: stats.totalEmails,
        successful: stats.successful,
        failed: stats.failed,
        retried: stats.retried,
        averageProcessingTime: stats.averageProcessingTime,
        totalProcessingTime: stats.totalProcessingTime,
        throughput: stats.throughput,
        memoryUsage: stats.memoryUsage,
        errors: stats.errors,
        // Compatibilidade com sistema antigo
        results: [] // Não retornar todos os resultados por motivos de performance
      };
      
    } catch (error) {
      logger.error('Optimized batch processing failed, attempting fallback', {
        jobId: job.id,
        batchId: job.data.batchId,
        error: (error as Error).message
      });
      
      // Fallback para processamento sequencial antigo em caso de erro crítico
      return this.processBatchEmailJobFallback(job);
    }
  }

  // Manter método antigo como fallback
  private async processBatchEmailJobFallback(job: Job<BatchEmailJobData>): Promise<any> {
    // ✅ LOGGING OTIMIZADO: Fallbacks sempre logados pois indicam problema
    logger.warn('Using fallback batch processing', {
      jobId: job.id,
      batchId: job.data.batchId
    }, 'batch-fallback');

    try {
      const emailService = new EmailService();
      const results = [];
      const totalEmails = job.data.emails.length;
      
      for (let i = 0; i < job.data.emails.length; i++) {
        const emailData = job.data.emails[i];
        
        try {
          const result = await emailService.processEmailJob(emailData);
          results.push({ success: true, email: emailData.to, result });
          
          const progress = Math.round(((i + 1) / totalEmails) * 100);
          job.progress(progress);
          
        } catch (error) {
          logger.error('Batch email failed in fallback', {
            batchId: job.data.batchId,
            email: emailData.to,
            error: (error as Error).message
          });
          results.push({ success: false, email: emailData.to, error: (error as Error).message });
        }
      }

      await this.recordBatchStats(job.data.batchId, results);
      
      return {
        batchId: job.data.batchId,
        totalEmails,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
      
    } catch (error) {
      logger.error('Fallback batch processing also failed', {
        jobId: job.id,
        batchId: job.data.batchId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async processVerificationEmailJob(job: Job<EmailJobData>): Promise<any> {
    logger.info('Processing verification email job', {
      jobId: job.id,
      to: job.data.to
    });

    try {
      const emailService = new EmailService();
      
      const result = await emailService.sendVerificationEmail(job.data.to as string, job.data.metadata?.name || 'User', job.data.metadata?.token || '');
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Verification email job failed', {
        jobId: job.id,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async processTemplateEmailJob(job: Job<EmailJobData>): Promise<any> {
    logger.info('Processing template email job', {
      jobId: job.id,
      to: job.data.to,
      templateId: job.data.templateId
    });

    try {
      const emailService = new EmailService();
      
      const result = await emailService.processEmailJob(job.data);
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Template email job failed', {
        jobId: job.id,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async processWebhookJob(job: Job<WebhookJobData>): Promise<any> {
    logger.info('Processing webhook job', {
      jobId: job.id,
      url: job.data.url,
      eventType: job.data.eventType
    });

    try {
      const webhookService = new WebhookService();
      
      const result = await webhookService.processWebhookJob(job.data);
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Webhook job failed', {
        jobId: job.id,
        url: job.data.url,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async processDeliveryNotificationJob(job: Job<WebhookJobData>): Promise<any> {
    logger.info('Processing delivery notification job', {
      jobId: job.id,
      url: job.data.url
    });

    try {
      const webhookService = new WebhookService();
      
      const result = await webhookService.processDeliveryNotification(job.data);
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Delivery notification job failed', {
        jobId: job.id,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async processAnalyticsJob(job: Job<AnalyticsJobData>): Promise<any> {
    logger.debug('Processing analytics job', {
      jobId: job.id,
      type: job.data.type
    });

    try {
      const analyticsService = new AnalyticsService();
      
      const result = await analyticsService.processAnalyticsJob(job.data);
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Analytics job failed', {
        jobId: job.id,
        type: job.data.type,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async processEmailOpenedJob(job: Job<AnalyticsJobData>): Promise<any> {
    try {
      const analyticsService = new AnalyticsService();
      
      return await analyticsService.processAnalyticsJob(job.data);
    } catch (error) {
      logger.error('Email opened job failed', { jobId: job.id, error: (error as Error).message });
      throw error;
    }
  }

  private async processEmailClickedJob(job: Job<AnalyticsJobData>): Promise<any> {
    try {
      const analyticsService = new AnalyticsService();
      
      return await analyticsService.processAnalyticsJob(job.data);
    } catch (error) {
      logger.error('Email clicked job failed', { jobId: job.id, error: (error as Error).message });
      throw error;
    }
  }

  // Public methods para adicionar jobs
  public async addEmailJob(emailData: EmailJobData, options: JobOptions = {}): Promise<Job> {
    try {
      // Se não há fila (fallback mode), processar diretamente
      if (!this.emailQueue) {
        logger.info('Processing email job directly (fallback mode)');
        await this.processEmailJobDirectly(emailData);
        return { id: `fallback-${Date.now()}` } as Job; // Mock job object
      }

      const jobOptions: JobOptions = {
        priority: emailData.priority || 0,
        delay: emailData.delay || 0,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        ...options
      };

      const job = await this.emailQueue.add('send-email', emailData, jobOptions);
      
      logger.info('Email job added to queue', {
        jobId: job.id,
        to: emailData.to,
        subject: emailData.subject,
        priority: jobOptions.priority
      });

      return job;
    } catch (error) {
      logger.error('Failed to add email job', { error, emailData });
      throw error;
    }
  }

  public async addBatchEmailJob(emailsData: EmailJobData[], options: Partial<BatchEmailJobData> = {}): Promise<Job> {
    try {
      const batchId = options.batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const batchData: BatchEmailJobData = {
        batchId,
        emails: emailsData,
        totalEmails: emailsData.length,
        userId: options.userId || 0,
        campaignId: options.campaignId
      };

      const job = await this.emailQueue.add('send-batch', batchData, {
        priority: -10 // Lower priority for batch jobs
      });

      logger.info('Batch email job added to queue', {
        jobId: job.id,
        batchId,
        totalEmails: emailsData.length
      });

      return job;
    } catch (error) {
      logger.error('Failed to add batch email job', { error });
      throw error;
    }
  }

  public async addVerificationEmailJob(emailData: EmailJobData): Promise<Job> {
    try {
      // Se não há fila (fallback mode), processar diretamente
      if (!this.emailQueue) {
        logger.info('Processing verification email job directly (fallback mode)');
        await this.processEmailJobDirectly(emailData);
        return { id: `fallback-verification-${Date.now()}` } as Job; // Mock job object
      }

      const job = await this.emailQueue.add('send-verification', emailData, {
        priority: 10, // High priority for verification emails
        attempts: 3
      });

      logger.info('Verification email job added to queue', {
        jobId: job.id,
        to: emailData.to
      });

      return job;
    } catch (error) {
      logger.error('Failed to add verification email job', { error });
      // Em caso de erro, tentar fallback mode
      logger.warn('Attempting fallback mode for verification email');
      try {
        await this.processEmailJobDirectly(emailData);
        return { id: `fallback-verification-emergency-${Date.now()}` } as Job;
      } catch (fallbackError) {
        logger.error('Fallback mode also failed', { fallbackError });
        throw error; // Lançar o erro original
      }
    }
  }

  public async addTemplateEmailJob(emailData: EmailJobData): Promise<Job> {
    try {
      const job = await this.emailQueue.add('send-template', emailData, {
        priority: emailData.priority || 5
      });

      logger.info('Template email job added to queue', {
        jobId: job.id,
        to: emailData.to,
        templateId: emailData.templateId
      });

      return job;
    } catch (error) {
      logger.error('Failed to add template email job', { error });
      throw error;
    }
  }

  public async addWebhookJob(webhookData: WebhookJobData): Promise<Job> {
    try {
      const job = await this.webhookQueue.add('send-webhook', webhookData);

      logger.info('Webhook job added to queue', {
        jobId: job.id,
        url: webhookData.url,
        eventType: webhookData.eventType
      });

      return job;
    } catch (error) {
      logger.error('Failed to add webhook job', { error });
      throw error;
    }
  }

  public async addDeliveryNotificationJob(webhookData: WebhookJobData): Promise<Job> {
    try {
      const job = await this.webhookQueue.add('delivery-notification', webhookData, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 }
      });

      logger.info('Delivery notification job added to queue', {
        jobId: job.id,
        url: webhookData.url
      });

      return job;
    } catch (error) {
      logger.error('Failed to add delivery notification job', { error });
      throw error;
    }
  }

  public async addAnalyticsJob(analyticsData: AnalyticsJobData): Promise<Job> {
    try {
      const job = await this.analyticsQueue.add('update-analytics', analyticsData, {
        delay: 1000 // Delay para batching de analytics
      });

      return job;
    } catch (error) {
      logger.error('Failed to add analytics job', { error });
      throw error;
    }
  }

  public async addEmailOpenedJob(analyticsData: AnalyticsJobData): Promise<Job> {
    try {
      const job = await this.analyticsQueue.add('email-opened', analyticsData);
      return job;
    } catch (error) {
      logger.error('Failed to add email opened job', { error });
      throw error;
    }
  }

  public async addEmailClickedJob(analyticsData: AnalyticsJobData): Promise<Job> {
    try {
      const job = await this.analyticsQueue.add('email-clicked', analyticsData);
      return job;
    } catch (error) {
      logger.error('Failed to add email clicked job', { error });
      throw error;
    }
  }

  // Queue management methods
  public async getQueueStats(): Promise<Record<string, QueueStats>> {
    try {
      const [emailStats, webhookStats, analyticsStats] = await Promise.all([
        this.getQueueStatsForQueue(this.emailQueue),
        this.getQueueStatsForQueue(this.webhookQueue),
        this.getQueueStatsForQueue(this.analyticsQueue)
      ]);

      return {
        email: emailStats,
        webhook: webhookStats,
        analytics: analyticsStats
      };
    } catch (error) {
      logger.error('Failed to get queue stats', { error });
      throw error;
    }
  }

  private async getQueueStatsForQueue(queue: Queue): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: await queue.isPaused()
    };
  }

  public async pauseQueues(): Promise<void> {
    try {
      await Promise.all([
        this.emailQueue.pause(),
        this.webhookQueue.pause(),
        this.analyticsQueue.pause()
      ]);
      
      logger.info('All queues paused');
    } catch (error) {
      logger.error('Failed to pause queues', { error });
      throw error;
    }
  }

  public async resumeQueues(): Promise<void> {
    try {
      await Promise.all([
        this.emailQueue.resume(),
        this.webhookQueue.resume(),
        this.analyticsQueue.resume()
      ]);
      
      logger.info('All queues resumed');
    } catch (error) {
      logger.error('Failed to resume queues', { error });
      throw error;
    }
  }

  public async pauseQueue(queueName: 'email' | 'webhook' | 'analytics'): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      await queue.pause();
      
      logger.info(`Queue ${queueName} paused`);
    } catch (error) {
      logger.error(`Failed to pause queue ${queueName}`, { error });
      throw error;
    }
  }

  public async resumeQueue(queueName: 'email' | 'webhook' | 'analytics'): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      await queue.resume();
      
      logger.info(`Queue ${queueName} resumed`);
    } catch (error) {
      logger.error(`Failed to resume queue ${queueName}`, { error });
      throw error;
    }
  }

  private getQueueByName(queueName: string): Queue {
    switch (queueName) {
      case 'email':
        return this.emailQueue;
      case 'webhook':
        return this.webhookQueue;
      case 'analytics':
        return this.analyticsQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  public async cleanQueues(): Promise<void> {
    try {
      await Promise.all([
        this.emailQueue.clean(24 * 60 * 60 * 1000, 'completed'),
        this.emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'),
        this.webhookQueue.clean(24 * 60 * 60 * 1000, 'completed'),
        this.webhookQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'),
        this.analyticsQueue.clean(6 * 60 * 60 * 1000, 'completed'), // 6 horas
        this.analyticsQueue.clean(24 * 60 * 60 * 1000, 'failed')
      ]);

      logger.info('Queue cleanup completed');
    } catch (error) {
      logger.error('Queue cleanup failed', { error });
    }
  }

  private async recordJobFailure(queueType: string, job: Job, error: Error): Promise<void> {
    try {
      await db('queue_job_failures').insert({
        queue_type: queueType,
        job_id: job.id?.toString(),
        job_name: job.name,
        job_data: JSON.stringify(job.data),
        error_message: error.message,
        error_stack: error.stack,
        attempts_made: job.attemptsMade,
        max_attempts: job.opts.attempts,
        failed_at: new Date(),
        created_at: new Date()
      });
    } catch (dbError) {
      logger.error('Failed to record job failure', { dbError, jobId: job.id });
    }
  }

  private async recordBatchStats(batchId: string, results: any[]): Promise<void> {
    try {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      await db('batch_email_stats').insert({
        batch_id: batchId,
        total_emails: results.length,
        successful_emails: successful,
        failed_emails: failed,
        success_rate: (successful / results.length) * 100,
        completed_at: new Date(),
        created_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to record batch stats', { error, batchId });
    }
  }


  public async getHealth(): Promise<any> {
    try {
      const stats = await this.getQueueStats();
      const isHealthy = !Object.values(stats).some(queueStats => 
        queueStats.failed > 100 || queueStats.active > 1000
      );

      return {
        healthy: isHealthy,
        stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // CORREÇÃO: Métodos para fallback mode quando Redis não está disponível
  private initializeFallbackMode(): void {
    logger.warn('Initializing fallback mode - operations will run synchronously');
    this.isInitialized = true; // Permite que o service funcione mesmo sem Redis
  }

  private async processFallbackJob(jobData: any, jobType: string): Promise<any> {
    logger.info(`Processing job directly (fallback mode): ${jobType}`);
    
    switch (jobType) {
      case 'send-email':
      case 'send-verification':
      case 'send-template':
        return this.processEmailJobDirectly(jobData);
      case 'send-webhook':
        return this.processWebhookJobDirectly(jobData);
      case 'process-analytics':
        return this.processAnalyticsJobDirectly(jobData);
      default:
        logger.warn(`Unknown job type in fallback mode: ${jobType}`);
        return null;
    }
  }

  private async processEmailJobDirectly(jobData: EmailJobData): Promise<void> {
    logger.info('Processing email job directly (fallback mode)');
    
    try {
      // Para fallback, usar SMTP direto via SMTPDeliveryService 
      const smtpService = new SMTPDeliveryService();
      
      const emailContent = {
        from: jobData.from,
        to: Array.isArray(jobData.to) ? jobData.to[0] : jobData.to, // Simplificar para string única
        subject: jobData.subject,
        html: jobData.html || '',
        text: jobData.text || jobData.subject,
        attachments: jobData.attachments || []
      };
      
      await smtpService.deliverEmail(emailContent);
      
      logger.info('Email sent successfully in fallback mode', { 
        to: emailContent.to,
        subject: jobData.subject
      });
    } catch (error) {
      logger.error('Failed to send email in fallback mode', { 
        error: (error as Error).message, 
        to: jobData.to,
        subject: jobData.subject
      });
      throw error;
    }
  }

  private async processWebhookJobDirectly(jobData: WebhookJobData): Promise<void> {
    logger.info('Processing webhook job directly');
    // Implementar processamento direto de webhook se necessário
  }

  private async processAnalyticsJobDirectly(jobData: AnalyticsJobData): Promise<void> {
    logger.info('Processing analytics job directly');
    // Implementar processamento direto de analytics se necessário
  }

  public async close(): Promise<void> {
    try {
      await Promise.all([
        this.emailQueue.close(),
        this.webhookQueue.close(),
        this.analyticsQueue.close()
      ]);

      logger.info('Queue service closed');
    } catch (error) {
      logger.error('Failed to close queue service', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();