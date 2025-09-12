/**
 * 🚀 UNIFIED QUEUE ARCHITECTURE
 * Interface unificada que todos os componentes usam
 * Mantém compatibilidade com queueService existente
 */

import Bull, { Queue, Job } from 'bull';
import { logger } from '../config/logger';
import { TenantContextService, TenantContext } from './TenantContextService';

export interface TenantJobData {
  tenantId: number;
  userId: number; // Compatibilidade
  queuedAt: Date;
  priority?: number;
}

export interface TenantEmailJobData extends TenantJobData {
  emailId?: number;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: any;
  jobId?: string;
  createdAt?: Date;
}

export interface TenantBatchEmailJobData extends TenantJobData {
  batchId?: string;
  emails: TenantEmailJobData[];
  totalEmails: number;
  campaignId?: number;
}

export class TenantAwareQueueService {
  private emailQueue: Queue;
  private tenantContextService: TenantContextService;
  
  constructor() {
    // ✅ Reutilizar configuração Redis existente
    const redisConfig = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0')
    };

    // ✅ Fila global por tipo (compatível com API atual)
    this.emailQueue = new Bull('email-processing', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 }
      }
    });

    this.tenantContextService = TenantContextService.getInstance();
    this.setupProcessors();
  }

  /**
   * ✅ COMPATIBILIDADE: Método idêntico ao queueService atual
   */
  async addEmailJob(emailData: any): Promise<Job> {
    const tenantId = emailData.userId;
    
    // Validações de tenant ANTES de adicionar na fila
    await this.validateTenantLimits(tenantId, 'email');
    
    // Enriquece dados com contexto do tenant
    const enrichedData: TenantEmailJobData = {
      ...emailData,
      tenantId,
      queuedAt: new Date(),
      priority: await this.getTenantPriority(tenantId)
    };

    return this.emailQueue.add('send-email', enrichedData, {
      priority: enrichedData.priority || 0
    });
  }

  /**
   * ✅ COMPATIBILIDADE: Método de batch idêntico ao queueService atual
   */
  async addBatchEmailJob(emailsData: any[], options: any = {}): Promise<Job> {
    const tenantId = options.userId || (emailsData[0]?.userId);
    
    if (!tenantId) {
      throw new Error('Tenant ID is required for batch email jobs');
    }

    // Validações de tenant ANTES de adicionar na fila
    await this.validateTenantLimits(tenantId, 'batch_email');
    
    // Gerar batch ID
    const batchId = options.batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Enriquecer cada email com contexto do tenant
    const enrichedEmails = emailsData.map(email => ({
      ...email,
      tenantId,
      queuedAt: new Date()
    }));

    // Enriquece dados do batch com contexto do tenant
    const enrichedBatchData: TenantBatchEmailJobData = {
      batchId,
      emails: enrichedEmails,
      totalEmails: emailsData.length,
      tenantId,
      userId: tenantId,
      queuedAt: new Date(),
      priority: await this.getTenantPriority(tenantId),
      campaignId: options.campaignId
    };

    return this.emailQueue.add('send-batch', enrichedBatchData, {
      priority: -10 // Lower priority for batch jobs
    });
  }

  /**
   * 🔒 VALIDAÇÕES POR TENANT
   */
  private async validateTenantLimits(tenantId: number, operation: string): Promise<void> {
    try {
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      // Rate limiting por tenant
      const hourlyUsage = await this.getHourlyUsage(tenantId);
      const hourlyLimit = Math.floor(context.planLimits.emailsPerDay / 24);
      
      if (hourlyUsage >= hourlyLimit) {
        throw new Error(`Tenant ${tenantId} excedeu limite horário: ${hourlyUsage}/${hourlyLimit}`);
      }

      logger.debug('Tenant validation passed', {
        tenantId,
        operation,
        hourlyUsage,
        hourlyLimit
      });
    } catch (error) {
      logger.error('Tenant validation failed', { tenantId, operation, error });
      throw error;
    }
  }

  private async getTenantPriority(tenantId: number): Promise<number> {
    try {
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      // Prioridade baseada no plano
      const planPriority = {
        'free': 0,
        'basic': 5,
        'premium': 10,
        'enterprise': 20
      };
      
      return planPriority[context.plan as keyof typeof planPriority] || 0;
    } catch {
      return 0; // Default priority
    }
  }

  private async getHourlyUsage(tenantId: number): Promise<number> {
    // Implementar cache Redis para contadores por tenant
    const key = `tenant:${tenantId}:hourly:${new Date().getHours()}`;
    // Retornar contagem atual - placeholder por enquanto
    return 0;
  }

  /**
   * 🔧 SETUP DOS PROCESSORS (Roteamento Inteligente)
   */
  private setupProcessors(): void {
    // Processor para emails individuais
    this.emailQueue.process('send-email', 5, async (job: Job<TenantEmailJobData>) => {
      return await this.processEmailWithTenantIsolation(job);
    });

    // Processor para emails em batch
    this.emailQueue.process('send-batch', 2, async (job: Job<TenantBatchEmailJobData>) => {
      return await this.processBatchEmailWithTenantIsolation(job);
    });
  }

  /**
   * 🔒 PROCESSAMENTO COM ISOLAMENTO TOTAL POR TENANT
   */
  private async processEmailWithTenantIsolation(job: Job<TenantEmailJobData>): Promise<any> {
    const { tenantId } = job.data;
    const startTime = Date.now();

    try {
      // 1. Obter contexto isolado do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      
      // 2. ✅ REUTILIZAR TenantEmailProcessor existente
      const { TenantEmailProcessor } = await import('./TenantEmailProcessor');
      const processor = new TenantEmailProcessor();
      
      // 3. Processar com isolamento total
      const result = await processor.processEmailJob(job as any);

      logger.info('Tenant email processed successfully', {
        tenantId,
        jobId: job.id,
        processingTime: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Tenant email processing failed', {
        tenantId,
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });
      
      throw error;
    }
  }

  /**
   * 🔒 PROCESSAMENTO DE BATCH COM ISOLAMENTO TOTAL POR TENANT
   */
  private async processBatchEmailWithTenantIsolation(job: Job<TenantBatchEmailJobData>): Promise<any> {
    const { tenantId, emails } = job.data;
    const startTime = Date.now();

    try {
      // 1. Obter contexto isolado do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      
      // 2. ✅ REUTILIZAR TenantEmailProcessor existente
      const { TenantEmailProcessor } = await import('./TenantEmailProcessor');
      const processor = new TenantEmailProcessor();
      
      // 3. Processar batch com isolamento total
      const results = [];
      for (const emailData of emails) {
        const emailJob = {
          ...job,
          data: emailData
        };
        
        try {
          const result = await processor.processEmailJob(emailJob as any);
          results.push({ success: true, result });
        } catch (error) {
          results.push({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      logger.info('Tenant batch emails processed', {
        tenantId,
        jobId: job.id,
        batchId: job.data.batchId,
        totalEmails: emails.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        processingTime: Date.now() - startTime
      });

      return {
        batchId: job.data.batchId,
        results,
        summary: {
          total: emails.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      };
    } catch (error) {
      logger.error('Tenant batch email processing failed', {
        tenantId,
        jobId: job.id,
        batchId: job.data.batchId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });
      
      throw error;
    }
  }

  /**
   * ✅ MÉTODOS ADMINISTRATIVOS PARA COMPATIBILIDADE
   */
  async getQueueStats() {
    const waiting = await this.emailQueue.getWaiting();
    const active = await this.emailQueue.getActive();
    const completed = await this.emailQueue.getCompleted();
    const failed = await this.emailQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }

  async shutdown(): Promise<void> {
    await this.emailQueue.close();
    logger.info('TenantAwareQueueService shutdown complete');
  }
}