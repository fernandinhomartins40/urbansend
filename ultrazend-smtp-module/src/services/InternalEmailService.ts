/**
 * @ultrazend/smtp-internal - Internal Email Service
 * Serviço de email interno para aplicações Node.js
 */

import { SMTPDeliveryService } from './SMTPDeliveryService';
import { TemplateEngine } from '../templates/TemplateEngine';
import { ModuleConfig, EmailResult, SystemNotification, EmailTemplateData } from '../types';
import { logger } from '../utils/logger';
import { generateTrackingId } from '../utils/sanitize';

export class InternalEmailService {
  private smtpDelivery: SMTPDeliveryService;
  private templateEngine: TemplateEngine;
  private config: Required<ModuleConfig>;

  constructor(config: ModuleConfig = {}) {
    this.config = {
      smtp: config.smtp || {},
      database: config.database || './emails.sqlite',
      templates: config.templates || {},
      defaultFrom: config.defaultFrom || 'noreply@app.com',
      appName: config.appName || 'Minha Aplicação',
      appUrl: config.appUrl || 'https://app.com',
      logger: config.logger || { enabled: true, level: 'info' }
    };

    // Inicializar serviços
    this.smtpDelivery = new SMTPDeliveryService(this.config.smtp);
    this.templateEngine = new TemplateEngine();

    logger.info('InternalEmailService initialized', {
      appName: this.config.appName,
      defaultFrom: this.config.defaultFrom,
      smtpHost: this.config.smtp.host || 'localhost'
    });
  }

  /**
   * Envia email de verificação de conta
   */
  async sendVerificationEmail(email: string, name: string, token: string): Promise<EmailResult> {
    try {
      logger.info('Sending verification email', {
        to: email,
        name: name.substring(0, 3) + '***'
      });

      const verificationUrl = this.buildVerificationUrl(token);
      
      const templateData: EmailTemplateData = {
        name: name,
        appName: this.config.appName,
        appUrl: this.config.appUrl,
        actionUrl: verificationUrl
      };

      const { html, text } = this.templateEngine.renderVerificationEmail(templateData);

      const emailData = {
        from: this.config.defaultFrom,
        to: email,
        subject: `Verifique seu email - ${this.config.appName}`,
        html,
        text,
        headers: {
          'X-Email-Type': 'verification',
          'X-Module': '@ultrazend/smtp-internal',
          'X-Tracking-ID': generateTrackingId()
        }
      };

      const success = await this.smtpDelivery.deliverEmail(emailData);
      
      if (!success) {
        throw new Error('SMTP delivery failed');
      }

      logger.info('Verification email sent successfully', { to: email });
      
      return {
        success: true,
        messageId: emailData.headers['X-Tracking-ID']
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to send verification email', {
        to: email,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Envia email de reset de senha
   */
  async sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<EmailResult> {
    try {
      logger.info('Sending password reset email', {
        to: email,
        name: name.substring(0, 3) + '***'
      });

      const templateData: EmailTemplateData = {
        name: name,
        appName: this.config.appName,
        appUrl: this.config.appUrl,
        actionUrl: resetUrl
      };

      const { html, text } = this.templateEngine.renderPasswordResetEmail(templateData);

      const emailData = {
        from: this.config.defaultFrom,
        to: email,
        subject: `Redefinir sua senha - ${this.config.appName}`,
        html,
        text,
        headers: {
          'X-Email-Type': 'password_reset',
          'X-Module': '@ultrazend/smtp-internal',
          'X-Tracking-ID': generateTrackingId()
        }
      };

      const success = await this.smtpDelivery.deliverEmail(emailData);
      
      if (!success) {
        throw new Error('SMTP delivery failed');
      }

      logger.info('Password reset email sent successfully', { to: email });

      return {
        success: true,
        messageId: emailData.headers['X-Tracking-ID']
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to send password reset email', {
        to: email,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Envia notificação do sistema
   */
  async sendSystemNotification(email: string, notification: SystemNotification): Promise<EmailResult> {
    try {
      logger.info('Sending system notification', {
        to: email,
        type: notification.type,
        title: notification.title
      });

      const templateData: EmailTemplateData = {
        name: '', // Não temos nome para notificações do sistema
        appName: this.config.appName,
        appUrl: this.config.appUrl,
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        actionText: notification.actionText
      };

      const { html, text } = this.templateEngine.renderSystemNotification(templateData);

      const emailData = {
        from: this.config.defaultFrom,
        to: email,
        subject: `${this.config.appName} - ${notification.title}`,
        html,
        text,
        headers: {
          'X-Email-Type': notification.type,
          'X-Module': '@ultrazend/smtp-internal',
          'X-Notification-Type': notification.type,
          'X-Tracking-ID': generateTrackingId()
        }
      };

      const success = await this.smtpDelivery.deliverEmail(emailData);
      
      if (!success) {
        throw new Error('SMTP delivery failed');
      }

      logger.info('System notification sent successfully', { 
        to: email, 
        type: notification.type 
      });

      return {
        success: true,
        messageId: emailData.headers['X-Tracking-ID']
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to send system notification', {
        to: email,
        type: notification.type,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Testa conexão do serviço
   */
  async testConnection(): Promise<boolean> {
    try {
      logger.info('Testing SMTP connection');
      
      const success = await this.smtpDelivery.testConnection();
      
      if (success) {
        logger.info('SMTP connection test successful');
      } else {
        logger.error('SMTP connection test failed');
      }

      return success;
    } catch (error) {
      logger.error('SMTP connection test error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Fecha conexões e limpa recursos
   */
  async close(): Promise<void> {
    await this.smtpDelivery.close();
    logger.info('InternalEmailService closed');
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): ModuleConfig {
    return { ...this.config };
  }

  /**
   * Constrói URL de verificação
   */
  private buildVerificationUrl(token: string): string {
    const baseUrl = this.config.appUrl.endsWith('/') 
      ? this.config.appUrl.slice(0, -1) 
      : this.config.appUrl;
    return `${baseUrl}/verify-email?token=${token}`;
  }
}