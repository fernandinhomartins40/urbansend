import { createTransport, Transporter, SentMessageInfo } from 'nodemailer';
import { logger } from '../config/logger.enterprise';
import db from '../config/database';
import { Env } from '../utils/env';
import * as dns from 'dns';
import { promisify } from 'util';
import DKIMService from './dkimService';

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

  constructor() {
    this.hostname = Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br');
    this.dkimService = new DKIMService();
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

  public async deliverEmail(options: DeliveryOptions, emailId: number): Promise<boolean> {
    try {
      const recipientDomain = options.to.split('@')[1];
      if (!recipientDomain) {
        throw new Error('Invalid recipient email format');
      }

      logger.info('Starting SMTP delivery', {
        emailId,
        to: options.to,
        domain: recipientDomain,
        from: options.from
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
              ...options.headers
            },
            // Proper envelope for direct SMTP
            envelope: {
              from: options.from,
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
            response: info.response
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
      logger.error('Email delivery failed completely', {
        emailId,
        to: options.to,
        error: error instanceof Error ? error.message : error
      });

      // Update email status as failed
      await db('emails')
        .where('id', emailId)
        .update({
          status: 'failed',
          bounce_reason: error instanceof Error ? error.message : 'Unknown error'
        });

      // Log failed delivery
      await db('email_analytics').insert({
        email_id: emailId,
        event_type: 'bounced',
        timestamp: new Date(),
        metadata: JSON.stringify({ 
          reason: error instanceof Error ? error.message : 'Unknown error' 
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

          await this.deliverEmail(deliveryOptions, email.id);
        } catch (error) {
          logger.error('Failed to process queued email', {
            emailId: email.id,
            error
          });
        }
      }
    } catch (error) {
      logger.error('Error processing email queue', { error });
    }
  }
}

export default SMTPDeliveryService;