import { createTransport, Transporter } from 'nodemailer';
import fs from 'fs';
import { logger } from '../config/logger';
import { validateEmailAddress, processTemplate, generateTrackingPixel, processLinksForTracking } from '../utils/email';
import { generateTrackingId } from '../utils/crypto';
import { sanitizeEmailHtml } from '../middleware/validation';
import db from '../config/database';
import { SMTPDeliveryService } from './smtpDelivery';
import { Env } from '../utils/env';

interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  encoding?: string;
}

interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  template_id?: number;
  variables?: Record<string, any>;
  tracking?: boolean;
  userId: number;
  apiKeyId?: number;
}

class EmailService {
  private transporter!: Transporter;
  private dkimPrivateKey: string | null = null;
  private smtpDelivery: SMTPDeliveryService;

  constructor() {
    this.initializeTransporter();
    this.loadDkimKey();
    this.smtpDelivery = new SMTPDeliveryService();
  }

  private initializeTransporter() {
    const config = {
      host: process.env['SMTP_HOST'] || 'localhost',
      port: parseInt(process.env['SMTP_PORT'] || '587', 10),
      secure: process.env['SMTP_SECURE'] === 'true',
      auth: (process.env['SMTP_USER'] && process.env['SMTP_PASS']) ? {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS']
      } : undefined,
      dkim: this.dkimPrivateKey ? {
        domainName: process.env['DKIM_DOMAIN'] || 'localhost',
        keySelector: process.env['DKIM_SELECTOR'] || 'default',
        privateKey: this.dkimPrivateKey
      } : undefined
    };

    this.transporter = createTransport(config);
  }

  private loadDkimKey() {
    const keyPath = process.env['DKIM_PRIVATE_KEY_PATH'];
    if (keyPath && fs.existsSync(keyPath)) {
      try {
        this.dkimPrivateKey = fs.readFileSync(keyPath, 'utf8');
        logger.info('DKIM private key loaded successfully');
      } catch (error) {
        logger.warn('Failed to load DKIM private key', { error });
      }
    }
  }

  private async validateRecipients(recipients: string | string[]): Promise<void> {
    const emails = Array.isArray(recipients) ? recipients : [recipients];
    
    for (const email of emails) {
      const validation = await validateEmailAddress(email);
      if (!validation.isValid) {
        throw new Error(`Invalid recipient email ${email}: ${validation.reason}`);
      }
    }
  }

  private async processEmailTemplate(templateId: number, variables: Record<string, any>): Promise<{
    subject: string;
    html?: string;
    text?: string;
  }> {
    const template = await db('email_templates')
      .where('id', templateId)
      .first();

    if (!template) {
      throw new Error('Email template not found');
    }

    const result: { subject: string; html?: string; text?: string } = {
      subject: processTemplate(template.subject, variables)
    };
    
    if (template.html_content) {
      const processedHtml = processTemplate(template.html_content, variables);
      result.html = sanitizeEmailHtml(processedHtml);
    }
    
    if (template.text_content) {
      result.text = processTemplate(template.text_content, variables);
    }
    
    return result;
  }

  private async addTrackingToEmail(emailId: string, html: string): Promise<string> {
    const trackingDomain = process.env['TRACKING_DOMAIN'] || 'localhost:3000';
    
    // Add tracking pixel
    let trackedHtml = html + generateTrackingPixel(emailId, trackingDomain);
    
    // Process links for click tracking
    trackedHtml = processLinksForTracking(trackedHtml, emailId, trackingDomain);
    
    return trackedHtml;
  }

  async sendEmail(options: SendEmailOptions): Promise<{
    messageId: string;
    emailId: number;
    trackingId: string;
  }> {
    try {
      // Validate recipients
      await this.validateRecipients(options.to);
      
      if (options.cc) {
        await this.validateRecipients(options.cc);
      }
      
      if (options.bcc) {
        await this.validateRecipients(options.bcc);
      }

      let subject = options.subject;
      let html = options.html ? sanitizeEmailHtml(options.html) : options.html;
      let text = options.text;

      // Process template if provided
      if (options.template_id && options.variables) {
        const processedTemplate = await this.processEmailTemplate(options.template_id, options.variables);
        subject = processedTemplate.subject;
        html = processedTemplate.html || html;
        text = processedTemplate.text || text;
      }

      // Generate tracking ID
      const trackingId = generateTrackingId();

      // Create email record in database
      const insertResult = await db('emails').insert({
        user_id: options.userId,
        api_key_id: options.apiKeyId,
        template_id: options.template_id,
        from_email: options.from,
        to_email: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject,
        html_content: html,
        text_content: text,
        status: 'queued',
        created_at: new Date()
      });
      
      const rawEmailId = insertResult[0];
      const emailId = Array.isArray(rawEmailId) ? rawEmailId[0] : rawEmailId;
      
      if (!emailId) {
        throw new Error('Failed to create email record in database');
      }

      // Add tracking if enabled and HTML content exists
      if (options.tracking !== false && html) {
        html = await this.addTrackingToEmail(trackingId, html);
      }

      // Prepare email options
      const mailOptions = {
        from: `${process.env['SMTP_FROM_NAME'] || 'UltraZend'} <${options.from}>`,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
        subject,
        html,
        text,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          encoding: att.encoding || 'base64'
        })),
        headers: {
          'X-Email-ID': emailId.toString(),
          'X-Tracking-ID': trackingId
        }
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      // Update email status
      await db('emails')
        .where('id', emailId)
        .update({
          status: 'sent',
          sent_at: new Date()
        });

      // Log analytics event
      await db('email_analytics').insert({
        email_id: emailId,
        event_type: 'sent',
        timestamp: new Date()
      });

      logger.info('Email sent successfully', {
        emailId,
        messageId: info.messageId,
        to: options.to
      });

      return {
        messageId: info.messageId,
        emailId: emailId as number,
        trackingId
      };

    } catch (error) {
      logger.error('Failed to send email', { error, options });
      throw error;
    }
  }

  async sendBatchEmails(emails: SendEmailOptions[]): Promise<Array<{
    success: boolean;
    messageId?: string;
    emailId?: number;
    trackingId?: string;
    error?: string;
    recipient: string;
  }>> {
    const results = [];

    for (const emailOptions of emails) {
      try {
        const result = await this.sendEmail(emailOptions);
        results.push({
          success: true,
          messageId: result.messageId,
          emailId: result.emailId,
          trackingId: result.trackingId,
          recipient: Array.isArray(emailOptions.to) ? emailOptions.to.join(', ') : emailOptions.to
        });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          recipient: Array.isArray(emailOptions.to) ? emailOptions.to.join(', ') : emailOptions.to
        });
      }
    }

    return results;
  }

  async verifyTransporter(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('SMTP transporter verified successfully');
      return true;
    } catch (error) {
      logger.error('SMTP transporter verification failed', { error });
      return false;
    }
  }

  async trackEmailOpen(emailId: string, userAgent?: string, ipAddress?: string): Promise<void> {
    try {
      const email = await db('emails').where('id', emailId).first();
      if (!email) {
        logger.warn('Email not found for tracking', { emailId });
        return;
      }

      // Update email opened timestamp if not already set
      if (!email.opened_at) {
        await db('emails')
          .where('id', emailId)
          .update({ opened_at: new Date() });
      }

      // Log analytics event
      await db('email_analytics').insert({
        email_id: emailId,
        event_type: 'opened',
        timestamp: new Date(),
        user_agent: userAgent,
        ip_address: ipAddress
      });

      logger.info('Email open tracked', { emailId });
    } catch (error) {
      logger.error('Failed to track email open', { error, emailId });
    }
  }

  async trackEmailClick(emailId: string, url: string, userAgent?: string, ipAddress?: string): Promise<void> {
    try {
      const email = await db('emails').where('id', emailId).first();
      if (!email) {
        logger.warn('Email not found for tracking', { emailId });
        return;
      }

      // Update email clicked timestamp if not already set
      if (!email.clicked_at) {
        await db('emails')
          .where('id', emailId)
          .update({ clicked_at: new Date() });
      }

      // Log analytics event
      await db('email_analytics').insert({
        email_id: emailId,
        event_type: 'clicked',
        timestamp: new Date(),
        user_agent: userAgent,
        ip_address: ipAddress,
        metadata: JSON.stringify({ url })
      });

      logger.info('Email click tracked', { emailId, url });
    } catch (error) {
      logger.error('Failed to track email click', { error, emailId, url });
    }
  }

  async handleBounce(emailId: string, bounceReason: string): Promise<void> {
    try {
      await db('emails')
        .where('id', emailId)
        .update({
          status: 'bounced',
          bounce_reason: bounceReason
        });

      // Log analytics event
      await db('email_analytics').insert({
        email_id: emailId,
        event_type: 'bounced',
        timestamp: new Date(),
        metadata: JSON.stringify({ reason: bounceReason })
      });

      logger.info('Email bounce processed', { emailId, bounceReason });
    } catch (error) {
      logger.error('Failed to process email bounce', { error, emailId });
    }
  }

  async sendInternalEmail(options: SendEmailOptions): Promise<{
    emailId: number;
    trackingId: string;
  }> {
    try {
      // Validate recipients
      await this.validateRecipients(options.to);
      
      // Generate tracking ID
      const trackingId = generateTrackingId();

      // Create email record in database as queued for real delivery
      const insertResult = await db('emails').insert({
        user_id: options.userId,
        api_key_id: options.apiKeyId,
        template_id: options.template_id,
        from_email: options.from,
        to_email: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html_content: options.html,
        text_content: options.text,
        status: 'queued', // Queue for real SMTP delivery
        created_at: new Date()
      });
      
      const rawEmailId = insertResult[0];
      const emailId = Array.isArray(rawEmailId) ? rawEmailId[0] : rawEmailId;
      
      if (!emailId) {
        throw new Error('Failed to create email record in database');
      }

      // Deliver email via real SMTP
      const toEmail = Array.isArray(options.to) ? options.to[0] : options.to;
      if (!toEmail) {
        throw new Error('No recipient email provided');
      }
      
      const delivered = await this.smtpDelivery.deliverEmail({
        from: options.from,
        to: toEmail,
        subject: options.subject,
        html: options.html || undefined,
        text: options.text || undefined,
        headers: {
          'X-Email-ID': emailId.toString(),
          'X-Tracking-ID': trackingId
        }
      });

      if (!delivered) {
        throw new Error('Failed to deliver email via SMTP');
      }

      logger.info('Email delivered via real SMTP', {
        emailId,
        to: options.to,
        subject: options.subject
      });

      return {
        emailId: emailId as number,
        trackingId
      };

    } catch (error) {
      logger.error('Failed to send internal email', { error, options });
      throw error;
    }
  }

  async sendVerificationEmail(email: string, name: string, verificationToken: string): Promise<void> {
    try {
      logger.info('Sending verification email via SMTP delivery', { 
        email,
        name,
        tokenLength: verificationToken.length,
        tokenType: typeof verificationToken
      });

      // Validate token format
      if (!verificationToken || typeof verificationToken !== 'string' || verificationToken.length !== 64) {
        throw new Error(`Invalid verification token format: length=${verificationToken?.length}, type=${typeof verificationToken}`);
      }

      // Use environment-specific frontend URL
      const frontendUrl = process.env['FRONTEND_URL'] || 'https://www.ultrazend.com.br';
      const verificationUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
      
      logger.info('Generated verification URL', {
        email,
        frontendUrl,
        verificationUrl: verificationUrl.substring(0, 100) + '...',
        tokenInUrl: verificationUrl.includes(verificationToken)
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verifique seu Email - Ultrazend</title>
            <style>
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: #374151;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f9fafb;
                }
                .container {
                    background-color: white;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    color: #6366f1;
                    margin-bottom: 10px;
                }
                h1 {
                    color: #1f2937;
                    font-size: 24px;
                    margin: 0 0 20px 0;
                }
                .button {
                    display: inline-block;
                    background-color: #6366f1;
                    color: white;
                    padding: 12px 32px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: 500;
                    margin: 20px 0;
                    text-align: center;
                }
                .button:hover {
                    background-color: #5855eb;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    font-size: 14px;
                    color: #6b7280;
                    text-align: center;
                }
                .warning {
                    background-color: #fef3c7;
                    border: 1px solid #f59e0b;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 20px 0;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">🚀 Ultrazend</div>
                    <h1>Verifique seu Email</h1>
                </div>
                
                <p>Olá <strong>${name}</strong>,</p>
                
                <p>Obrigado por se registrar no Ultrazend! Para completar seu cadastro e começar a usar nossa plataforma, você precisa verificar seu endereço de email.</p>
                
                <div style="text-align: center;">
                    <a href="${verificationUrl}" class="button">Verificar Email</a>
                </div>
                
                <p>Ou copie e cole o link abaixo no seu navegador:</p>
                <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                    ${verificationUrl}
                </p>
                
                <div class="warning">
                    <strong>⚠️ Importante:</strong> Este link de verificação expira em 24 horas. Se você não verificar seu email dentro deste período, precisará solicitar um novo link.
                </div>
                
                <p>Se você não criou uma conta no Ultrazend, pode ignorar este email com segurança.</p>
                
                <div class="footer">
                    <p>Esta é uma mensagem automática, por favor não responda este email.</p>
                    <p>© 2025 Ultrazend. Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>
      `;

      const textContent = `
        Olá ${name},

        Obrigado por se registrar no Ultrazend!

        Para completar seu cadastro, clique no link abaixo para verificar seu email:
        ${verificationUrl}

        Este link expira em 24 horas.

        Se você não criou uma conta no Ultrazend, pode ignorar este email.

        Atenciosamente,
        Equipe Ultrazend
      `;

      // USAR SMTP DELIVERY DIRETAMENTE (SEM CIRCULAR DEPENDENCY)
      const { SMTPDeliveryService } = await import('./smtpDelivery');
      const smtpDelivery = new SMTPDeliveryService();
      
      // Buscar system user para usar ID correto
      const systemUser = await db('users').where('email', 'system@ultrazend.local').first();
      if (!systemUser) {
        throw new Error('System user not found. Database migration may have failed.');
      }

      // Criar email record no banco para tracking
      const insertResult = await db('emails').insert({
        user_id: systemUser.id, // System user ID correto
        from_email: `noreply@${Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br')}`,
        to_email: email,
        subject: 'Verifique seu email - Ultrazend',
        html_content: htmlContent,
        text_content: textContent,
        status: 'queued',
        created_at: new Date()
      });

      const emailId = Array.isArray(insertResult) ? insertResult[0] : insertResult;

      // Entregar via SMTP direto
      const delivered = await smtpDelivery.deliverEmail({
        from: `noreply@${Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br')}`,
        to: email,
        subject: 'Verifique seu email - Ultrazend',
        html: htmlContent,
        text: textContent,
        headers: {
          'X-Email-ID': emailId.toString(),
          'X-Mailer': 'UltraZend SMTP Server'
        }
      });

      if (!delivered) {
        throw new Error('Failed to deliver verification email via SMTP');
      }

      logger.info('Verification email sent successfully via SMTP delivery', { 
        email, 
        emailId,
        delivered: true
      });

    } catch (error) {
      logger.error('Failed to send verification email via SMTP delivery', { error, email });
      throw error;
    }
  }
}

export const emailService = new EmailService();
export default emailService;