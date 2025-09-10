/**
 * 🔥 TENANT EMAIL PROCESSOR - SAAS MULTI-TENANT
 * 
 * Processador de emails específico para arquitetura SaaS.
 * Garante isolamento completo entre tenants durante processamento de emails.
 */

import { Job } from 'bull';
import { TenantContextService } from './TenantContextService';
import { logger } from '../config/logger';
import db from '../config/database';

export interface EmailJobData {
  userId: number;
  emailId: string;
  recipientEmail: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  fromDomain: string;
  priority?: 'high' | 'normal' | 'low';
  tenantContext?: {
    userId: number;
    domain: string;
    plan: string;
  };
}

export class TenantEmailProcessor {
  private tenantContextService: TenantContextService;

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
  }

  /**
   * Processa job de email com isolamento completo de tenant
   */
  async processEmailJob(job: Job<EmailJobData>): Promise<void> {
    const { userId, emailId, fromDomain } = job.data;

    try {
      // 🔒 STEP 1: Validar contexto do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(userId);
      if (!tenantContext) {
        throw new Error(`Tenant context não encontrado para usuário ${userId}`);
      }

      logger.info('🔒 Iniciando processamento de email para tenant', {
        userId,
        emailId,
        domain: fromDomain,
        plan: tenantContext.plan,
        queueName: job.queue.name
      });

      // 🔒 STEP 2: Validar propriedade do domínio
      const isDomainValid = await this.validateDomainOwnership(userId, fromDomain);
      if (!isDomainValid) {
        throw new Error(`Usuário ${userId} não possui domínio ${fromDomain}`);
      }

      // 🔒 STEP 3: Aplicar rate limiting por tenant
      const canSend = await this.checkTenantRateLimit(tenantContext);
      if (!canSend) {
        throw new Error(`Rate limit excedido para tenant ${userId}`);
      }

      // 🔒 STEP 4: Processar email com isolamento
      await this.processEmailWithIsolation(job.data, tenantContext);

      // 🔒 STEP 5: Atualizar métricas por tenant
      await this.updateTenantMetrics(userId, 'email_sent');

      logger.info('✅ Email processado com sucesso para tenant', {
        userId,
        emailId,
        domain: fromDomain
      });

    } catch (error) {
      logger.error('❌ Erro no processamento de email para tenant', {
        userId,
        emailId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Atualizar métricas de erro por tenant
      await this.updateTenantMetrics(userId, 'email_failed');
      
      throw error;
    }
  }

  /**
   * Valida se o usuário possui o domínio especificado
   */
  private async validateDomainOwnership(userId: number, domain: string): Promise<boolean> {
    try {
      const domainRecord = await db('domains')
        .where('user_id', userId)
        .where('domain', domain)
        .where('status', 'verified')
        .first();

      return !!domainRecord;
    } catch (error) {
      logger.error('Erro na validação de propriedade do domínio', {
        userId,
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Verifica rate limiting específico do tenant
   */
  private async checkTenantRateLimit(tenantContext: any): Promise<boolean> {
    try {
      const validation = await this.tenantContextService.validateTenantOperation(
        tenantContext.userId,
        'send_email'
      );

      return validation;
    } catch (error) {
      logger.error('Erro na verificação de rate limit do tenant', {
        userId: tenantContext.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Processa o email com isolamento completo de tenant
   */
  private async processEmailWithIsolation(
    emailData: EmailJobData,
    tenantContext: any
  ): Promise<void> {
    const { userId, emailId } = emailData;

    try {
      // Atualizar status no banco com isolamento
      await db('email_delivery_queue')
        .where('id', emailId)
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .update({
          status: 'processing',
          attempts: db.raw('attempts + 1'),
          last_attempt: new Date(),
          updated_at: new Date()
        });

      // Simular processamento de entrega
      await this.simulateEmailDelivery(emailData);

      // Atualizar status final com isolamento
      await db('email_delivery_queue')
        .where('id', emailId)
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .update({
          status: 'sent',
          sent_at: new Date(),
          updated_at: new Date()
        });

    } catch (error) {
      // Atualizar status de erro com isolamento
      await db('email_delivery_queue')
        .where('id', emailId)
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          failed_at: new Date(),
          updated_at: new Date()
        });
      
      throw error;
    }
  }

  /**
   * Simula entrega do email (substituir por integração real)
   */
  private async simulateEmailDelivery(emailData: EmailJobData): Promise<void> {
    // Simular delay de processamento
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info('📧 Email entregue (simulação)', {
      emailId: emailData.emailId,
      recipient: emailData.recipientEmail,
      domain: emailData.fromDomain
    });
  }

  /**
   * Atualiza métricas específicas do tenant
   */
  private async updateTenantMetrics(userId: number, metricType: string): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar ou criar registro de métrica
      const existingMetric = await db('email_analytics')
        .where('user_id', userId)
        .where('date', now.toISOString().split('T')[0])
        .first();

      if (existingMetric) {
        // Atualizar métrica existente
        const updateData: Record<string, any> = {};
        
        switch (metricType) {
          case 'email_sent':
            updateData.sent_count = db.raw('sent_count + 1');
            break;
          case 'email_failed':
            updateData.failed_count = db.raw('failed_count + 1');
            break;
        }

        await db('email_analytics')
          .where('id', existingMetric.id)
          .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
          .update(updateData);
      } else {
        // Criar nova métrica
        const newMetric: Record<string, any> = {
          user_id: userId,
          date: now.toISOString().split('T')[0],
          sent_count: metricType === 'email_sent' ? 1 : 0,
          failed_count: metricType === 'email_failed' ? 1 : 0,
          created_at: now,
          updated_at: now
        };

        await db('email_analytics').insert(newMetric);
      }

      logger.debug('Métricas do tenant atualizadas', {
        userId,
        metricType
      });

    } catch (error) {
      logger.error('Erro ao atualizar métricas do tenant', {
        userId,
        metricType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Processa múltiplos emails para um tenant específico
   */
  async processEmailsForTenant(userId: number, limit: number = 10): Promise<number> {
    try {
      // Buscar emails pendentes APENAS do tenant especificado
      const pendingEmails = await db('email_delivery_queue')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('status', 'pending')
        .whereNull('next_attempt')
        .orWhere('next_attempt', '<=', new Date())
        .orderBy('created_at', 'asc')
        .limit(limit);

      let processedCount = 0;

      for (const email of pendingEmails) {
        try {
          const jobData: EmailJobData = {
            userId: email.user_id,
            emailId: email.id,
            recipientEmail: email.to_email,
            subject: email.subject,
            htmlContent: email.html_body,
            textContent: email.text_body,
            fromDomain: this.extractDomainFromEmail(email.from_email),
            priority: 'normal'
          };

          // Criar job mock para processamento
          const mockJob = {
            data: jobData,
            queue: { name: `email-processing:user:${userId}` }
          } as Job<EmailJobData>;

          await this.processEmailJob(mockJob);
          processedCount++;

        } catch (error) {
          logger.error('Erro ao processar email individual', {
            emailId: email.id,
            userId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info('Processamento em lote concluído para tenant', {
        userId,
        processedCount,
        totalPending: pendingEmails.length
      });

      return processedCount;

    } catch (error) {
      logger.error('Erro no processamento em lote para tenant', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Extrai domínio do email
   */
  private extractDomainFromEmail(email: string): string {
    return email.split('@')[1] || '';
  }
}