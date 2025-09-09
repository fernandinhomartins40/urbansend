import { Job } from 'bull';
import { DomainVerificationService } from '../services/DomainVerificationService';
import { domainVerificationLogger } from '../services/DomainVerificationLogger';
import { queueService } from '../services/queueService';
import { logger, Logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';

export interface DomainVerificationJobData {
  domainId?: number;
  batchSize?: number;
  retryFailedOnly?: boolean;
  isManualTrigger?: boolean;
  userId?: number;
  maxRetries?: number;
  skipCache?: boolean;
}

export interface DomainVerificationResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  partial: number;
  skipped: number;
  errors: string[];
  processingTime: number;
  domainResults: Array<{
    domainId: number;
    domainName: string;
    status: 'success' | 'failed' | 'partial' | 'skipped';
    error?: string;
    verificationTime?: number;
  }>;
}

export class DomainVerificationJob {
  private static instance: DomainVerificationJob;
  private verificationService: DomainVerificationService;
  private isRunning: boolean = false;
  
  public static getInstance(): DomainVerificationJob {
    if (!DomainVerificationJob.instance) {
      DomainVerificationJob.instance = new DomainVerificationJob();
    }
    return DomainVerificationJob.instance;
  }

  constructor() {
    this.verificationService = new DomainVerificationService();
    this.setupJobProcessors();
  }

  private setupJobProcessors(): void {
    try {
      // Adicionar processos de jobs de verificação de domínio ao queueService
      this.addDomainVerificationProcessor();
      
      logger.info('Domain verification job processors configured', {
        business: {
          entity: 'domain_verification_job',
          action: 'processors_configured'
        }
      });
    } catch (error) {
      Logger.error('Failed to setup domain verification job processors', error as Error);
    }
  }

  private addDomainVerificationProcessor(): void {
    // Como o queueService já tem queues configuradas, vamos usar o analyticsQueue 
    // para jobs de verificação de domínio ou criar uma nova queue se necessário
    
    // Para manter simplicidade, vamos usar o analyticsQueue existente
    // Em produção, seria ideal criar uma queue específica para domain verification
    
    const analyticsQueue = (queueService as any).analyticsQueue;
    if (analyticsQueue) {
      analyticsQueue.process('domain-verification', 5, this.processDomainVerificationJob.bind(this));
      analyticsQueue.process('single-domain-verification', 10, this.processSingleDomainJob.bind(this));
    }
  }

  // Processar job de verificação em lote
  private async processDomainVerificationJob(job: Job<DomainVerificationJobData>): Promise<DomainVerificationResult> {
    const startTime = Date.now();
    const jobData = job.data || {};
    
    Logger.business('domain_verification_job', 'batch_job_started', {
      metadata: {
        jobId: job.id,
        batchSize: jobData.batchSize || 'unlimited',
        retryFailedOnly: jobData.retryFailedOnly || false,
        isManualTrigger: jobData.isManualTrigger || false
      }
    });

    if (this.isRunning) {
      const message = 'Domain verification job already running, skipping';
      Logger.business('domain_verification_job', 'job_skipped', {
        metadata: { reason: 'already_running', jobId: job.id }
      });
      
      return {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        partial: 0,
        skipped: 1,
        errors: [message],
        processingTime: Date.now() - startTime,
        domainResults: []
      };
    }

    this.isRunning = true;

    try {
      // Atualizar progresso
      job.progress(5);

      // Buscar domínios para verificação
      const domainsToVerify = await this.getDomainsForVerification(jobData);
      
      if (domainsToVerify.length === 0) {
        Logger.business('domain_verification_job', 'no_domains_found', {
          metadata: { jobId: job.id, criteria: jobData }
        });
        
        return {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          partial: 0,
          skipped: 0,
          errors: [],
          processingTime: Date.now() - startTime,
          domainResults: []
        };
      }

      job.progress(15);

      const result: DomainVerificationResult = {
        totalProcessed: domainsToVerify.length,
        successful: 0,
        failed: 0,
        partial: 0,
        skipped: 0,
        errors: [],
        processingTime: 0,
        domainResults: []
      };

      // Processar domínios em lotes para evitar sobrecarga
      const batchSize = Math.min(jobData.batchSize || 10, 20); // Máximo 20 por vez
      const batches = this.chunkArray(domainsToVerify, batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const progress = 15 + ((i / batches.length) * 80); // 15% a 95%
        job.progress(Math.round(progress));

        Logger.business('domain_verification_job', 'processing_batch', {
          metadata: {
            jobId: job.id,
            batchIndex: i + 1,
            totalBatches: batches.length,
            batchSize: batch.length,
            progress: Math.round(progress)
          }
        });

        // Processar batch em paralelo (com limite de concorrência)
        const batchPromises = batch.map(domain => 
          this.verifyDomainWithLogging(domain, jobData.maxRetries || 2, job.id?.toString())
        );

        const batchResults = await Promise.allSettled(batchPromises);

        // Processar resultados do batch
        batchResults.forEach((batchResult, index) => {
          const domain = batch[index];
          
          if (batchResult.status === 'fulfilled') {
            const verificationResult = batchResult.value;
            
            // Map verification status to result status
            let resultStatus: 'success' | 'failed' | 'partial' | 'skipped';
            switch (verificationResult.overall_status) {
              case 'verified':
                resultStatus = 'success';
                result.successful++;
                break;
              case 'partial':
                resultStatus = 'partial';
                result.partial++;
                break;
              case 'failed':
                resultStatus = 'failed';
                result.failed++;
                break;
              default:
                resultStatus = 'skipped';
                result.skipped++;
            }

            result.domainResults.push({
              domainId: domain.id,
              domainName: domain.domain_name,
              status: resultStatus,
              verificationTime: verificationResult.processing_time
            });
          } else {
            const error = `Failed to verify ${domain.domain_name}: ${batchResult.reason}`;
            result.errors.push(error);
            result.failed++;
            
            result.domainResults.push({
              domainId: domain.id,
              domainName: domain.domain_name,
              status: 'failed',
              error: batchResult.reason?.message || 'Unknown error'
            });
          }
        });

        // Delay between batches to avoid overwhelming DNS servers
        if (i < batches.length - 1) {
          await this.delay(1000); // 1 segundo entre batches
        }
      }

      job.progress(95);

      // Verificar por problemas recorrentes após o job
      await this.checkAndAlertRecurringIssues();

      job.progress(100);

      result.processingTime = Date.now() - startTime;

      Logger.business('domain_verification_job', 'batch_job_completed', {
        metadata: {
          jobId: job.id,
          ...result,
          performance: {
            responseTime: result.processingTime,
            memoryUsage: process.memoryUsage()
          }
        }
      });

      return result;

    } catch (error) {
      const errorMessage = `Domain verification job failed: ${(error as Error).message}`;
      Logger.error('Domain verification batch job failed', error as Error, {
        context: { jobId: job.id, jobData }
      });

      return {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        partial: 0,
        skipped: 0,
        errors: [errorMessage],
        processingTime: Date.now() - startTime,
        domainResults: []
      };
    } finally {
      this.isRunning = false;
    }
  }

  // Processar job de verificação de domínio único
  private async processSingleDomainJob(job: Job<DomainVerificationJobData>): Promise<any> {
    const { domainId, userId, maxRetries = 2 } = job.data;
    
    if (!domainId) {
      throw new Error('Domain ID is required for single domain verification');
    }

    Logger.business('domain_verification_job', 'single_domain_job_started', {
      entityId: domainId.toString(),
      userId: userId?.toString(),
      metadata: { jobId: job.id, maxRetries }
    });

    try {
      // Buscar domínio
      const domain = await db('domains').where('id', domainId).first();
      if (!domain) {
        throw new Error(`Domain with ID ${domainId} not found`);
      }

      job.progress(25);

      // Verificar domínio com logging
      const result = await this.verifyDomainWithLogging(domain, maxRetries, job.id?.toString());

      job.progress(100);

      Logger.business('domain_verification_job', 'single_domain_job_completed', {
        entityId: domainId.toString(),
        userId: userId?.toString(),
        metadata: {
          jobId: job.id,
          domainName: domain.domain_name,
          status: result.overall_status,
          processingTime: result.processing_time
        }
      });

      return result;

    } catch (error) {
      Logger.error('Single domain verification job failed', error as Error, {
        context: { jobId: job.id, domainId, userId }
      });
      throw error;
    }
  }

  // Verificar domínio com logging completo
  private async verifyDomainWithLogging(
    domain: any, 
    maxRetries: number = 2, 
    jobId?: string
  ): Promise<{ overall_status: 'verified' | 'failed' | 'partial'; processing_time: number }> {
    const startTime = Date.now();
    
    try {
      // Iniciar log de verificação
      const logId = await domainVerificationLogger.logVerificationStart(
        domain.id,
        domain.domain_name,
        {
          userId: domain.user_id,
          isAutomatedVerification: true,
          jobId,
          retryCount: 0
        }
      );

      // Executar verificação
      const verificationResult = await this.verificationService.verifyAndUpdateDomain(domain.id);

      // Log de cada step
      await domainVerificationLogger.logVerificationStep(logId, 'spf', {
        status: verificationResult.spf.verified ? 'success' : 'failed',
        error: verificationResult.spf.error,
        recordFound: verificationResult.spf.record?.raw
      });

      await domainVerificationLogger.logVerificationStep(logId, 'dkim', {
        status: verificationResult.dkim.verified ? 'success' : 'failed',
        error: verificationResult.dkim.error,
        recordFound: verificationResult.dkim.record?.raw
      });

      await domainVerificationLogger.logVerificationStep(logId, 'dmarc', {
        status: verificationResult.dmarc.verified ? 'success' : 'failed',
        error: verificationResult.dmarc.error,
        recordFound: verificationResult.dmarc.record?.raw
      });

      // Determinar status geral
      const verifiedCount = [
        verificationResult.spf.verified,
        verificationResult.dkim.verified,
        verificationResult.dmarc.verified
      ].filter(Boolean).length;

      let overallStatus: 'verified' | 'failed' | 'partial';
      if (verifiedCount === 3) {
        overallStatus = 'verified';
      } else if (verifiedCount > 0) {
        overallStatus = 'partial';
      } else {
        overallStatus = 'failed';
      }

      const processingTime = Date.now() - startTime;

      // Log de conclusão
      await domainVerificationLogger.logVerificationComplete(logId, {
        overallStatus,
        errorSummary: verificationResult.errors.join('; '),
        totalDuration: processingTime
      });

      return { overall_status: overallStatus, processing_time: processingTime };

    } catch (error) {
      Logger.error('Domain verification with logging failed', error as Error, {
        context: { domainId: domain.id, domainName: domain.domain_name, jobId }
      });

      return { overall_status: 'failed', processing_time: Date.now() - startTime };
    }
  }

  // Buscar domínios para verificação baseado nos critérios
  private async getDomainsForVerification(jobData: DomainVerificationJobData): Promise<any[]> {
    try {
      let query = db('domains').select('*');

      if (jobData.domainId) {
        // Verificação de domínio específico
        query = query.where('id', jobData.domainId);
      } else if (jobData.retryFailedOnly) {
        // Apenas domínios que falharam na última verificação
        query = query.where('is_verified', false)
                    .whereNotNull('last_verification_attempt')
                    .where('last_verification_attempt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // Últimos 7 dias
      } else {
        // Domínios que precisam de verificação (não verificados ou verificados há mais de 7 dias)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        query = query.where(function() {
          this.where('is_verified', false)
              .orWhere('last_verification_attempt', '<', sevenDaysAgo)
              .orWhereNull('last_verification_attempt');
        });
      }

      // Limitar quantidade se especificado
      if (jobData.batchSize && jobData.batchSize > 0) {
        query = query.limit(jobData.batchSize);
      }

      // Ordenar por prioridade
      query = query.orderBy([
        { column: 'is_verified', order: 'asc' }, // Não verificados primeiro
        { column: 'last_verification_attempt', order: 'asc' }, // Mais antigos primeiro
        { column: 'created_at', order: 'asc' }
      ]);

      const domains = await query;

      Logger.business('domain_verification_job', 'domains_selected', {
        metadata: {
          totalFound: domains.length,
          criteria: jobData,
          domains: domains.map(d => ({
            id: d.id,
            name: d.domain_name,
            verified: d.is_verified,
            lastAttempt: d.last_verification_attempt
          }))
        }
      });

      return domains;
    } catch (error) {
      Logger.error('Failed to get domains for verification', error as Error, {
        context: { jobData }
      });
      throw error;
    }
  }

  // Verificar e alertar sobre problemas recorrentes
  private async checkAndAlertRecurringIssues(): Promise<void> {
    try {
      const issues = await domainVerificationLogger.checkForRecurringIssues();
      
      if (issues.alerts.length > 0) {
        Logger.security('domain_verification_recurring_issues', 'failure', {
          reason: `Problemas recorrentes detectados: ${issues.alerts.join(', ')}`,
          riskLevel: issues.highFailureRate ? 'high' : 'medium',
          resource: 'domain_verification_system'
        });

        // Se a taxa de falha for muito alta, pausar verificações automáticas temporariamente
        if (issues.highFailureRate) {
          Logger.security('domain_verification_system_pause', 'blocked', {
            reason: 'High failure rate detected, temporarily pausing automatic verifications',
            riskLevel: 'critical',
            resource: 'domain_verification_job'
          });

          // Aqui poderia implementar lógica para pausar jobs automáticos
          // Por exemplo, definir um flag no cache ou banco de dados
        }
      }
    } catch (error) {
      Logger.error('Failed to check for recurring domain verification issues', error as Error);
    }
  }

  // Utilidades
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Métodos públicos para agendar jobs

  // Agendar job recorrente (a cada 6 horas)
  public async scheduleRecurringJob(): Promise<void> {
    try {
      const analyticsQueue = (queueService as any).analyticsQueue;
      if (!analyticsQueue) {
        throw new Error('Analytics queue not available');
      }

      // Remover jobs recorrentes existentes
      const repeatableJobs = await analyticsQueue.getRepeatableJobs();
      const existingJob = repeatableJobs.find((job: any) => job.name === 'domain-verification');
      if (existingJob) {
        await analyticsQueue.removeRepeatableByKey(existingJob.key);
      }

      // Agendar novo job recorrente
      const jobData: DomainVerificationJobData = {
        batchSize: Env.getNumber('DOMAIN_VERIFICATION_BATCH_SIZE', 50),
        retryFailedOnly: false,
        isManualTrigger: false,
        maxRetries: 2,
        skipCache: false
      };

      await analyticsQueue.add('domain-verification', jobData, {
        repeat: { cron: '0 */6 * * *' }, // A cada 6 horas
        removeOnComplete: 10,
        removeOnFail: 5
      });

      Logger.business('domain_verification_job', 'recurring_job_scheduled', {
        metadata: {
          schedule: 'every 6 hours',
          batchSize: jobData.batchSize
        }
      });

    } catch (error) {
      Logger.error('Failed to schedule recurring domain verification job', error as Error);
      throw error;
    }
  }

  // Agendar verificação de domínio único
  public async scheduleSingleDomainVerification(
    domainId: number, 
    options: {
      userId?: number;
      priority?: number;
      delay?: number;
      maxRetries?: number;
    } = {}
  ): Promise<void> {
    try {
      const analyticsQueue = (queueService as any).analyticsQueue;
      if (!analyticsQueue) {
        throw new Error('Analytics queue not available');
      }

      const jobData: DomainVerificationJobData = {
        domainId,
        userId: options.userId,
        maxRetries: options.maxRetries || 2,
        isManualTrigger: true
      };

      await analyticsQueue.add('single-domain-verification', jobData, {
        priority: options.priority || 5,
        delay: options.delay || 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      });

      Logger.business('domain_verification_job', 'single_domain_scheduled', {
        entityId: domainId.toString(),
        userId: options.userId?.toString(),
        metadata: { jobData, options }
      });

    } catch (error) {
      Logger.error('Failed to schedule single domain verification', error as Error, {
        context: { domainId, options }
      });
      throw error;
    }
  }

  // Agendar verificação em lote manual
  public async scheduleBatchVerification(
    options: {
      batchSize?: number;
      retryFailedOnly?: boolean;
      userId?: number;
      priority?: number;
    } = {}
  ): Promise<void> {
    try {
      const analyticsQueue = (queueService as any).analyticsQueue;
      if (!analyticsQueue) {
        throw new Error('Analytics queue not available');
      }

      const jobData: DomainVerificationJobData = {
        batchSize: options.batchSize || 20,
        retryFailedOnly: options.retryFailedOnly || false,
        userId: options.userId,
        isManualTrigger: true,
        maxRetries: 2
      };

      await analyticsQueue.add('domain-verification', jobData, {
        priority: options.priority || 0,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 }
      });

      Logger.business('domain_verification_job', 'batch_verification_scheduled', {
        userId: options.userId?.toString(),
        metadata: { jobData, options }
      });

    } catch (error) {
      Logger.error('Failed to schedule batch domain verification', error as Error, {
        context: { options }
      });
      throw error;
    }
  }

  // Status e estatísticas
  public async getJobStats(): Promise<any> {
    try {
      const analyticsQueue = (queueService as any).analyticsQueue;
      if (!analyticsQueue) {
        return { error: 'Analytics queue not available' };
      }

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        analyticsQueue.getWaiting(),
        analyticsQueue.getActive(),
        analyticsQueue.getCompleted(),
        analyticsQueue.getFailed(),
        analyticsQueue.getDelayed()
      ]);

      // Filtrar apenas jobs de verificação de domínio
      const domainJobs = {
        waiting: waiting.filter((j: any) => 
          j.name === 'domain-verification' || j.name === 'single-domain-verification'
        ).length,
        active: active.filter((j: any) => 
          j.name === 'domain-verification' || j.name === 'single-domain-verification'
        ).length,
        completed: completed.filter((j: any) => 
          j.name === 'domain-verification' || j.name === 'single-domain-verification'
        ).length,
        failed: failed.filter((j: any) => 
          j.name === 'domain-verification' || j.name === 'single-domain-verification'
        ).length,
        delayed: delayed.filter((j: any) => 
          j.name === 'domain-verification' || j.name === 'single-domain-verification'
        ).length
      };

      return {
        ...domainJobs,
        isJobRunning: this.isRunning,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      Logger.error('Failed to get domain verification job stats', error as Error);
      return { error: (error as Error).message };
    }
  }

  // Limpeza de jobs antigos
  public async cleanupOldJobs(): Promise<void> {
    try {
      const analyticsQueue = (queueService as any).analyticsQueue;
      if (!analyticsQueue) {
        return;
      }

      // Limpar jobs completados (manter apenas 50)
      await analyticsQueue.clean(24 * 60 * 60 * 1000, 'completed', 50);
      
      // Limpar jobs falhos (manter apenas 25)
      await analyticsQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed', 25);

      Logger.business('domain_verification_job', 'cleanup_completed', {
        metadata: { cleanupType: 'jobs_cleanup' }
      });

    } catch (error) {
      Logger.error('Failed to cleanup old domain verification jobs', error as Error);
    }
  }
}

// Export singleton instance
export const domainVerificationJob = DomainVerificationJob.getInstance();