import { createTransport, Transporter } from 'nodemailer';
import fs from 'fs';
import { logger } from '../config/logger';
import { validateEmailAddress, processTemplate, generateTrackingPixel, processLinksForTracking } from '../utils/email';
import { generateTrackingId } from '../utils/crypto';
import db from '../config/database';

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

  constructor() {
    this.initializeTransporter();
    this.loadDkimKey();
  }

  private initializeTransporter() {
    const config = {
      host: process.env['SMTP_HOST'] || 'localhost',
      port: parseInt(process.env['SMTP_PORT'] || '587', 10),
      secure: process.env['SMTP_SECURE'] === 'true',
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS']
      },
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
      result.html = processTemplate(template.html_content, variables);
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
      let html = options.html;
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
      const [rawEmailId] = await db('emails').insert({
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
        from: `${process.env['SMTP_FROM_NAME'] || 'UrbanSend'} <${options.from}>`,
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
}

export const emailService = new EmailService();
export default emailService;