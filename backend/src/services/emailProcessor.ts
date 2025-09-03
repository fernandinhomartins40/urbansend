import { ParsedMail } from 'mailparser';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { SecurityManager, SecurityValidation } from './SecurityManager';
import { RateLimiter } from './rateLimiter';
import { ReputationManager } from './reputationManager';
import { DKIMManager } from './dkimManager';

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

export class EmailProcessor {
  private securityManager: SecurityManager;
  private rateLimiter: RateLimiter;
  private reputationManager: ReputationManager;
  private dkimManager: DKIMManager;
  private localDomains: Set<string>;

  constructor() {
    this.securityManager = new SecurityManager();
    this.rateLimiter = new RateLimiter();
    this.reputationManager = new ReputationManager();
    this.dkimManager = new DKIMManager();
    this.localDomains = new Set();
    
    this.initializeProcessor();
  }

  private async initializeProcessor() {
    try {
      await this.loadLocalDomains();
      await this.createEmailTables();
      
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

  private async createEmailTables() {
    try {
      // Tabela para emails processados
      const hasProcessedEmailsTable = await db.schema.hasTable('processed_emails');
      if (!hasProcessedEmailsTable) {
        await db.schema.createTable('processed_emails', (table) => {
          table.increments('id').primary();
          table.string('message_id', 255).unique();
          table.string('from_address', 255).notNullable();
          table.string('to_address', 255).notNullable();
          table.string('subject', 500);
          table.string('direction', 20).notNullable(); // 'incoming', 'outgoing'
          table.string('status', 50).notNullable(); // 'delivered', 'queued', 'rejected', 'quarantined'
          table.string('processing_result', 100);
          table.text('rejection_reason');
          table.json('security_checks');
          table.integer('size_bytes');
          table.boolean('has_attachments').defaultTo(false);
          table.integer('attachment_count').defaultTo(0);
          table.boolean('dkim_valid');
          table.string('spf_result', 20);
          table.timestamp('processed_at').defaultTo(db.fn.now());
          table.timestamps(true, true);
          
          table.index(['direction', 'status']);
          table.index('processed_at');
          table.index('from_address');
        });
      }

      // Tabela para domínios locais
      const hasLocalDomainsTable = await db.schema.hasTable('local_domains');
      if (!hasLocalDomainsTable) {
        await db.schema.createTable('local_domains', (table) => {
          table.increments('id').primary();
          table.string('domain', 255).notNullable().unique();
          table.boolean('is_active').defaultTo(true);
          table.boolean('accept_all').defaultTo(false); // Aceitar todos os emails para este domínio
          table.text('description');
          table.timestamps(true, true);
          
          table.index('domain');
          table.index('is_active');
        });

        // Inserir domínio padrão
        await db('local_domains').insert({
          domain: 'ultrazend.com.br',
          is_active: true,
          accept_all: false,
          description: 'Primary UltraZend domain'
        });
      }

      // Tabela para quarentena de emails
      const hasQuarantineTable = await db.schema.hasTable('email_quarantine');
      if (!hasQuarantineTable) {
        await db.schema.createTable('email_quarantine', (table) => {
          table.increments('id').primary();
          table.string('message_id', 255).unique();
          table.string('from_address', 255).notNullable();
          table.string('to_address', 255).notNullable();
          table.string('subject', 500);
          table.text('reason').notNullable();
          table.string('severity', 20).defaultTo('medium');
          table.text('email_content', 'longtext');
          table.json('headers');
          table.json('security_details');
          table.boolean('reviewed').defaultTo(false);
          table.string('action_taken', 50);
          table.timestamp('quarantined_at').defaultTo(db.fn.now());
          table.timestamp('reviewed_at');
          table.timestamps(true, true);
          
          table.index('quarantined_at');
          table.index('reviewed');
          table.index('severity');
        });
      }

      logger.info('Email processing tables created successfully');
    } catch (error) {
      logger.error('Failed to create email processing tables', { error });
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

  // Processar email enviado (Submission Server)
  public async processOutgoingEmail(
    parsedEmail: ParsedMail,
    session: any
  ): Promise<ProcessingResult> {
    const messageId = this.generateMessageId(parsedEmail);
    const fromAddress = parsedEmail.from?.text || 'unknown';
    const toAddresses = this.extractRecipients(parsedEmail);

    logger.info('Processing outgoing email', {
      messageId,
      from: fromAddress,
      to: toAddresses,
      subject: parsedEmail.subject,
      userId: session.user,
      sessionId: session.id
    });

    try {
      // 1. Verificar rate limiting do usuário
      const rateLimitCheck = await this.rateLimiter.checkEmailSending(
        session.user,
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
          action: 'rejected',
          reason: rateLimitCheck.reason
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
          action: 'rejected',
          reason: securityCheck.reason
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

      // 4. Enfileirar para delivery
      const queueResult = await this.queueForDelivery(signedEmail, session);

      // 5. Registrar processamento
      await this.recordProcessedEmail(parsedEmail, session, 'outgoing', 'queued', {
        queueId: queueResult.queueId,
        dkimSigned: !!signedEmail.dkimSignature
      });

      logger.info('Outgoing email processed successfully', {
        messageId,
        action: 'queued',
        to: toAddresses,
        queueId: queueResult.queueId
      });

      return {
        success: true,
        messageId,
        action: 'queued',
        details: {
          queueId: queueResult.queueId,
          dkimSigned: !!signedEmail.dkimSignature,
          estimatedDelivery: queueResult.estimatedDelivery
        }
      };

    } catch (error) {
      logger.error('Failed to process outgoing email', {
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

  private async queueForDelivery(emailData: any, session: any): Promise<any> {
    // Integração com sistema de filas
    const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Aqui seria integrado com o sistema de filas real (Bull/Redis)
    logger.info('Email queued for delivery', {
      queueId,
      to: emailData.to,
      userId: session.user
    });

    return {
      queueId,
      estimatedDelivery: new Date(Date.now() + 60000) // 1 minuto
    };
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

  // Métodos públicos para estatísticas
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
}