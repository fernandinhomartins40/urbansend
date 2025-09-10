/**
 * 🔥 TENANT EMAIL PROCESSOR - SAAS MULTI-TENANT
 * 
 * Processador de emails específico para arquitetura SaaS.
 * Garante isolamento completo entre tenants durante processamento de emails.
 */

import { Job } from 'bull';
import { TenantContextService, TenantContext } from './TenantContextService';
import { DomainValidator } from './DomainValidator';
import { MultiDomainDKIMManager } from './MultiDomainDKIMManager';
import { SMTPDeliveryService } from './smtpDelivery';
import { logger } from '../config/logger';
import db from '../config/database';
import { EmailJobData } from './TenantQueueManager';

export interface EmailProcessingResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
  deliveryTime?: number;
}

export class TenantEmailProcessor {
  private tenantContextService: TenantContextService;
  private domainValidator: DomainValidator;
  private dkimManager: MultiDomainDKIMManager;
  private smtpService: SMTPDeliveryService;

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
    this.domainValidator = new DomainValidator();
    this.dkimManager = new MultiDomainDKIMManager();
    this.smtpService = new SMTPDeliveryService();
  }

  /**
   * Processa job de email com isolamento completo de tenant
   */
  async processEmailJob(job: Job<EmailJobData>): Promise<EmailProcessingResult> {
    const startTime = Date.now();
    const { tenantId, emailId, from, to, subject, html, text, priority } = job.data;

    try {
      logger.info('🚀 Processando job de email Bull', {
        jobId: job.id,
        tenantId,
        emailId,
        from,
        to,
        priority,
        queueName: job.queue.name
      });

      // 🔒 STEP 1: Validar contexto do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      if (!tenantContext || !tenantContext.isActive) {
        throw new Error(`Tenant ${tenantId} não está ativo ou não existe`);
      }

      // 🔒 STEP 2: Validar propriedade do domínio
      const fromDomain = this.extractDomain(from);
      const domainOwned = tenantContext.verifiedDomains.some(
        domain => domain.domainName === fromDomain && domain.isVerified
      );

      if (!domainOwned) {
        throw new Error(`Domínio ${fromDomain} não pertence ao tenant ${tenantId}`);
      }

      // 🔒 STEP 3: Aplicar rate limiting por tenant
      const canSend = await this.tenantContextService.validateTenantOperation(
        tenantId,
        {
          operation: 'send_email',
          resource: fromDomain,
          metadata: { from, to, subject }
        }
      );

      if (!canSend.allowed) {
        throw new Error(`Rate limit excedido: ${canSend.reason}`);
      }

      // 🔒 STEP 4: Obter configuração DKIM
      const dkimConfig = tenantContext.dkimConfigurations.find(
        config => config.domainName === fromDomain && config.isActive
      );

      if (!dkimConfig) {
        throw new Error(`Configuração DKIM não encontrada para domínio ${fromDomain}`);
      }

      // 🔒 STEP 5: Assinar email com DKIM
      const signedEmail = await this.dkimManager.signEmail({
        from,
        to,
        subject,
        html,
        text,
        messageId: `email_${job.id}_${Date.now()}`
      });

      // 🔒 STEP 6: Entregar email via SMTP
      const messageId = signedEmail.messageId || `email_${job.id}_${Date.now()}`;
      const deliverySuccess = await this.smtpService.deliverEmail({
        from: signedEmail.from,
        to: signedEmail.to,
        subject: signedEmail.subject,
        html: signedEmail.html,
        text: signedEmail.text || text,
        message_id: messageId,
        headers: signedEmail.headers
      });

      if (!deliverySuccess) {
        throw new Error('SMTP delivery failed');
      }

      // 🔒 STEP 7: Registrar entrega bem-sucedida
      await this.recordEmailDelivery(job.data, 'delivered', messageId);

      // 🔒 STEP 8: Atualizar métricas por tenant
      await this.updateTenantMetrics(tenantId, 'email_sent');

      const processingTime = Date.now() - startTime;

      logger.info('✅ Email Bull job processado com sucesso', {
        jobId: job.id,
        tenantId,
        emailId,
        messageId: deliveryResult.messageId,
        from,
        to,
        processingTime
      });

      return {
        success: true,
        messageId: messageId,
        deliveryTime: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      logger.error('❌ Falha no processamento Bull job', {
        jobId: job.id,
        tenantId,
        emailId,
        from,
        to,
        error: errorMessage,
        processingTime
      });

      // Registrar falha
      await this.recordEmailDelivery(job.data, 'failed', undefined, errorMessage);
      await this.updateTenantMetrics(tenantId, 'email_failed');

      throw error;
    }
  }

  /**
   * Registra entrega ou falha de email
   */
  private async recordEmailDelivery(
    jobData: EmailJobData,
    status: 'delivered' | 'failed' | 'processing',
    messageId?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      // Verificar se já existe um registro para este email
      const existing = await db('emails')
        .where('email_id', jobData.emailId)
        .where('user_id', jobData.tenantId)
        .first();

      if (existing) {
        // Atualizar registro existente
        await db('emails')
          .where('id', existing.id)
          .update({
            status,
            message_id: messageId || existing.message_id,
            error_message: errorMessage,
            delivered_at: status === 'delivered' ? new Date() : null,
            updated_at: new Date()
          });
      } else {
        // Criar novo registro
        await db('emails').insert({
          email_id: jobData.emailId,
          user_id: jobData.tenantId,
          message_id: messageId || `email_${jobData.emailId}_${Date.now()}`,
          from_address: jobData.from,
          to_address: jobData.to,
          subject: jobData.subject,
          html_body: jobData.html,
          text_body: jobData.text,
          status,
          error_message: errorMessage,
          priority: jobData.priority || 0,
          delivered_at: status === 'delivered' ? new Date() : null,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      logger.debug('📝 Registro de email atualizado', {
        emailId: jobData.emailId,
        tenantId: jobData.tenantId,
        status,
        messageId
      });

    } catch (error) {
      logger.error('❌ Falha ao registrar entrega de email', {
        emailId: jobData.emailId,
        tenantId: jobData.tenantId,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  }

  /**
   * Extrai domínio do email
   */
  private extractDomain(email: string): string {
    return email.split('@')[1] || '';
  }


  /**
   * Atualiza métricas específicas do tenant
   */
  private async updateTenantMetrics(tenantId: number, metricType: string): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar ou criar registro de métrica na tabela de analytics
      const existingMetric = await db('email_analytics')
        .where('user_id', tenantId)
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
          .where('user_id', tenantId) // 🔒 CRÍTICO: Isolamento por tenant
          .update(updateData);
      } else {
        // Criar nova métrica
        const newMetric: Record<string, any> = {
          user_id: tenantId,
          date: now.toISOString().split('T')[0],
          sent_count: metricType === 'email_sent' ? 1 : 0,
          failed_count: metricType === 'email_failed' ? 1 : 0,
          created_at: now,
          updated_at: now
        };

        await db('email_analytics').insert(newMetric);
      }

      logger.debug('📊 Métricas do tenant atualizadas', {
        tenantId,
        metricType
      });

    } catch (error) {
      logger.error('❌ Erro ao atualizar métricas do tenant', {
        tenantId,
        metricType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}