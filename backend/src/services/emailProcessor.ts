import { ParsedMail } from 'mailparser';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { SecurityManager, SecurityValidation } from './securityManager';
import { RateLimiter } from './rateLimiter';
import { ReputationManager } from './reputationManager';
import { DKIMManager } from './dkimManager';
import { DeliveryManager } from './deliveryManager';
import { TenantContextService } from './TenantContextService';

export interface ProcessingResult {
  success: boolean;
  messageId: string;
  action: 'delivered' | 'queued' | 'rejected' | 'quarantined';
  reason?: string;
  details?: any;
}

export interface SenderValidation {
  valid: boolean;
  reason?: string;
  requireAuth?: boolean;
}

export interface RecipientValidation {
  valid: boolean;
  reason?: string;
  isLocal?: boolean;
  userExists?: boolean;
}

// 🔥 NOVA INTERFACE: Processamento tenant-aware
export interface TenantProcessingResult extends ProcessingResult {
  tenantId?: number;
  rateLimitsRemaining?: {
    daily: number;
    hourly: number;
    perMinute: number;
  };
}

export class EmailProcessor {
  private securityManager: SecurityManager;
  private rateLimiter: RateLimiter;
  private reputationManager: ReputationManager;
  private dkimManager: DKIMManager;
  private deliveryManager: DeliveryManager;
  private tenantContextService: TenantContextService; // 🔥 NOVO: Tenant context service
  private localDomains: Set<string>;

  constructor() {
    this.securityManager = new SecurityManager();
    this.rateLimiter = new RateLimiter();
    this.reputationManager = new ReputationManager();
    this.dkimManager = new DKIMManager();
    this.tenantContextService = new TenantContextService(); // 🔥 NOVO: Inicializar tenant context
    this.deliveryManager = new DeliveryManager(
      this.reputationManager,
      this.dkimManager,
      this.securityManager,
      this.tenantContextService // 🔥 NOVO: Passar tenant context para DeliveryManager
    );
    this.localDomains = new Set();
    
    this.initializeProcessor();
  }

  private async initializeProcessor() {
    try {
      await this.validateRequiredTables();
      await this.loadLocalDomains();
      
      logger.info('EmailProcessor initialized successfully', {
        localDomains: this.localDomains.size
      });
    } catch (error) {
      logger.error('Failed to initialize EmailProcessor', { error });
    }
  }

  private async loadLocalDomains() {
    try {
      // Carregar domínios locais configurados
      const primaryDomain = Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br');
      const baseDomain = primaryDomain.replace(/^mail\./, '');
      
      this.localDomains.add(baseDomain);
      this.localDomains.add('ultrazend.com.br');
      this.localDomains.add('www.ultrazend.com.br');

      // Carregar domínios adicionais do banco se existir tabela
      try {
        const additionalDomains = await db('local_domains')
          .where('is_active', true)
          .select('domain');
        
        additionalDomains.forEach(record => {
          this.localDomains.add(record.domain);
        });
      } catch (error) {
        // Tabela pode não existir ainda
      }

      logger.info('Local domains loaded', { 
        domains: Array.from(this.localDomains)
      });
    } catch (error) {
      logger.error('Failed to load local domains', { error });
    }
  }

  private async validateRequiredTables() {
    try {
      const requiredTables = [
        'processed_emails',
        'local_domains',
        'email_quarantine'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await db.schema.hasTable(tableName);
        if (!hasTable) {
          throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);
        }
      }

      logger.info('EmailProcessor: Todas as tabelas obrigatórias validadas com sucesso');
    } catch (error) {
      logger.error('Erro ao validar tabelas do EmailProcessor:', error);
      throw error;
    }
  }

  // Processar email recebido (MX Server)
  public async processIncomingEmail(
    parsedEmail: ParsedMail, 
    session: any
  ): Promise<ProcessingResult> {
    const messageId = this.generateMessageId(parsedEmail);
    const fromAddress = parsedEmail.from?.text || 'unknown';
    const toAddress = this.extractRecipients(parsedEmail);

    logger.info('Processing incoming email', {
      messageId,
      from: fromAddress,
      to: toAddress,
      subject: parsedEmail.subject,
      sessionId: session.id
    });

    try {
      // 1. Verificações de segurança
      const securityCheck = await this.securityManager.checkEmailSecurity(
        parsedEmail, 
        session
      );

      if (!securityCheck.allowed) {
        await this.handleRejectedEmail(
          parsedEmail,
          session,
          'security',
          securityCheck.reason || 'Security check failed'
        );

        return {
          success: false,
          messageId,
          action: 'rejected',
          reason: securityCheck.reason
        };
      }

      // 2. Verificar se destinatário é local
      const recipientValidation = await this.validateLocalRecipient(toAddress);
      
      if (!recipientValidation.valid) {
        await this.handleRejectedEmail(
          parsedEmail,
          session,
          'recipient',
          recipientValidation.reason || 'Invalid recipient'
        );

        return {
          success: false,
          messageId,
          action: 'rejected',
          reason: recipientValidation.reason
        };
      }

      // 3. Verificar DKIM se presente
      const dkimValid = await this.verifyDKIM(parsedEmail);

      // 4. Verificar SPF
      const spfResult = await this.verifySPF(parsedEmail, session);

      // 5. Quarentena baseada em score de segurança
      if (securityCheck.spamScore && securityCheck.spamScore > 50) {
        await this.quarantineEmail(parsedEmail, session, {
          reason: 'High spam score',
          spamScore: securityCheck.spamScore,
          securityDetails: securityCheck
        });

        return {
          success: true,
          messageId,
          action: 'quarantined',
          reason: 'High spam score - quarantined for review'
        };
      }

      // 6. Entregar email localmente
      const deliveryResult = await this.deliverLocalEmail(
        parsedEmail,
        toAddress,
        {
          dkimValid,
          spfResult,
          securityCheck
        }
      );

      // 7. Registrar processamento
      await this.recordProcessedEmail(parsedEmail, session, 'incoming', 'delivered', {
        dkimValid,
        spfResult,
        securityDetails: securityCheck
      });

      logger.info('Incoming email processed successfully', {
        messageId,
        action: 'delivered',
        to: toAddress
      });

      return {
        success: true,
        messageId,
        action: 'delivered',
        details: {
          dkimValid,
          spfResult,
          localDelivery: deliveryResult
        }
      };

    } catch (error) {
      logger.error('Failed to process incoming email', {
        error,
        messageId,
        from: fromAddress
      });

      return {
        success: false,
        messageId,
        action: 'rejected',
        reason: 'Processing error'
      };
    }
  }

  // 🔥 MÉTODO MODIFICADO: Processar email enviado com validação de tenant
  public async processOutgoingEmail(
    parsedEmail: ParsedMail,
    session: any
  ): Promise<TenantProcessingResult> {
    const messageId = this.generateMessageId(parsedEmail);
    const fromAddress = parsedEmail.from?.text || 'unknown';
    const toAddresses = this.extractRecipients(parsedEmail);
    const tenantId = session.user;

    logger.info('Processing outgoing email', {
      messageId,
      tenantId, // 🔥 NOVO: Log do tenant
      from: fromAddress,
      to: toAddresses,
      subject: parsedEmail.subject,
      sessionId: session.id
    });

    try {
      // 🔥 CRÍTICO: Validar contexto do tenant primeiro
      if (!tenantId) {
        throw new Error('Missing tenant ID for outgoing email');
      }

      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      if (!tenantContext.isActive) {
        return {
          success: false,
          messageId,
          tenantId,
          action: 'rejected',
          reason: `Tenant ${tenantId} is inactive`
        };
      }

      // 🔥 NOVO: Validar se tenant pode enviar este email
      const canSendEmail = await this.tenantContextService.validateTenantOperation(
        tenantId,
        {
          type: 'email_send',
          data: {
            from: fromAddress,
            to: toAddresses,
            domain: fromAddress.split('@')[1]
          }
        }
      );

      if (!canSendEmail.allowed) {
        await this.handleRejectedEmail(
          parsedEmail,
          session,
          'tenant_validation',
          canSendEmail.reason || 'Tenant validation failed'
        );

        return {
          success: false,
          messageId,
          tenantId,
          action: 'rejected',
          reason: canSendEmail.reason,
          rateLimitsRemaining: {
            daily: Math.max(0, tenantContext.dailyEmailLimit - (tenantContext.dailyEmailsSent || 0)),
            hourly: Math.max(0, tenantContext.hourlyEmailLimit - (tenantContext.hourlyEmailsSent || 0)),
            perMinute: Math.max(0, tenantContext.perMinuteEmailLimit - (tenantContext.perMinuteEmailsSent || 0))
          }
        };
      }

      // 1. Verificar rate limiting do usuário (agora tenant-aware)
      const rateLimitCheck = await this.rateLimiter.checkEmailSending(
        tenantId,
        session.remoteAddress
      );

      if (!rateLimitCheck.allowed) {
        await this.handleRejectedEmail(
          parsedEmail,
          session,
          'rate_limit',
          rateLimitCheck.reason || 'Rate limit exceeded'
        );

        return {
          success: false,
          messageId,
          tenantId,
          action: 'rejected',
          reason: rateLimitCheck.reason,
          rateLimitsRemaining: {
            daily: Math.max(0, tenantContext.dailyEmailLimit - (tenantContext.dailyEmailsSent || 0)),
            hourly: Math.max(0, tenantContext.hourlyEmailLimit - (tenantContext.hourlyEmailsSent || 0)),
            perMinute: Math.max(0, tenantContext.perMinuteEmailLimit - (tenantContext.perMinuteEmailsSent || 0))
          }
        };
      }

      // 2. Verificação básica de segurança para outgoing
      const securityCheck = await this.securityManager.checkEmailSecurity(
        parsedEmail,
        session
      );

      // Para emails outgoing, apenas verificar malware crítico
      if (!securityCheck.allowed && securityCheck.reason?.includes('Malware')) {
        await this.handleRejectedEmail(
          parsedEmail,
          session,
          'security',
          securityCheck.reason
        );

        return {
          success: false,
          messageId,
          tenantId,
          action: 'rejected',
          reason: securityCheck.reason,
          rateLimitsRemaining: {
            daily: Math.max(0, tenantContext.dailyEmailLimit - (tenantContext.dailyEmailsSent || 0)),
            hourly: Math.max(0, tenantContext.hourlyEmailLimit - (tenantContext.hourlyEmailsSent || 0)),
            perMinute: Math.max(0, tenantContext.perMinuteEmailLimit - (tenantContext.perMinuteEmailsSent || 0))
          }
        };
      }

      // 3. Assinar com DKIM
      const signedEmail = await this.dkimManager.signEmail({
        from: fromAddress,
        to: toAddresses,
        subject: parsedEmail.subject,
        html: parsedEmail.html,
        text: parsedEmail.text,
        messageId
      });

      // 4. Enfileirar para delivery com tenant ID
      const queueResult = await this.queueForDeliveryWithTenant(signedEmail, session, tenantId);

      // 5. Registrar processamento
      await this.recordProcessedEmail(parsedEmail, session, 'outgoing', 'queued', {
        queueId: queueResult.queueId,
        dkimSigned: !!signedEmail.dkimSignature,
        tenantId // 🔥 NOVO: Registrar tenant ID
      });

      logger.info('Outgoing email processed successfully', {
        messageId,
        tenantId, // 🔥 NOVO: Log do tenant
        action: 'queued',
        to: toAddresses,
        queueId: queueResult.queueId
      });

      return {
        success: true,
        messageId,
        tenantId,
        action: 'queued',
        details: {
          queueId: queueResult.queueId,
          dkimSigned: !!signedEmail.dkimSignature,
          estimatedDelivery: queueResult.estimatedDelivery
        },
        rateLimitsRemaining: {
          daily: Math.max(0, tenantContext.dailyEmailLimit - (tenantContext.dailyEmailsSent || 0) - 1),
          hourly: Math.max(0, tenantContext.hourlyEmailLimit - (tenantContext.hourlyEmailsSent || 0) - 1),
          perMinute: Math.max(0, tenantContext.perMinuteEmailLimit - (tenantContext.perMinuteEmailsSent || 0) - 1)
        }
      };

    } catch (error) {
      logger.error('Failed to process outgoing email', {
        error,
        messageId,
        tenantId, // 🔥 NOVO: Log do tenant
        from: fromAddress
      });

      return {
        success: false,
        messageId,
        tenantId,
        action: 'rejected',
        reason: 'Processing error'
      };
    }
  }

  // Validações
  public async validateSender(
    senderAddress: string,
    sessionUser?: any,
    remoteAddress?: string
  ): Promise<SenderValidation> {
    try {
      // Para servidor MX, aceitar qualquer sender (verificação será feita por SPF/DKIM)
      if (!sessionUser) {
        return { valid: true };
      }

      // Para submission server, verificar se usuário pode enviar por este endereço
      const domain = this.extractDomain(senderAddress);
      const isLocalDomain = await this.isLocalDomain(senderAddress);

      if (isLocalDomain) {
        // Verificar se usuário tem permissão para usar este endereço local
        const user = await db('users').where('id', sessionUser).first();
        
        if (!user) {
          return {
            valid: false,
            reason: 'User not found',
            requireAuth: true
          };
        }

        // Para domínios locais, usuário deve usar seu próprio email ou ter permissão
        const userDomain = this.extractDomain(user.email);
        if (domain !== userDomain) {
          // Verificar se usuário tem permissão para usar outros domínios
          const hasPermission = await this.checkDomainPermission(sessionUser, domain);
          if (!hasPermission) {
            return {
              valid: false,
              reason: 'Not authorized to send from this domain',
              requireAuth: true
            };
          }
        }
      }

      return { valid: true };

    } catch (error) {
      logger.error('Sender validation failed', { error, senderAddress });
      return {
        valid: false,
        reason: 'Validation error',
        requireAuth: true
      };
    }
  }

  public async validateLocalRecipient(recipientAddress: string): Promise<RecipientValidation> {
    try {
      const domain = this.extractDomain(recipientAddress);
      const isLocal = await this.isLocalDomain(recipientAddress);

      if (!isLocal) {
        return {
          valid: false,
          reason: 'Not a local domain',
          isLocal: false
        };
      }

      // Verificar configuração do domínio
      const domainConfig = await db('local_domains')
        .where('domain', domain)
        .where('is_active', true)
        .first();

      if (!domainConfig) {
        return {
          valid: false,
          reason: 'Domain not configured for local delivery',
          isLocal: true
        };
      }

      // Se accept_all está habilitado, aceitar qualquer email para este domínio
      if (domainConfig.accept_all) {
        return {
          valid: true,
          isLocal: true,
          userExists: true
        };
      }

      // Verificar se usuário existe
      const user = await db('users')
        .where('email', recipientAddress)
        .where('is_verified', true)
        .first();

      if (!user) {
        return {
          valid: false,
          reason: 'Recipient not found',
          isLocal: true,
          userExists: false
        };
      }

      return {
        valid: true,
        isLocal: true,
        userExists: true
      };

    } catch (error) {
      logger.error('Recipient validation failed', { error, recipientAddress });
      return {
        valid: false,
        reason: 'Validation error',
        isLocal: true
      };
    }
  }

  public async isLocalDomain(emailAddress: string): Promise<boolean> {
    const domain = this.extractDomain(emailAddress);
    return this.localDomains.has(domain);
  }

  // Métodos auxiliares
  private generateMessageId(parsedEmail: ParsedMail): string {
    return parsedEmail.messageId || 
           parsedEmail.headers?.get('message-id') as string ||
           `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@ultrazend.local>`;
  }

  private extractRecipients(parsedEmail: ParsedMail): string {
    const to = parsedEmail.to;
    if (Array.isArray(to)) {
      return to.map(addr => addr.text).join(', ');
    }
    return to?.text || 'unknown';
  }

  private extractDomain(emailAddress: string): string {
    const match = emailAddress.match(/@([^>]+)/);
    return match ? match[1].trim().toLowerCase() : '';
  }

  private async verifyDKIM(parsedEmail: ParsedMail): Promise<boolean> {
    try {
      const dkimHeader = parsedEmail.headers?.get('dkim-signature') as string;
      if (!dkimHeader) return false;

      const verification = await this.dkimManager.verifyDKIMSignature(parsedEmail, dkimHeader);
      return verification.valid;
    } catch (error) {
      logger.error('DKIM verification failed', { error });
      return false;
    }
  }

  private async verifySPF(parsedEmail: ParsedMail, session: any): Promise<string> {
    // Implementação básica de SPF - pode ser expandida
    const fromDomain = this.extractDomain(parsedEmail.from?.text || '');
    const remoteIP = session.remoteAddress;

    // Por simplicidade, retornando 'pass' para IPs locais e 'neutral' para outros
    if (remoteIP === '127.0.0.1' || remoteIP?.startsWith('192.168.') || remoteIP?.startsWith('10.')) {
      return 'pass';
    }

    return 'neutral'; // Implementar verificação SPF real aqui
  }

  private async deliverLocalEmail(
    parsedEmail: ParsedMail,
    recipient: string,
    metadata: any
  ): Promise<any> {
    try {
      // Salvar email na caixa de entrada do usuário
      const user = await db('users').where('email', recipient).first();
      
      if (user) {
        await db('user_inbox').insert({
          user_id: user.id,
          message_id: this.generateMessageId(parsedEmail),
          from_address: parsedEmail.from?.text,
          subject: parsedEmail.subject,
          content: parsedEmail.html || parsedEmail.text,
          received_at: new Date(),
          is_read: false,
          metadata: JSON.stringify(metadata)
        });

        return { delivered: true, userId: user.id };
      }

      return { delivered: false, reason: 'User not found' };
    } catch (error) {
      logger.error('Local email delivery failed', { error, recipient });
      return { delivered: false, reason: 'Delivery error' };
    }
  }

  // 🔥 NOVO MÉTODO: Queue para delivery com tenant ID
  private async queueForDeliveryWithTenant(emailData: any, session: any, tenantId: number): Promise<any> {
    try {
      // 🔥 CRÍTICO: Usar DeliveryManager tenant-aware
      const deliveryId = await this.deliveryManager.queueEmail({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.html || emailData.text,
        headers: emailData.headers || {},
        messageId: emailData.messageId,
        userId: tenantId, // 🔒 ISOLAMENTO POR TENANT!
        priority: 1 // Prioridade alta para emails de usuários
      });

      logger.info('Email queued for delivery with tenant isolation', {
        deliveryId,
        tenantId,
        to: emailData.to,
        messageId: emailData.messageId
      });

      return {
        queueId: deliveryId,
        estimatedDelivery: new Date(Date.now() + 60000) // 1 minuto
      };
    } catch (error) {
      logger.error('Failed to queue email for delivery', {
        error,
        tenantId,
        to: emailData.to
      });
      throw error;
    }
  }

  private async handleRejectedEmail(
    parsedEmail: ParsedMail,
    session: any,
    rejectionType: string,
    reason: string
  ): Promise<void> {
    try {
      await this.recordProcessedEmail(
        parsedEmail,
        session,
        'incoming',
        'rejected',
        { rejectionType, reason }
      );

      logger.warn('Email rejected', {
        messageId: this.generateMessageId(parsedEmail),
        from: parsedEmail.from?.text,
        rejectionType,
        reason,
        sessionId: session.id
      });
    } catch (error) {
      logger.error('Failed to record rejected email', { error });
    }
  }

  private async quarantineEmail(
    parsedEmail: ParsedMail,
    session: any,
    quarantineInfo: any
  ): Promise<void> {
    try {
      await db('email_quarantine').insert({
        message_id: this.generateMessageId(parsedEmail),
        from_address: parsedEmail.from?.text,
        to_address: this.extractRecipients(parsedEmail),
        subject: parsedEmail.subject,
        reason: quarantineInfo.reason,
        severity: quarantineInfo.spamScore > 80 ? 'high' : 'medium',
        email_content: JSON.stringify({
          html: parsedEmail.html,
          text: parsedEmail.text,
          attachments: parsedEmail.attachments?.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size
          }))
        }),
        headers: JSON.stringify(parsedEmail.headers),
        security_details: JSON.stringify(quarantineInfo.securityDetails),
        quarantined_at: new Date()
      });

      logger.info('Email quarantined', {
        messageId: this.generateMessageId(parsedEmail),
        reason: quarantineInfo.reason,
        spamScore: quarantineInfo.spamScore
      });
    } catch (error) {
      logger.error('Failed to quarantine email', { error });
    }
  }

  private async recordProcessedEmail(
    parsedEmail: ParsedMail,
    session: any,
    direction: 'incoming' | 'outgoing',
    status: string,
    details?: any
  ): Promise<void> {
    try {
      const emailSize = this.calculateEmailSize(parsedEmail);
      const hasAttachments = parsedEmail.attachments && parsedEmail.attachments.length > 0;

      await db('processed_emails').insert({
        message_id: this.generateMessageId(parsedEmail),
        from_address: parsedEmail.from?.text,
        to_address: this.extractRecipients(parsedEmail),
        subject: parsedEmail.subject,
        direction,
        status,
        processing_result: details?.reason || 'processed',
        rejection_reason: details?.reason,
        security_checks: JSON.stringify(details?.securityDetails),
        size_bytes: emailSize,
        has_attachments: hasAttachments,
        attachment_count: parsedEmail.attachments?.length || 0,
        dkim_valid: details?.dkimValid,
        spf_result: details?.spfResult,
        processed_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to record processed email', { error });
    }
  }

  private calculateEmailSize(parsedEmail: ParsedMail): number {
    let size = 0;
    size += (parsedEmail.html || '').length;
    size += (parsedEmail.text || '').length;
    size += (parsedEmail.subject || '').length;
    
    if (parsedEmail.attachments) {
      parsedEmail.attachments.forEach(att => {
        size += att.size || 0;
      });
    }

    return size;
  }

  private async checkDomainPermission(userId: number, domain: string): Promise<boolean> {
    try {
      // Verificar se usuário tem permissão para enviar por este domínio
      const permission = await db('user_domain_permissions')
        .where('user_id', userId)
        .where('domain', domain)
        .where('is_active', true)
        .first();

      return !!permission;
    } catch (error) {
      // Tabela pode não existir
      return false;
    }
  }

  // 🔥 MÉTODO MODIFICADO: Enviar email de verificação com tenant ID
  public async sendVerificationEmail(
    email: string,
    name: string,
    verificationToken: string,
    tenantId?: number // 🔥 NOVO: Parâmetro tenant ID (opcional para compatibilidade)
  ): Promise<any> {
    try {
      logger.info('Sending verification email', { email, name });

      const baseUrl = Env.get('APP_BASE_URL', 'https://www.ultrazend.com.br');
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verificação de Email - UltraZend</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; font-size: 24px;">🚀 Bem-vindo ao UltraZend!</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="color: #333; font-size: 16px; margin: 0;">
              Olá <strong>${name}</strong>,
            </p>
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 15px 0;">
              Obrigado por se registrar no UltraZend! Para ativar sua conta e começar a usar nossa plataforma de email marketing, 
              clique no botão abaixo para verificar seu endereço de email.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              ✅ Verificar Email
            </a>
          </div>

          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
            <p style="color: #666; font-size: 12px; margin: 0;">
              Se você não conseguir clicar no botão, copie e cole este link em seu navegador:
            </p>
            <p style="color: #007bff; font-size: 12px; word-break: break-all; margin: 10px 0;">
              ${verificationUrl}
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 11px; margin: 0;">
              © ${new Date().getFullYear()} UltraZend - Plataforma de Email Marketing
            </p>
            <p style="color: #999; font-size: 11px; margin: 5px 0 0 0;">
              Se você não se registrou no UltraZend, pode ignorar este email com segurança.
            </p>
          </div>
        </body>
        </html>
      `;

      const textContent = `
Bem-vindo ao UltraZend!

Olá ${name},

Obrigado por se registrar no UltraZend! Para ativar sua conta, clique no link abaixo para verificar seu endereço de email:

${verificationUrl}

Se você não se registrou no UltraZend, pode ignorar este email com segurança.

© ${new Date().getFullYear()} UltraZend - Plataforma de Email Marketing
      `;

      // 🔥 NOVO: Usar DeliveryManager com tenant ID (sistema interno usa tenant ID especial)
      const systemTenantId = tenantId || 1; // Se não fornecido, usar tenant sistema (ID 1)
      
      const deliveryId = await this.deliveryManager.queueEmail({
        from: `noreply@ultrazend.com.br`,
        to: email,
        subject: '🚀 Confirme seu email - UltraZend',
        body: htmlContent, // Interface usa 'body' não 'html'
        headers: {
          'X-Email-Type': 'verification',
          'X-Priority': '1',
          'Content-Type': 'text/html; charset=UTF-8'
        },
        userId: systemTenantId, // 🔒 ISOLAMENTO POR TENANT!
        priority: 10 // Máxima prioridade para emails de verificação
      });

      const messageId = `<verification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@ultrazend.com.br>`;

      logger.info('Verification email queued successfully', { 
        email, 
        messageId,
        deliveryId,
        tenantId: systemTenantId // 🔥 NOVO: Log do tenant
      });

      return {
        success: true,
        messageId,
        deliveryId,
        message: 'Email de verificação enviado com sucesso'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Failed to send verification email', { 
        error: errorMessage,
        email,
        stack: errorStack 
      });

      return {
        success: false,
        error: errorMessage,
        message: 'Falha ao enviar email de verificação'
      };
    }
  }

  // 🔥 MÉTODO MODIFICADO: Estatísticas globais (para admin) - mantido para compatibilidade
  public async getProcessingStats(): Promise<any> {
    try {
      const [
        todayProcessed,
        todayIncoming,
        todayOutgoing,
        todayRejected,
        todayQuarantined
      ] = await Promise.all([
        db('processed_emails')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        db('processed_emails')
          .where('direction', 'incoming')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        db('processed_emails')
          .where('direction', 'outgoing')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        db('processed_emails')
          .where('status', 'rejected')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        db('email_quarantine')
          .where('quarantined_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first()
      ]);

      return {
        last_24h: {
          total_processed: todayProcessed?.count || 0,
          incoming: todayIncoming?.count || 0,
          outgoing: todayOutgoing?.count || 0,
          rejected: todayRejected?.count || 0,
          quarantined: todayQuarantined?.count || 0
        },
        local_domains: Array.from(this.localDomains),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get processing stats', { error });
      return {
        last_24h: { total_processed: 0, incoming: 0, outgoing: 0, rejected: 0, quarantined: 0 },
        local_domains: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  // 🔥 NOVO MÉTODO: Estatísticas por tenant com isolamento completo
  public async getTenantProcessingStats(tenantId: number): Promise<any> {
    try {
      // Validar tenant primeiro
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      if (!tenantContext.isActive) {
        throw new Error(`Tenant ${tenantId} is inactive`);
      }

      const [
        todayProcessed,
        todayIncoming,
        todayOutgoing,
        todayRejected,
        todayQuarantined
      ] = await Promise.all([
        db('processed_emails')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .whereRaw("JSON_EXTRACT(security_checks, '$.tenantId') = ?", [tenantId]) // Tenant-specific filter
          .count('* as count')
          .first(),
        db('processed_emails')
          .where('direction', 'incoming')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .whereRaw("JSON_EXTRACT(security_checks, '$.tenantId') = ?", [tenantId]) // Tenant-specific filter
          .count('* as count')
          .first(),
        db('processed_emails')
          .where('direction', 'outgoing')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .whereRaw("JSON_EXTRACT(security_checks, '$.tenantId') = ?", [tenantId]) // Tenant-specific filter
          .count('* as count')
          .first(),
        db('processed_emails')
          .where('status', 'rejected')
          .where('processed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .whereRaw("JSON_EXTRACT(security_checks, '$.tenantId') = ?", [tenantId]) // Tenant-specific filter
          .count('* as count')
          .first(),
        db('email_quarantine')
          .where('quarantined_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .whereRaw("JSON_EXTRACT(security_details, '$.tenantId') = ?", [tenantId]) // Tenant-specific filter
          .count('* as count')
          .first()
      ]);

      return {
        tenantId,
        last_24h: {
          total_processed: todayProcessed?.count || 0,
          incoming: todayIncoming?.count || 0,
          outgoing: todayOutgoing?.count || 0,
          rejected: todayRejected?.count || 0,
          quarantined: todayQuarantined?.count || 0
        },
        rate_limits_remaining: {
          daily: Math.max(0, tenantContext.dailyEmailLimit - (tenantContext.dailyEmailsSent || 0)),
          hourly: Math.max(0, tenantContext.hourlyEmailLimit - (tenantContext.hourlyEmailsSent || 0)),
          perMinute: Math.max(0, tenantContext.perMinuteEmailLimit - (tenantContext.perMinuteEmailsSent || 0))
        },
        plan: tenantContext.plan,
        domains: tenantContext.verifiedDomains?.map(d => d.domain) || [],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get tenant ${tenantId} processing stats`, { error, tenantId });
      throw error;
    }
  }
}