/**
 * 📧 UNIFIED EMAIL SERVICE
 * Serviço unificado inspirado no InternalEmailService que funciona
 * Versão: 1.0.0 - Simples, Robusto e Funcional
 */

import { logger } from '../config/logger';
import { SMTPDeliveryService } from '../services/smtpDelivery';
import { generateTrackingId } from '../utils/crypto';
import { sanitizeEmailHtml } from '../middleware/validation';
import db from '../config/database';
import { SimpleEmailValidator } from './EmailValidator';
import { EmailMetricsCollector } from './EmailMetricsCollector';
import {
  EmailData,
  EmailContext,
  EmailResult,
  EmailRecord,
  EmailEvent,
  EmailStatus,
  ValidationResult
} from './types';

export class UnifiedEmailService {
  private readonly smtpDelivery: SMTPDeliveryService;
  private readonly emailValidator: SimpleEmailValidator;
  private readonly metricsCollector: EmailMetricsCollector;
  private readonly enableMetrics: boolean;

  constructor(options: { 
    enableMetrics?: boolean;
    enableDomainValidation?: boolean;
    strictValidation?: boolean;
  } = {}) {
    this.smtpDelivery = new SMTPDeliveryService();
    this.emailValidator = new SimpleEmailValidator();
    this.enableMetrics = options.enableMetrics !== false; // Default true
    this.metricsCollector = new EmailMetricsCollector({
      enableRealTimeAlerts: this.enableMetrics
    });

    logger.debug('UnifiedEmailService initialized', {
      enableMetrics: this.enableMetrics,
      enableDomainValidation: options.enableDomainValidation !== false,
      service: 'external-email'
    });
  }

  /**
   * Envia email de forma síncrona e robusta
   * Baseado no padrão do InternalEmailService que funciona
   */
  async sendEmail(data: EmailData, context: EmailContext): Promise<EmailResult> {
    const startTime = Date.now();
    const trackingId = generateTrackingId();
    
    try {
      logger.info('Processing external email', {
        trackingId,
        userId: context.userId,
        from: data.from,
        to: Array.isArray(data.to) ? `${data.to.length} recipients` : data.to,
        subject: data.subject?.substring(0, 50) + (data.subject && data.subject.length > 50 ? '...' : '')
      });

      // 1. Validação básica obrigatória
      this.validateBasicEmailData(data);

      // 2. Validação de domínio e aplicação de fallback se necessário
      const validationResult = this.emailValidator.validate(data);
      if (!validationResult.isValid) {
        throw new Error(`Email validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Usar email original (validação básica passou)
      const validatedEmailData = data;
      const domainValidated = true; // Validação simples passou
      const fallbackApplied = false; // Arquitetura simplificada

      // 3. Verificar quotas antes do envio
      await this.checkQuotas(context);

      // 4. Preparar dados para SMTP (sanitização)
      const emailDataForSMTP = this.prepareEmailForSMTP(validatedEmailData, trackingId);

      // 4. Envio via SMTP (reutilizar o que funciona)
      const smtpResult = await this.smtpDelivery.deliverEmail(emailDataForSMTP);
      const latency = Date.now() - startTime;

      if (!smtpResult) {
        throw new Error('SMTP delivery failed - no response');
      }

      // 5. Registro no banco APÓS envio bem-sucedido
      const emailRecord = await this.recordEmail(validatedEmailData, context, 'sent', {
        trackingId,
        latency,
        smtpResponse: 'delivered',
        domainValidated,
        fallbackApplied,
        originalFrom: data.from !== validatedEmailData.from ? data.from : undefined
      });

      // 6. Registrar métricas se habilitado
      if (this.enableMetrics) {
        await this.metricsCollector.recordEmailEvent({
          type: 'sent',
          userId: context.userId,
          messageId: trackingId,
          timestamp: new Date(),
          latency,
          metadata: { 
            emailId: emailRecord.id,
            domainValidated,
            fallbackApplied,
            originalFrom: data.from !== validatedEmailData.from ? data.from : undefined
          }
        });
      }

      logger.info('Email sent successfully', {
        trackingId,
        userId: context.userId,
        latency: `${latency}ms`,
        emailId: emailRecord.id
      });

      return {
        success: true,
        messageId: trackingId,
        trackingId,
        latency
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Email sending failed', {
        trackingId,
        userId: context.userId,
        error: errorMessage,
        latency: `${latency}ms`
      });

      // Registrar falha no banco
      try {
        await this.recordEmail(data, context, 'failed', {
          trackingId,
          latency,
          errorMessage,
          domainValidated: false,
          fallbackApplied: false
        });

        // Registrar métricas de falha
        if (this.enableMetrics) {
          await this.metricsCollector.recordEmailEvent({
            type: 'failed',
            userId: context.userId,
            messageId: trackingId,
            timestamp: new Date(),
            latency,
            error: errorMessage,
            metadata: {
              originalFrom: data.from,
              failureReason: errorMessage
            }
          });
        }
      } catch (dbError) {
        logger.error('Failed to record email failure in database', {
          trackingId,
          dbError: dbError instanceof Error ? dbError.message : 'Unknown DB error'
        });
      }

      return {
        success: false,
        error: errorMessage,
        latency
      };
    }
  }

  /**
   * Validação básica dos dados de email
   */
  private validateBasicEmailData(data: EmailData): void {
    const errors: string[] = [];

    if (!data.from || typeof data.from !== 'string' || data.from.trim() === '') {
      errors.push('from: must be a valid non-empty string');
    }

    if (!data.to || (typeof data.to !== 'string' && !Array.isArray(data.to))) {
      errors.push('to: must be a valid string or array of strings');
    }

    if (!data.subject || typeof data.subject !== 'string' || data.subject.trim() === '') {
      errors.push('subject: must be a valid non-empty string');
    }

    if (!data.html && !data.text) {
      errors.push('content: must provide either html or text content');
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Verificar quotas do usuário
   */
  private async checkQuotas(context: EmailContext): Promise<void> {
    const quotas = context.quotas;
    
    if (quotas.dailyUsed >= quotas.dailyLimit) {
      throw new Error(`Daily quota exceeded: ${quotas.dailyUsed}/${quotas.dailyLimit}`);
    }

    if (quotas.hourlyUsed >= quotas.hourlyLimit) {
      throw new Error(`Hourly quota exceeded: ${quotas.hourlyUsed}/${quotas.hourlyLimit}`);
    }

    if (quotas.monthlyUsed >= quotas.monthlyLimit) {
      throw new Error(`Monthly quota exceeded: ${quotas.monthlyUsed}/${quotas.monthlyLimit}`);
    }
  }

  /**
   * Preparar dados para SMTP
   */
  private prepareEmailForSMTP(data: EmailData, trackingId: string): any {
    return {
      from: data.from,
      to: data.to,
      subject: data.subject,
      html: data.html ? sanitizeEmailHtml(data.html) : undefined,
      text: data.text,
      cc: data.cc,
      bcc: data.bcc,
      replyTo: data.replyTo,
      attachments: data.attachments,
      headers: {
        'X-UltraZend-Service': 'external',
        'X-UltraZend-Tracking-ID': trackingId,
        'X-Message-ID': trackingId
      }
    };
  }

  /**
   * Registrar email no banco de dados
   */
  private async recordEmail(
    data: EmailData, 
    context: EmailContext, 
    status: EmailStatus,
    metadata: {
      trackingId: string;
      latency: number;
      smtpResponse?: string;
      errorMessage?: string;
      domainValidated?: boolean;
      fallbackApplied?: boolean;
      originalFrom?: string;
    }
  ): Promise<EmailRecord> {
    try {
      const emailRecord: Partial<EmailRecord> = {
        userId: context.userId,
        messageId: metadata.trackingId,
        fromEmail: data.from,
        toEmail: Array.isArray(data.to) ? data.to.join(',') : data.to,
        subject: data.subject,
        htmlContent: data.html,
        textContent: data.text,
        status,
        sentAt: new Date(),
        errorMessage: metadata.errorMessage,
        tenantId: context.tenantId,
        domainValidated: metadata.domainValidated || false,
        fallbackApplied: metadata.fallbackApplied || false,
        deliveryLatencyMs: metadata.latency,
        smtpResponse: metadata.smtpResponse,
        originalFrom: metadata.originalFrom
      };

      const [emailId] = await db('emails').insert({
        user_id: emailRecord.userId,
        message_id: emailRecord.messageId,
        from_email: emailRecord.fromEmail,
        to_email: emailRecord.toEmail,
        subject: emailRecord.subject,
        html_content: emailRecord.htmlContent,
        text_content: emailRecord.textContent,
        status: emailRecord.status,
        sent_at: emailRecord.sentAt,
        error_message: emailRecord.errorMessage,
        tenant_id: emailRecord.tenantId,
        domain_validated: emailRecord.domainValidated,
        fallback_applied: emailRecord.fallbackApplied,
        delivery_latency_ms: emailRecord.deliveryLatencyMs,
        smtp_response: emailRecord.smtpResponse,
        created_at: emailRecord.sentAt,
        updated_at: emailRecord.sentAt
      });

      logger.debug('Email recorded in database', {
        emailId,
        messageId: metadata.trackingId,
        userId: context.userId,
        status
      });

      return {
        ...emailRecord,
        id: emailId
      } as EmailRecord;

    } catch (error) {
      logger.error('Failed to record email in database', {
        trackingId: metadata.trackingId,
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Obter métricas detalhadas do usuário
   */
  async getUserMetrics(userId: number, timeframe?: { 
    hours?: number; 
    days?: number; 
    weeks?: number; 
  }): Promise<any> {
    return await this.metricsCollector.getUserMetrics(userId, timeframe);
  }

  /**
   * Obter relatório de saúde do sistema
   */
  async getSystemHealthReport(): Promise<any> {
    return await this.metricsCollector.generateHealthReport();
  }

  /**
   * Método para teste de conexão SMTP
   */
  async testConnection(): Promise<boolean> {
    try {
      logger.debug('Testing SMTP connection for external email service');
      
      // Reutilizar o método de teste do SMTPDeliveryService
      const testResult = await this.smtpDelivery.deliverEmail({
        from: 'test@ultrazend.com.br',
        to: 'test@ultrazend.com.br',
        subject: 'Test Connection - UnifiedEmailService',
        text: 'This is a connection test from UnifiedEmailService',
        headers: {
          'X-UltraZend-Service': 'external',
          'X-Test': 'connection-test'
        }
      });

      logger.info('External email service connection test completed', {
        success: !!testResult
      });

      return !!testResult;
    } catch (error) {
      logger.error('External email service connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Obter estatísticas básicas do serviço
   */
  async getServiceStats(): Promise<any> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const stats = await db('emails')
        .select(
          db.raw('COUNT(*) as total_emails'),
          db.raw("COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count"),
          db.raw("COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count"),
          db.raw("AVG(CASE WHEN status = 'sent' THEN delivery_latency_ms END) as avg_latency"),
          db.raw('COUNT(DISTINCT user_id) as unique_users')
        )
        .where('sent_at', '>=', today)
        .first();

      const typedStats = stats as any;
      return {
        date: today,
        ...stats,
        success_rate: typedStats.total_emails > 0 ? 
          ((typedStats.sent_count / typedStats.total_emails) * 100).toFixed(2) + '%' : '0%'
      };
    } catch (error) {
      logger.error('Failed to get service stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
}