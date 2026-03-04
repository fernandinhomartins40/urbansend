/**
 * 🎯 MULTI-TENANT EMAIL SERVICE - ARQUITETURA SIMPLIFICADA
 * 
 * Baseado no InternalEmailService que funciona perfeitamente
 * Implementa multi-tenancy com simplicidade e confiabilidade
 * 
 * Filosofia: "Simplicidade é a sofisticação suprema"
 */

import { SMTPDeliveryService } from './smtpDelivery';
import { logger } from '../config/logger';
import { SimpleEmailValidator } from '../email/EmailValidator';
import db from '../config/database';
import { emailTrackingService } from './EmailTrackingService';
import { emailWebhookEventService } from './EmailWebhookEventService';
import {
  buildHtmlFromText,
  buildTextFromHtml,
  generateTrackingPixel,
  normalizeOptionalEmailContent,
  processLinksForTracking,
  processTemplate
} from '../utils/email';

// Interfaces específicas para multi-tenancy
export interface EmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template_id?: string;
  template_data?: Record<string, any>;
  variables?: Record<string, any>;
  tracking_enabled?: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  tenant_id?: number;
  api_key_id?: number | null;
}

export interface EmailResult {
  success: boolean;
  message: string;
  message_id?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  domain_verified?: boolean;
  domain?: string;
  error?: string;
}

export interface EmailLogData {
  user_id: number;
  tenant_id?: number;
  api_key_id?: number | null;
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  status: 'sent' | 'failed' | 'pending';
  error_message?: string;
  timestamp: Date;
  message_id?: string;
  tracking_id?: string;
}

/**
 * Serviço de email multi-tenant simplificado
 * 
 * Características preservadas:
 * - Autenticação JWT obrigatória
 * - Validação de propriedade de domínio
 * - Rate limiting por tenant
 * - Logs por tenant no banco
 * - Execução assíncrona como sistema interno
 */
export class MultiTenantEmailService {
  private readonly smtpDelivery: SMTPDeliveryService;
  private readonly emailValidator: SimpleEmailValidator;
  private emailTableSupportsApiKeyId: boolean | null = null;

  constructor() {
    this.smtpDelivery = new SMTPDeliveryService();
    this.emailValidator = new SimpleEmailValidator();

    logger.info('🚀 MultiTenantEmailService initialized', {
      mode: 'simplified-architecture',
      basedOn: 'InternalEmailService',
      features: ['domain-validation', 'multi-tenancy', 'async-execution']
    });
  }

  /**
   * Enviar email com validação multi-tenancy
   * 
   * Fluxo simplificado inspirado no InternalEmailService:
   * 1. Validação rápida
   * 2. setImmediate() para execução assíncrona
   * 3. SMTP + persistência em paralelo
   * 4. Resposta imediata
   */
  async sendEmail(emailData: EmailRequest, user: AuthUser): Promise<EmailResult> {
    try {
      const preparedEmailData = await this.prepareEmailRequest(emailData, user.id);

      logger.info('📧 MultiTenant: Initiating email sending', {
        userId: user.id,
        tenantId: user.tenant_id,
        from: preparedEmailData.from,
        to: Array.isArray(preparedEmailData.to) ? `${preparedEmailData.to.length} recipients` : preparedEmailData.to,
        subject: preparedEmailData.subject
      });

      // 1. Validação rápida de entrada
      const validationResult = this.validateEmailData(preparedEmailData);
      if (!validationResult.valid) {
        return {
          success: false,
          message: validationResult.error || 'Validation failed',
          status: 'failed',
          error: validationResult.error
        };
      }

      // 2. Validar propriedade do domínio (multi-tenancy essencial)
      const domain = this.extractDomain(preparedEmailData.from);
      if (!domain) {
        return {
          success: false,
          message: 'Invalid email format in "from" field',
          status: 'failed',
          error: 'INVALID_EMAIL_FORMAT'
        };
      }

      const domainCheck = await this.emailValidator.checkDomainOwnership(domain, user.id);
      if (!domainCheck.verified) {
        return {
          success: false,
          message: `Domain '${domain}' not verified. Please verify at /domains`,
          status: 'failed',
          error: 'DOMAIN_NOT_VERIFIED',
          domain
        };
      }

      // 3. Gerar IDs únicos
      const messageId = this.generateMessageId();
      const trackingId = this.generateTrackingId();

      // 4. Salvar imediatamente no banco como 'pending' (rápido para UI)
      const processingLog: EmailLogData = {
        user_id: user.id,
        tenant_id: user.tenant_id || null,
        api_key_id: user.api_key_id || null,
        from: preparedEmailData.from,
        to: Array.isArray(preparedEmailData.to) ? preparedEmailData.to.join(', ') : preparedEmailData.to,
        subject: preparedEmailData.subject,
        html: preparedEmailData.html,
        text: preparedEmailData.text,
        status: 'pending',
        timestamp: new Date(),
        message_id: messageId,
        tracking_id: trackingId,
        error_message: null
      };

      await this.saveEmailLog(processingLog);
      void emailWebhookEventService.emitByMessageId('email.sent', messageId, {
        accepted_by_server: false,
        domain,
        source: 'send_request_accepted',
        triggered_by: user.api_key_id ? 'api_key' : 'jwt'
      });

      // 5. Processamento SMTP assíncrono (não bloquear UI)
      setImmediate(async () => {
        await this.processEmailAsync(preparedEmailData, user, domain, messageId, trackingId);
      });

      // 6. Resposta imediata (email já aparece na lista)
      return {
        success: true,
        message: 'Email queued for delivery with verified domain',
        message_id: messageId,
        status: 'pending',
        domain_verified: true,
        domain
      };

    } catch (error) {
      logger.error('❌ MultiTenant: Email send failed', {
        userId: user.id,
        from: emailData.from,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        message: 'Email sending failed',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async prepareEmailRequest(emailData: EmailRequest, userId: number): Promise<EmailRequest> {
    const variables = emailData.variables || emailData.template_data || {};
    let subject = emailData.subject;
    let html = normalizeOptionalEmailContent(emailData.html);
    let text = normalizeOptionalEmailContent(emailData.text);

    if (emailData.template_id) {
      const template = await db('email_templates')
        .where('id', emailData.template_id)
        .where('user_id', userId)
        .first();

      if (!template) {
        throw new Error('Template not found');
      }

      subject = subject || template.subject || '';
      html = html || normalizeOptionalEmailContent(template.html_content) || '';
      text = text || normalizeOptionalEmailContent(template.text_content) || '';
    }

    if (Object.keys(variables).length > 0) {
      subject = subject ? processTemplate(subject, variables) : subject;
      html = html ? processTemplate(html, variables) : html;
      text = text ? processTemplate(text, variables) : text;
    }

    html = normalizeOptionalEmailContent(html);
    text = normalizeOptionalEmailContent(text);

    if (!html && text) {
      html = buildHtmlFromText(text);
    }

    if (!text && html) {
      text = buildTextFromHtml(html);
    }

    return {
      ...emailData,
      subject,
      html,
      text,
      template_data: variables,
      variables,
      tracking_enabled: emailData.tracking_enabled !== false
    };
  }

  /**
   * Processamento assíncrono do email (inspirado no InternalEmailService)
   *
   * Executa em paralelo:
   * - Entrega SMTP com tracking
   * - Persistência no banco
   * - Logs estruturados
   */
  private async processEmailAsync(
    emailData: EmailRequest,
    user: AuthUser,
    domain: string,
    messageId: string,
    trackingId: string
  ): Promise<void> {
    // Preparar HTML com tracking pixel (de forma segura) - fora do try/catch
    let finalHtml = emailData.html;
    if (finalHtml && emailData.tracking_enabled !== false) {
      finalHtml = this.addTrackingPixelSafely(finalHtml, trackingId);
    }

    try {
      logger.info('🔄 Processing email asynchronously', {
        userId: user.id,
        messageId,
        domain
      });

      if (finalHtml) {
        logger.debug('📧 Tracking pixel added', {
          userId: user.id,
          messageId,
          trackingId,
          pixelAdded: finalHtml !== emailData.html
        });
      }

      // Preparar dados para SMTP (formato compatível)
      const smtpEmailData = {
        from: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to[0] : emailData.to, // Simplificar para um destinatário
        subject: emailData.subject,
        html: finalHtml,
        text: emailData.text,
        headers: {
          'X-Message-ID': messageId,
          'X-Tracking-ID': trackingId,
          'X-UltraZend-Service': 'multi-tenant',
          'X-Domain-Verified': 'true',
          'X-User-ID': user.id.toString(),
          'X-Tenant-ID': user.tenant_id?.toString() || 'default'
        }
      };

      // Entrega via SMTP (comprovadamente funcional)
      const delivered = await this.smtpDelivery.deliverEmail(smtpEmailData);

      // Atualizar status no banco (em vez de inserir novo)
      const deliveredAt = delivered ? new Date() : null;
      await this.updateEmailStatus(messageId, {
        status: delivered ? 'delivered' : 'failed',
        sent_at: deliveredAt,
        delivered_at: deliveredAt,
        error_message: delivered ? null : 'SMTP delivery failed',
        html_content: finalHtml // 🔧 Salvar HTML com pixel de tracking
      });

      if (delivered) {
        await emailTrackingService.recordDeliveredEventForMessage(messageId, trackingId, smtpEmailData.to, user.id);
        void emailWebhookEventService.emitByMessageId('email.delivered', messageId, {
          accepted_by_server: true,
          domain,
          source: 'smtp_acceptance',
          triggered_by: user.api_key_id ? 'api_key' : 'jwt'
        });
      }

      if (delivered) {
        logger.info('✅ MultiTenant: Email sent successfully', {
          userId: user.id,
          messageId,
          domain,
          to: smtpEmailData.to
        });
      } else {
        void emailWebhookEventService.emitByMessageId('email.failed', messageId, {
          accepted_by_server: false,
          domain,
          error_message: 'SMTP delivery failed',
          source: 'smtp_failure',
          triggered_by: user.api_key_id ? 'api_key' : 'jwt'
        });
        logger.error('❌ MultiTenant: SMTP delivery failed', {
          userId: user.id,
          messageId,
          domain,
          to: smtpEmailData.to
        });
      }

    } catch (error) {
      logger.error('❌ MultiTenant: Async processing failed', {
        userId: user.id,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Atualizar como falha no banco
      await this.updateEmailStatus(messageId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed',
        html_content: finalHtml || emailData.html // 🔧 Salvar HTML mesmo em caso de falha
      });
      void emailWebhookEventService.emitByMessageId('email.failed', messageId, {
        accepted_by_server: false,
        domain,
        error_message: error instanceof Error ? error.message : 'Processing failed',
        source: 'async_processing_failure',
        triggered_by: user.api_key_id ? 'api_key' : 'jwt'
      });
    }
  }

  /**
   * Validação rápida dos dados do email
   */
  private validateEmailData(emailData: EmailRequest): { valid: boolean; error?: string } {
    // Validar campos obrigatórios
    if (!emailData.from) {
      return { valid: false, error: 'Field "from" is required' };
    }

    if (!emailData.to) {
      return { valid: false, error: 'Field "to" is required' };
    }

    if (!emailData.subject) {
      return { valid: false, error: 'Field "subject" is required' };
    }

    if (!emailData.html && !emailData.text) {
      return { valid: false, error: 'Either "html" or "text" content is required' };
    }

    // Validar formato de email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailData.from)) {
      return { valid: false, error: 'Invalid "from" email format' };
    }

    const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
    for (const recipient of recipients) {
      if (!emailRegex.test(recipient)) {
        return { valid: false, error: `Invalid recipient email format: ${recipient}` };
      }
    }

    return { valid: true };
  }

  /**
   * Extrair domínio do endereço de email
   */
  private extractDomain(email: string): string | null {
    try {
      if (!email || typeof email !== 'string') {
        return null;
      }
      
      const trimmedEmail = email.trim();
      const atIndex = trimmedEmail.lastIndexOf('@');
      
      if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
        return null;
      }
      
      const domain = trimmedEmail.substring(atIndex + 1).toLowerCase();
      
      // Validação básica do domínio
      if (domain.length === 0 || domain.includes(' ') || !domain.includes('.')) {
        return null;
      }
      
      return domain;
    } catch (error) {
      logger.debug('Failed to extract domain', { email, error });
      return null;
    }
  }

  /**
   * Gerar ID único para a mensagem
   */
  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `mt-${timestamp}-${random}`;
  }

  /**
   * Gerar tracking ID único para rastreamento de abertura
   */
  private generateTrackingId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `track-${timestamp}-${random}`;
  }

  /**
   * Adicionar pixel de tracking ao HTML de forma segura (não crítica)
   */
  private addTrackingPixelSafely(html: string, trackingId: string): string {
    try {
      if (!html || typeof html !== 'string') {
        return html;
      }

      // Usar domínio fixo para tracking (www.ultrazend.com.br)
      const trackingDomain = 'www.ultrazend.com.br';

      // 1. Processar links para tracking de cliques
      let processedHtml = processLinksForTracking(html, trackingId, trackingDomain);

      // 2. Adicionar pixel de tracking para abertura
      const trackingPixel = generateTrackingPixel(trackingId, trackingDomain);

      // Adicionar pixel antes do </body> ou no final se não houver </body>
      if (processedHtml.toLowerCase().includes('</body>')) {
        processedHtml = processedHtml.replace(/<\/body>/i, `${trackingPixel}</body>`);
      } else {
        processedHtml = processedHtml + trackingPixel;
      }

      return processedHtml;
    } catch (error) {
      // Log mas não quebra o envio se tracking falhar
      logger.debug('🟡 Tracking pixel and links processing failed (non-critical)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        trackingId
      });
      return html; // Retorna HTML original
    }
  }

  /**
   * Atualizar status do email no banco de dados
   */
  private async updateEmailStatus(messageId: string, updates: {
    status?: string;
    sent_at?: Date | null;
    delivered_at?: Date | null;
    error_message?: string | null;
    html_content?: string | null; // 🔧 Adicionar html_content para salvar pixel
  }): Promise<void> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date()
      };

      await db('emails')
        .where('message_id', messageId)
        .update(updateData);

      logger.debug('📝 Email status updated', {
        messageId,
        updates
      });
    } catch (error) {
      logger.error('❌ Failed to update email status', {
        messageId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Não propagar erro - update é importante mas não crítico
    }
  }

  /**
   * Salvar log do email no banco de dados (multi-tenancy)
   */
  private async saveEmailLog(logData: EmailLogData): Promise<void> {
    try {
      const insertData: Record<string, unknown> = {
        user_id: logData.user_id,
        tenant_id: logData.tenant_id,
        from_email: logData.from,
        to_email: logData.to,
        subject: logData.subject,
        html_content: logData.html,
        text_content: logData.text,
        status: logData.status,
        message_id: logData.message_id,
        tracking_id: logData.tracking_id,
        error_message: logData.error_message,
        sent_at: logData.status === 'sent' ? logData.timestamp : null,
        created_at: logData.timestamp,
        updated_at: logData.timestamp
      };

      if (await this.supportsApiKeyIdColumn()) {
        insertData.api_key_id = logData.api_key_id || null;
      }

      await db('emails').insert(insertData);

      logger.debug('📝 Email log saved', {
        userId: logData.user_id,
        tenantId: logData.tenant_id,
        messageId: logData.message_id,
        status: logData.status
      });
    } catch (error) {
      logger.error('❌ Failed to save email log', {
        userId: logData.user_id,
        messageId: logData.message_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Não propagar erro - log é importante mas não crítico
    }
  }

  /**
   * Teste de conexão do serviço
   */
  async testConnection(): Promise<boolean> {
    try {
      logger.debug('Testing MultiTenantEmailService connection');
      
      // Testar SMTP
      const smtpTest = await this.smtpDelivery.testConnection();
      if (!smtpTest) {
        logger.error('SMTP connection test failed');
        return false;
      }

      // Testar conexão com banco
      await db.raw('SELECT 1');
      
      logger.info('✅ MultiTenantEmailService connection test passed');
      return true;
    } catch (error) {
      logger.error('❌ MultiTenantEmailService connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async supportsApiKeyIdColumn(): Promise<boolean> {
    if (this.emailTableSupportsApiKeyId !== null) {
      return this.emailTableSupportsApiKeyId;
    }

    this.emailTableSupportsApiKeyId = await db.schema.hasColumn('emails', 'api_key_id');
    return this.emailTableSupportsApiKeyId;
  }
}
