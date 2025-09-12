import { Job } from 'bull';
import { logger } from '../config/optimizedLogger';
import { EmailService } from './emailService';
import { logMiddlewareEvent } from '../middleware/emailMiddlewareHelpers';

/**
 * Sistema otimizado de processamento em lote para emails
 * Implementa processamento paralelo, chunking e retry inteligente
 */

export interface BatchEmailJobData {
  batchId: string;
  emails: EmailJobData[];
  totalEmails: number;
  userId?: number;
  campaignId?: number;
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

export interface ProcessingResult {
  success: boolean;
  email: string;
  result?: any;
  error?: string;
  retryCount?: number;
  processingTime?: number;
}

export interface BatchProcessingConfig {
  maxConcurrency: number;
  chunkSize: number;
  retryAttempts: number;
  retryDelay: number;
  timeoutMs: number;
  progressInterval: number;
}

export interface BatchStats {
  batchId: string;
  totalEmails: number;
  successful: number;
  failed: number;
  retried: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
  throughput: number; // emails per second
  memoryUsage: number;
  errors: Record<string, number>;
}

export class OptimizedBulkProcessor {
  private static instance: OptimizedBulkProcessor;
  private emailServicePool: EmailService[] = [];
  private readonly defaultConfig: BatchProcessingConfig = {
    maxConcurrency: 10, // Processar até 10 emails simultaneamente
    chunkSize: 50, // Processar em chunks de 50
    retryAttempts: 3,
    retryDelay: 2000, // 2 segundos entre retries
    timeoutMs: 30000, // 30 segundos timeout por email
    progressInterval: 5 // Atualizar progresso a cada 5 emails processados
  };

  private constructor() {
    // Inicializar pool de EmailServices
    this.initializeEmailServicePool();
  }

  public static getInstance(): OptimizedBulkProcessor {
    if (!OptimizedBulkProcessor.instance) {
      OptimizedBulkProcessor.instance = new OptimizedBulkProcessor();
    }
    return OptimizedBulkProcessor.instance;
  }

  /**
   * Inicializar pool de serviços de email para reutilização
   */
  private initializeEmailServicePool(): void {
    const poolSize = this.defaultConfig.maxConcurrency * 2;
    for (let i = 0; i < poolSize; i++) {
      this.emailServicePool.push(new EmailService());
    }
    
    logMiddlewareEvent('debug', 'Email service pool initialized', {
      poolSize,
      maxConcurrency: this.defaultConfig.maxConcurrency
    });
  }

  /**
   * Obter EmailService do pool (round-robin)
   */
  private getEmailServiceFromPool(): EmailService {
    const index = Math.floor(Math.random() * this.emailServicePool.length);
    return this.emailServicePool[index];
  }

  /**
   * Processar batch de emails de forma otimizada
   */
  public async processBatchEmailsOptimized(
    job: Job<BatchEmailJobData>,
    config?: Partial<BatchProcessingConfig>
  ): Promise<BatchStats> {
    const startTime = Date.now();
    const processingConfig = { ...this.defaultConfig, ...config };
    const { batchId, emails, totalEmails } = job.data;

    logMiddlewareEvent('info', 'Starting optimized batch processing', {
      batchId,
      totalEmails,
      config: processingConfig,
      jobId: job.id
    });

    const results: ProcessingResult[] = [];
    const errorCounts: Record<string, number> = {};
    let processedCount = 0;

    try {
      // Processar emails em chunks para otimizar memória
      const chunks = this.chunkArray(emails, processingConfig.chunkSize);
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const chunkStartTime = Date.now();
        
        logMiddlewareEvent('debug', 'Processing chunk', {
          batchId,
          chunkIndex: chunkIndex + 1,
          totalChunks: chunks.length,
          chunkSize: chunk.length
        });

        // Processar chunk em paralelo com concorrência controlada
        const chunkResults = await this.processChunkParallel(
          chunk,
          processingConfig,
          batchId
        );

        results.push(...chunkResults);
        processedCount += chunk.length;

        // Atualizar progresso do job
        const progress = Math.round((processedCount / totalEmails) * 100);
        await job.progress(progress);

        // Contabilizar erros
        chunkResults.forEach(result => {
          if (!result.success && result.error) {
            const errorType = this.categorizeError(result.error);
            errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
          }
        });

        const chunkDuration = Date.now() - chunkStartTime;
        logMiddlewareEvent('debug', 'Chunk processed', {
          batchId,
          chunkIndex: chunkIndex + 1,
          duration: chunkDuration,
          successful: chunkResults.filter(r => r.success).length,
          failed: chunkResults.filter(r => !r.success).length,
          throughput: Math.round((chunk.length / chunkDuration) * 1000)
        });

        // Pequena pausa entre chunks para dar respiro ao sistema
        if (chunkIndex < chunks.length - 1) {
          await this.sleep(100);
        }
      }

      const totalProcessingTime = Date.now() - startTime;
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const retried = results.filter(r => r.retryCount && r.retryCount > 0).length;

      const stats: BatchStats = {
        batchId,
        totalEmails,
        successful,
        failed,
        retried,
        averageProcessingTime: this.calculateAverageProcessingTime(results),
        totalProcessingTime,
        throughput: Math.round((totalEmails / totalProcessingTime) * 1000),
        memoryUsage: this.getMemoryUsage(),
        errors: errorCounts
      };

      // Registrar estatísticas
      await this.recordBatchStats(stats);

      logMiddlewareEvent('info', 'Batch processing completed', {
        batchId,
        stats,
        jobId: job.id
      });

      return stats;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logMiddlewareEvent('error', 'Batch processing failed', {
        batchId,
        error: errorMessage,
        processedCount,
        totalEmails,
        jobId: job.id
      });

      throw new Error(`Batch processing failed: ${errorMessage}`);
    }
  }

  /**
   * Processar chunk de emails em paralelo
   */
  private async processChunkParallel(
    emails: EmailJobData[],
    config: BatchProcessingConfig,
    batchId: string
  ): Promise<ProcessingResult[]> {
    const concurrencyLimit = Math.min(config.maxConcurrency, emails.length);
    const results: ProcessingResult[] = new Array(emails.length);
    let activePromises = 0;
    let completedCount = 0;

    return new Promise((resolve, reject) => {
      const processNext = async () => {
        if (completedCount >= emails.length) {
          resolve(results);
          return;
        }

        if (activePromises >= concurrencyLimit) {
          return;
        }

        const index = activePromises + completedCount;
        if (index >= emails.length) {
          return;
        }

        const email = emails[index];
        activePromises++;

        try {
          const result = await this.processEmailWithRetry(email, config, batchId);
          results[index] = result;
        } catch (error) {
          results[index] = {
            success: false,
            email: String(email.to),
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }

        activePromises--;
        completedCount++;
        
        // Continuar processamento
        setImmediate(processNext);
      };

      // Iniciar processamento paralelo
      for (let i = 0; i < concurrencyLimit; i++) {
        processNext().catch(reject);
      }
    });
  }

  /**
   * Processar email individual com retry inteligente
   */
  private async processEmailWithRetry(
    email: EmailJobData,
    config: BatchProcessingConfig,
    batchId: string
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= config.retryAttempts; attempt++) {
      try {
        const emailService = this.getEmailServiceFromPool();
        
        // Aplicar timeout por email
        const result = await Promise.race([
          emailService.processEmailJob(email),
          this.timeoutPromise(config.timeoutMs)
        ]);

        const processingTime = Date.now() - startTime;

        return {
          success: true,
          email: String(email.to),
          result,
          retryCount,
          processingTime
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        retryCount = attempt;

        // Determinar se deve fazer retry baseado no tipo de erro
        const shouldRetry = this.shouldRetryError(lastError, attempt, config.retryAttempts);
        
        if (!shouldRetry) {
          break;
        }

        if (attempt < config.retryAttempts) {
          // Delay exponencial com jitter
          const delay = config.retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
          await this.sleep(delay);
          
          logMiddlewareEvent('debug', 'Retrying email', {
            batchId,
            email: String(email.to),
            attempt: attempt + 1,
            error: lastError.message
          });
        }
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      success: false,
      email: String(email.to),
      error: lastError?.message || 'Unknown error',
      retryCount,
      processingTime
    };
  }

  /**
   * Determinar se deve fazer retry baseado no tipo de erro
   */
  private shouldRetryError(error: Error, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Não fazer retry para erros de validação
    if (message.includes('invalid email') || 
        message.includes('validation failed') ||
        message.includes('forbidden')) {
      return false;
    }

    // Fazer retry para erros temporários
    if (message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('network') ||
        message.includes('rate limit') ||
        message.includes('service unavailable')) {
      return true;
    }

    // Fazer retry por padrão para outros erros
    return true;
  }

  /**
   * Categorizar erros para estatísticas
   */
  private categorizeError(error: string): string {
    const message = error.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('connection')) return 'connection';
    if (message.includes('rate limit')) return 'rate_limit';
    if (message.includes('invalid email')) return 'invalid_email';
    if (message.includes('validation')) return 'validation';
    if (message.includes('authentication')) return 'auth';
    if (message.includes('service unavailable')) return 'service_unavailable';
    
    return 'other';
  }

  /**
   * Dividir array em chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Timeout promise helper
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Email processing timeout')), ms);
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calcular tempo médio de processamento
   */
  private calculateAverageProcessingTime(results: ProcessingResult[]): number {
    const timings = results.filter(r => r.processingTime).map(r => r.processingTime!);
    if (timings.length === 0) return 0;
    
    return Math.round(timings.reduce((sum, time) => sum + time, 0) / timings.length);
  }

  /**
   * Obter uso de memória atual
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024); // MB
  }

  /**
   * Registrar estatísticas do batch
   */
  private async recordBatchStats(stats: BatchStats): Promise<void> {
    try {
      logMiddlewareEvent('info', 'Batch statistics recorded', {
        batchId: stats.batchId,
        successRate: Math.round((stats.successful / stats.totalEmails) * 100),
        throughput: stats.throughput,
        averageProcessingTime: stats.averageProcessingTime,
        memoryUsage: stats.memoryUsage
      });
    } catch (error) {
      logMiddlewareEvent('warn', 'Failed to record batch stats', {
        batchId: stats.batchId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Obter estatísticas do processador
   */
  public getProcessorStats() {
    return {
      poolSize: this.emailServicePool.length,
      memoryUsage: this.getMemoryUsage(),
      config: this.defaultConfig
    };
  }

  /**
   * Limpar resources (para testes)
   */
  public destroy(): void {
    this.emailServicePool.length = 0;
  }
}

// Export singleton instance
export const optimizedBulkProcessor = OptimizedBulkProcessor.getInstance();