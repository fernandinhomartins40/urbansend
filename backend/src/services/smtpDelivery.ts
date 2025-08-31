import { createTransport, Transporter, SentMessageInfo } from 'nodemailer';
import { logger } from '../config/logger';
import db from '../config/database';
import { Env } from '../utils/env';
import * as dns from 'dns';
import * as crypto from 'crypto';
import { promisify } from 'util';
import DKIMService from './dkimService';
import SuppressionService from './suppressionService';
import ReputationService from './reputationService';
import { getBounceCategory } from '../utils/email';

const resolveMx = promisify(dns.resolveMx);

interface DeliveryOptions {
  from: string;
  to: string;
  subject: string;
  html?: string | undefined;
  text?: string | undefined;
  replyTo?: string;
  messageId?: string;
  headers?: Record<string, string>;
}

interface MXRecord {
  exchange: string;
  priority: number;
}

class SMTPDeliveryService {
  private hostname: string;
  private dkimService: DKIMService;
  private suppressionService: SuppressionService;
  private reputationService: ReputationService;

  constructor() {
    this.hostname = Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br');
    this.dkimService = new DKIMService();
    this.suppressionService = new SuppressionService();
    this.reputationService = new ReputationService();
  }

  private generateVERPAddress(originalFrom: string, emailId: number): string {
    // Generate VERP address: bounce-{emailId}-{hash}@domain
    const hash = crypto.createHash('md5').update(`${emailId}-${originalFrom}`).digest('hex').substring(0, 8);
    return `bounce-${emailId}-${hash}@${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}`;
  }

  private async getMXRecords(domain: string): Promise<MXRecord[]> {
    try {
      const records = await resolveMx(domain);
      return records.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      logger.error('Failed to resolve MX records', { domain, error });
      throw new Error(`Cannot resolve MX records for domain: ${domain}`);
    }
  }

  private createTransporterForDomain(mxRecord: string): Transporter {
    return createTransport({
      host: mxRecord,
      port: 25,
      secure: false,
      tls: {
        rejectUnauthorized: false,
        ciphers: 'HIGH:MEDIUM:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      name: this.hostname,
      pool: false,
    } as any); // Type assertion for direct SMTP delivery
  }

  public async deliverEmail(options: DeliveryOptions, emailId: number, userId?: number): Promise<boolean> {
    try {
      const recipientDomain = options.to.split('@')[1];
      if (!recipientDomain) {
        throw new Error('Invalid recipient email format');
      }

      // Check if recipient is suppressed
      const isSuppressed = await this.suppressionService.isSuppressed(options.to, userId);
      if (isSuppressed) {
        const suppressionRecord = await this.suppressionService.getSuppressionRecord(options.to, userId);
        
        logger.warn('Email blocked - recipient is suppressed', {
          emailId,
          to: options.to,
          suppressionType: suppressionRecord?.type,
          reason: suppressionRecord?.reason
        });

        // Update email status as suppressed
        await db('emails')
          .where('id', emailId)
          .update({
            status: 'suppressed',
            bounce_reason: `Suppressed: ${suppressionRecord?.reason || 'Unknown reason'}`
          });

        // Log suppression event
        await db('email_analytics').insert({
          email_id: emailId,
          event_type: 'suppressed',
          timestamp: new Date(),
          metadata: JSON.stringify({ 
            suppression_type: suppressionRecord?.type,
            reason: suppressionRecord?.reason
          })
        });

        return false;
      }

      logger.info('Starting SMTP delivery', {
        emailId,
        to: options.to,
        domain: recipientDomain,
        from: options.from,
        userId
      });

      // Get MX records for the recipient domain
      const mxRecords = await this.getMXRecords(recipientDomain);
      if (mxRecords.length === 0) {
        throw new Error(`No MX records found for domain: ${recipientDomain}`);
      }

      logger.info('Found MX records', {
        domain: recipientDomain,
        mxRecords: mxRecords.map(r => `${r.exchange} (${r.priority})`)
      });

      // Try delivery to MX servers in order of priority
      let lastError: Error | null = null;
      
      for (const mx of mxRecords) {
        try {
          logger.info('Attempting delivery', {
            emailId,
            mxServer: mx.exchange,
            priority: mx.priority
          });

          const transporter = this.createTransporterForDomain(mx.exchange);
          
          // Preparar headers para DKIM
          const emailHeaders = {
            'from': options.from,
            'to': options.to,
            'subject': options.subject,
            'date': new Date().toUTCString(),
            'message-id': options.messageId || `<${Date.now()}@${this.hostname}>`,
            'x-mailer': 'UltraZend SMTP Server',
            'x-priority': '3',
            ...options.headers
          };

          // Criar corpo do email
          const emailBody = options.html || options.text || '';

          // Generate VERP address for bounce handling
          const verpAddress = this.generateVERPAddress(options.from, emailId);

          // Assinar com DKIM
          const dkimSignature = this.dkimService.signEmail({
            headers: emailHeaders,
            body: emailBody
          });
          
          const mailOptions = {
            from: `<${options.from}>`, // Proper envelope format
            to: `<${options.to}>`, // Proper envelope format
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo,
            messageId: emailHeaders['message-id'],
            headers: {
              'DKIM-Signature': dkimSignature,
              'X-Mailer': 'UltraZend SMTP Server',
              'X-Priority': '3',
              'Return-Path': `<${verpAddress}>`,
              ...options.headers
            },
            // Use VERP address in envelope for bounce tracking
            envelope: {
              from: verpAddress,
              to: options.to
            }
          };

          const info: SentMessageInfo = await transporter.sendMail(mailOptions);
          
          // Update email status in database
          await db('emails')
            .where('id', emailId)
            .update({
              status: 'delivered',
              delivered_at: new Date(),
              sent_at: new Date()
            });

          // Log analytics
          await db('email_analytics').insert([
            {
              email_id: emailId,
              event_type: 'sent',
              timestamp: new Date(),
              metadata: JSON.stringify({ mxServer: mx.exchange })
            },
            {
              email_id: emailId,
              event_type: 'delivered',
              timestamp: new Date(),
              metadata: JSON.stringify({ 
                mxServer: mx.exchange,
                messageId: info.messageId,
                response: info.response
              })
            }
          ]);

          logger.info('Email delivered successfully', {
            emailId,
            to: options.to,
            mxServer: mx.exchange,
            messageId: info.messageId,
            response: info.response,
            verpAddress: verpAddress
          });

          return true;

        } catch (error) {
          lastError = error as Error;
          logger.warn('Delivery failed to MX server, trying next', {
            emailId,
            mxServer: mx.exchange,
            error: error instanceof Error ? error.message : error
          });
          continue;
        }
      }

      // All MX servers failed
      throw lastError || new Error('All MX servers failed');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Email delivery failed completely', {
        emailId,
        to: options.to,
        error: errorMessage,
        userId
      });

      // Process bounce and potentially add to suppression list
      try {
        await this.suppressionService.processBounce(options.to, errorMessage, userId);
        
        // Get bounce category for better status classification
        const bounceCategory = getBounceCategory(errorMessage);
        
        logger.info('Bounce processed', {
          emailId,
          to: options.to,
          category: bounceCategory.category,
          severity: bounceCategory.severity,
          action: bounceCategory.action,
          userId
        });
      } catch (suppressionError) {
        logger.error('Failed to process bounce for suppression', {
          emailId,
          error: suppressionError,
          userId
        });
      }

      // Update email status as bounced
      await db('emails')
        .where('id', emailId)
        .update({
          status: 'bounced',
          bounce_reason: errorMessage
        });

      // Log bounce event
      await db('email_analytics').insert({
        email_id: emailId,
        event_type: 'bounced',
        timestamp: new Date(),
        metadata: JSON.stringify({ 
          reason: errorMessage,
          category: getBounceCategory(errorMessage).category,
          severity: getBounceCategory(errorMessage).severity
        })
      });

      return false;
    }
  }

  public async processEmailQueue(): Promise<void> {
    try {
      // Get queued emails from database
      const queuedEmails = await db('emails')
        .where('status', 'queued')
        .limit(10) // Process in batches
        .orderBy('created_at', 'asc');

      if (queuedEmails.length === 0) {
        return; // No emails to process
      }

      logger.info('Processing email queue', { count: queuedEmails.length });

      for (const email of queuedEmails) {
        try {
          // Check reputation before processing
          if (email.user_id) {
            const throttleStatus = await this.reputationService.shouldThrottle(email.user_id);
            if (throttleStatus.should_throttle) {
              logger.warn('Email delivery throttled due to reputation', {
                emailId: email.id,
                userId: email.user_id,
                reason: throttleStatus.reason,
                suggestedLimit: throttleStatus.suggested_limit
              });
              
              // Skip this email for now, it will be retried later
              continue;
            }
          }

          const deliveryOptions: DeliveryOptions = {
            from: email.from_email,
            to: email.to_email,
            subject: email.subject,
            html: email.html_content,
            text: email.text_content,
            headers: {
              'X-Email-ID': email.id.toString()
            }
          };

          await this.deliverEmail(deliveryOptions, email.id, email.user_id);
        } catch (error) {
          logger.error('Failed to process queued email', {
            emailId: email.id,
            userId: email.user_id,
            error
          });
        }
      }
    } catch (error) {
      logger.error('Error processing email queue', { error });
    }
  }

  /**
   * Test SMTP connection health for monitoring
   */
  public async testConnection(): Promise<boolean> {
    try {
      // Test connectivity to Gmail's MX servers as a health check
      const testDomain = 'gmail.com';
      const mxRecords = await this.getMXRecords(testDomain);
      
      if (mxRecords.length > 0) {
        // Test connection to primary MX server
        const transporter = this.createTransporterForDomain(mxRecords[0].exchange);
        
        return new Promise((resolve) => {
          // Use verify method with timeout
          const timeout = setTimeout(() => {
            resolve(false);
          }, 5000); // 5 second timeout
          
          transporter.verify((error) => {
            clearTimeout(timeout);
            transporter.close();
            resolve(!error);
          });
        });
      }
      
      return false;
    } catch (error) {
      logger.debug('SMTP connection test failed', { error: (error as Error).message });
      return false;
    }
  }
}

export default SMTPDeliveryService;