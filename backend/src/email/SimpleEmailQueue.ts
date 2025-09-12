/**
 * 📨 SIMPLE EMAIL QUEUE
 * Sistema de fila simplificado para alto volume (OPCIONAL)
 * Versão: 1.0.0 - Simples, Funcional e Confiável
 * 
 * NOTA: Este componente é OPCIONAL - o sistema funciona perfeitamente
 * sem ele para volumes normais. Use apenas se necessário para alta escala.
 */

import Bull, { Job, Queue } from 'bull';
import { logger } from '../config/logger';
import { UnifiedEmailService } from './EmailService';
import { EmailData, EmailContext, QueueResult, QueueHealth } from './types';

export interface QueuedEmailJob {
  emailData: EmailData;
  context: EmailContext;
  priority: number;
  attempts: number;
  delay?: number;
}

export interface QueueOptions {
  redisUrl?: string;
  concurrency?: number;
  defaultJobOptions?: Bull.JobOptions;
  enableRetries?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export class SimpleEmailQueue {
  private readonly emailService: UnifiedEmailService;
  private readonly queue: Queue<QueuedEmailJob>;
  private readonly options: Required<QueueOptions>;
  private isProcessing: boolean = false;

  constructor(options: QueueOptions = {}) {
    this.options = {
      redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      concurrency: options.concurrency || 5,
      enableRetries: options.enableRetries !== false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: options.enableRetries !== false ? (options.maxRetries || 3) : 1,
        backoff: {
          type: 'exponential',
          delay: options.retryDelay || 5000
        },
        ...options.defaultJobOptions
      }
    };

    // Inicializar a fila
    this.queue = new Bull('email-processing', this.options.redisUrl, {
      defaultJobOptions: this.options.defaultJobOptions,
      settings: {
        // Configurações avançadas do Bull queue
      }
    });

    // Inicializar o serviço de email (reutilizar a lógica existente)
    this.emailService = new UnifiedEmailService({ 
      enableMetrics: true 
    });

    logger.info('SimpleEmailQueue initialized', {
      redisUrl: this.options.redisUrl.replace(/:[^:]*@/, ':***@'), // Hide credentials
      concurrency: this.options.concurrency,
      enableRetries: this.options.enableRetries,
      maxRetries: this.options.maxRetries
    });
  }

  /**
   * Iniciar o processamento da fila
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Queue processing is already started');
      return;
    }

    try {
      // Configurar o processador
      this.queue.process(this.options.concurrency, this.processEmailJob.bind(this));

      // Event listeners
      this.queue.on('completed', this.onJobCompleted.bind(this));
      this.queue.on('failed', this.onJobFailed.bind(this));
      this.queue.on('stalled', this.onJobStalled.bind(this));

      this.isProcessing = true;

      logger.info('Email queue processing started', {
        concurrency: this.options.concurrency
      });

    } catch (error) {
      logger.error('Failed to start queue processing', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Parar o processamento da fila
   */
  async stopProcessing(): Promise<void> {
    if (!this.isProcessing) {
      logger.warn('Queue processing is not running');
      return;
    }

    try {
      await this.queue.close();
      this.isProcessing = false;

      logger.info('Email queue processing stopped');

    } catch (error) {
      logger.error('Failed to stop queue processing', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Adicionar email à fila
   */
  async queueEmail(
    emailData: EmailData, 
    context: EmailContext,
    options: {
      priority?: number;
      delay?: number;
      attempts?: number;
    } = {}
  ): Promise<QueueResult> {
    try {
      const jobData: QueuedEmailJob = {
        emailData,
        context,
        priority: options.priority || 0,
        attempts: options.attempts || this.options.maxRetries,
        delay: options.delay
      };

      const jobOptions: Bull.JobOptions = {
        ...this.options.defaultJobOptions,
        priority: options.priority || 0,
        delay: options.delay,
        attempts: options.attempts || this.options.defaultJobOptions.attempts
      };

      const job = await this.queue.add(jobData, jobOptions);

      logger.debug('Email added to queue', {
        jobId: job.id,
        userId: context.userId,
        priority: options.priority || 0,
        delay: options.delay
      });

      return {
        success: true,
        jobId: job.id.toString(),
        processedImmediately: false,
        queuedAt: new Date(),
        estimatedProcessTime: options.delay ? 
          new Date(Date.now() + options.delay) : 
          new Date(Date.now() + 1000) // Estimate 1 second
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to queue email', {
        userId: context.userId,
        error: errorMessage
      });

      return {
        success: false,
        processedImmediately: false,
        queuedAt: new Date()
      };
    }
  }

  /**
   * Processar job de email
   */
  private async processEmailJob(job: Job<QueuedEmailJob>): Promise<any> {
    const startTime = Date.now();
    const { emailData, context } = job.data;

    try {
      logger.debug('Processing queued email', {
        jobId: job.id,
        userId: context.userId,
        from: emailData.from,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts
      });

      // Usar o UnifiedEmailService para processar o email
      const result = await this.emailService.sendEmail(emailData, context);
      const processingTime = Date.now() - startTime;

      if (result.success) {
        logger.info('Queued email processed successfully', {
          jobId: job.id,
          userId: context.userId,
          messageId: result.messageId,
          processingTime: `${processingTime}ms`
        });

        return {
          success: true,
          messageId: result.messageId,
          processingTime
        };
      } else {
        throw new Error(result.error || 'Email sending failed');
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to process queued email', {
        jobId: job.id,
        userId: context.userId,
        error: errorMessage,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
        processingTime: `${processingTime}ms`
      });

      throw error; // Re-throw to trigger Bull retry mechanism
    }
  }

  /**
   * Event handler: Job completed
   */
  private onJobCompleted(job: Job<QueuedEmailJob>, result: any): void {
    logger.debug('Email job completed', {
      jobId: job.id,
      userId: job.data.context.userId,
      processingTime: result.processingTime,
      messageId: result.messageId
    });
  }

  /**
   * Event handler: Job failed
   */
  private onJobFailed(job: Job<QueuedEmailJob>, err: Error): void {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts || 1);
    
    logger.error('Email job failed', {
      jobId: job.id,
      userId: job.data.context.userId,
      error: err.message,
      attempt: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      isLastAttempt,
      willRetry: !isLastAttempt
    });

    // Se é a última tentativa, poderíamos notificar ou tomar outra ação
    if (isLastAttempt) {
      logger.error('Email job exhausted all retries', {
        jobId: job.id,
        userId: job.data.context.userId,
        finalError: err.message
      });
    }
  }

  /**
   * Event handler: Job stalled
   */
  private onJobStalled(job: Job<QueuedEmailJob>): void {
    logger.warn('Email job stalled', {
      jobId: job.id,
      userId: job.data.context.userId
    });
  }

  /**
   * Obter saúde da fila
   */
  async getQueueHealth(): Promise<QueueHealth> {
    try {
      const [active, waiting, completed, failed, delayed] = await Promise.all([
        this.queue.getActive(),
        this.queue.getWaiting(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed()
      ]);

      const isPaused = await this.queue.isPaused();

      return {
        active: active.length,
        waiting: waiting.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: isPaused
      };

    } catch (error) {
      logger.error('Failed to get queue health', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        active: -1,
        waiting: -1,
        completed: -1,
        failed: -1,
        delayed: -1,
        paused: true
      };
    }
  }

  /**
   * Limpar jobs antigos
   */
  async cleanupOldJobs(age: number = 86400000): Promise<void> { // 24 hours default
    try {
      await this.queue.clean(age, 'completed');
      await this.queue.clean(age, 'failed');

      logger.info('Cleaned up old queue jobs', {
        maxAge: `${age / 1000}s`
      });

    } catch (error) {
      logger.error('Failed to cleanup old jobs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Processar email imediatamente (bypass da fila)
   * Usado para emails de alta prioridade ou quando a fila está desabilitada
   */
  async sendImmediately(emailData: EmailData, context: EmailContext): Promise<QueueResult> {
    try {
      const result = await this.emailService.sendEmail(emailData, context);

      if (result.success) {
        return {
          success: true,
          jobId: result.messageId,
          processedImmediately: true,
          queuedAt: new Date()
        };
      } else {
        return {
          success: false,
          processedImmediately: true,
          queuedAt: new Date()
        };
      }

    } catch (error) {
      logger.error('Failed to send email immediately', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        processedImmediately: true,
        queuedAt: new Date()
      };
    }
  }
}