import { DomainVerificationService } from '../services/DomainVerificationService';
import { domainVerificationLogger } from '../services/DomainVerificationLogger';
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
      // Arquitetura simplificada V3 - sem Bull queues
      logger.info('Domain verification service initialized - simplified architecture', {
        business: {
          entity: 'domain_verification_job',
          action: 'simplified_processor_ready'
        }
      });
    } catch (error) {
      Logger.error('Failed to setup domain verification job processors', error as Error);
    }
  }

  // Processar job de verificação em lote - Arquitetura Simplificada V3
  public async processDomainVerificationJob(jobData: DomainVerificationJobData = {}): Promise<DomainVerificationResult> {
    const startTime = Date.now();
    const jobId = `job_${Date.now()}`; // ID simples
    
    Logger.business('domain_verification_job', 'batch_job_started', {
      metadata: {
        jobId,
        batchSize: jobData.batchSize || 'unlimited',
        retryFailedOnly: jobData.retryFailedOnly || false,
        isManualTrigger: jobData.isManualTrigger || false
      }
    });

    if (this.isRunning) {
      const message = 'Domain verification job already running, skipping';
      Logger.business('domain_verification_job', 'job_skipped', {
        metadata: { reason: 'already_running', jobId }
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
      // Buscar domínios para verificação
      const domainsToVerify = await this.getDomainsForVerification(jobData);
      
      if (domainsToVerify.length === 0) {
        Logger.business('domain_verification_job', 'no_domains_found', {
          metadata: { jobId, criteria: jobData }
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
        const progress = Math.round(15 + ((i / batches.length) * 80)); // 15% a 95%

        Logger.business('domain_verification_job', 'processing_batch', {
          metadata: {
            jobId,
            batchIndex: i + 1,
            totalBatches: batches.length,
            batchSize: batch.length,
            progress
          }
        });

        // Processar batch em paralelo (com limite de concorrência)
        const batchPromises = batch.map(domain => 
          this.verifyDomainWithLogging(domain, jobData.maxRetries || 2, jobId)
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

      // Verificar por problemas recorrentes após o job
      await this.checkAndAlertRecurringIssues();

      result.processingTime = Date.now() - startTime;

      Logger.business('domain_verification_job', 'batch_job_completed', {
        metadata: {
          jobId,
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
        context: { jobId, jobData }
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

  // Processar job de verificação de domínio único - Arquitetura Simplificada V3
  public async processSingleDomainJob(jobData: DomainVerificationJobData): Promise<any> {
    const { domainId, userId, maxRetries = 2 } = jobData;
    const jobId = `single_${Date.now()}`;
    
    if (!domainId) {
      throw new Error('Domain ID is required for single domain verification');
    }

    Logger.business('domain_verification_job', 'single_domain_job_started', {
      entityId: domainId.toString(),
      userId: userId?.toString(),
      metadata: { jobId, maxRetries }
    });

    try {
      // Buscar domínio
      const domain = await db('domains').where('id', domainId).first();
      if (!domain) {
        throw new Error(`Domain with ID ${domainId} not found`);
      }

      // Verificar domínio com logging
      const result = await this.verifyDomainWithLogging(domain, maxRetries, jobId);

      Logger.business('domain_verification_job', 'single_domain_job_completed', {
        entityId: domainId.toString(),
        userId: userId?.toString(),
        metadata: {
          jobId,
          domainName: domain.domain_name,
          status: result.overall_status,
          processingTime: result.processing_time
        }
      });

      return result;

    } catch (error) {
      Logger.error('Single domain verification job failed', error as Error, {
        context: { jobId, domainId, userId }
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

  // Executar verificação recorrente - Arquitetura Simplificada V3
  public async runRecurringVerification(): Promise<DomainVerificationResult> {
    const jobData: DomainVerificationJobData = {
      batchSize: Env.getNumber('DOMAIN_VERIFICATION_BATCH_SIZE', 50),
      retryFailedOnly: false,
      isManualTrigger: false,
      maxRetries: 2,
      skipCache: false
    };

    Logger.business('domain_verification_job', 'recurring_verification_started', {
      metadata: {
        batchSize: jobData.batchSize,
        architecture: 'simplified-v3'
      }
    });

    return this.processDomainVerificationJob(jobData);
  }

  // Executar verificação de domínio único - Arquitetura Simplificada V3
  public async runSingleDomainVerification(
    domainId: number, 
    options: {
      userId?: number;
      maxRetries?: number;
    } = {}
  ): Promise<any> {
    const jobData: DomainVerificationJobData = {
      domainId,
      userId: options.userId,
      maxRetries: options.maxRetries || 2,
      isManualTrigger: true
    };

    Logger.business('domain_verification_job', 'single_domain_execution_started', {
      entityId: domainId.toString(),
      userId: options.userId?.toString(),
      metadata: { jobData, options, architecture: 'simplified-v3' }
    });

    return this.processSingleDomainJob(jobData);
  }

  // Executar verificação em lote manual - Arquitetura Simplificada V3  
  public async runBatchVerification(
    options: {
      batchSize?: number;
      retryFailedOnly?: boolean;
      userId?: number;
    } = {}
  ): Promise<DomainVerificationResult> {
    const jobData: DomainVerificationJobData = {
      batchSize: options.batchSize || 20,
      retryFailedOnly: options.retryFailedOnly || false,
      userId: options.userId,
      isManualTrigger: true,
      maxRetries: 2
    };

    Logger.business('domain_verification_job', 'batch_verification_execution_started', {
      userId: options.userId?.toString(),
      metadata: { jobData, options, architecture: 'simplified-v3' }
    });

    return this.processDomainVerificationJob(jobData);
  }

  // Status e estatísticas - Arquitetura Simplificada V3
  public async getJobStats(): Promise<any> {
    try {
      // Arquitetura simplificada - apenas status básico do serviço
      const domainCount = await db('domains').count('* as total').first();
      const verifiedCount = await db('domains').where('is_verified', true).count('* as verified').first();
      const pendingCount = await db('domains').where('is_verified', false).count('* as pending').first();

      return {
        service: 'simplified-v3',
        isJobRunning: this.isRunning,
        domains: {
          total: domainCount?.total || 0,
          verified: verifiedCount?.verified || 0,
          pending: pendingCount?.pending || 0
        },
        architecture: 'direct-execution',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      Logger.error('Failed to get domain verification job stats', error as Error);
      return { error: (error as Error).message, architecture: 'simplified-v3' };
    }
  }

  // Limpeza de logs antigos - Arquitetura Simplificada V3
  public async cleanupOldJobs(): Promise<void> {
    try {
      // Arquitetura simplificada - limpeza de logs de verificação antigos
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Limpar logs de verificação antigos (se existir tabela de logs)
      try {
        await db.raw(`
          DELETE FROM domain_verification_logs 
          WHERE created_at < ? 
          LIMIT 1000
        `, [thirtyDaysAgo]);
      } catch (error) {
        // Tabela pode não existir, ignorar erro
        logger.info('Tabela domain_verification_logs não encontrada, pulando limpeza');
      }

      Logger.business('domain_verification_job', 'cleanup_completed', {
        metadata: { 
          cleanupType: 'logs_cleanup',
          architecture: 'simplified-v3',
          cutoffDate: thirtyDaysAgo.toISOString()
        }
      });

    } catch (error) {
      Logger.error('Failed to cleanup old domain verification logs', error as Error);
    }
  }
}

// Export singleton instance
export const domainVerificationJob = DomainVerificationJob.getInstance();