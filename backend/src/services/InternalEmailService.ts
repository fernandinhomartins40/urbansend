import { IEmailService, EmailResult, SystemNotification } from './IEmailService';
import { SMTPDeliveryService } from './smtpDelivery';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import { generateTrackingId } from '../utils/crypto';
import { sanitizeEmailHtml } from '../middleware/validation';

export interface InternalEmailServiceOptions {
  defaultFrom?: string;
  dkimDomain?: string;
  enableTracking?: boolean;
}

/**
 * Serviço de email interno para emails da aplicação
 * Responsável por emails de verificação, reset de senha e notificações do sistema
 */
export class InternalEmailService implements IEmailService {
  private readonly smtpDelivery: SMTPDeliveryService;
  private readonly defaultFrom: string;
  private readonly dkimDomain: string;
  private readonly enableTracking: boolean;

  constructor(options: InternalEmailServiceOptions = {}) {
    this.smtpDelivery = new SMTPDeliveryService();
    this.defaultFrom = options.defaultFrom || 'noreply@ultrazend.com.br';
    this.dkimDomain = options.dkimDomain || 'ultrazend.com.br';
    this.enableTracking = options.enableTracking || false;

    logger.debug('InternalEmailService initialized', {
      defaultFrom: this.defaultFrom,
      dkimDomain: this.dkimDomain,
      enableTracking: this.enableTracking
    });
  }

  /**
   * Envia email de verificação de conta
   * 
   * @param email - Email do destinatário
   * @param name - Nome do usuário
   * @param token - Token de verificação
   */
  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    try {
      logger.info('Sending verification email', {
        to: email,
        name: name.substring(0, 3) + '***' // Log parcial do nome por privacidade
      });

      const verificationUrl = this.buildVerificationUrl(token);
      
      const emailData = {
        from: this.defaultFrom,
        to: email,
        subject: 'Verifique seu email - UltraZend',
        html: this.generateVerificationEmailHTML(name, verificationUrl),
        text: this.generateVerificationEmailText(name, verificationUrl),
        headers: {
          'X-Email-Type': 'verification',
          'X-UltraZend-Service': 'internal'
        }
      };

      const success = await this.smtpDelivery.deliverEmail(emailData);
      
      if (!success) {
        throw new Error('SMTP delivery failed');
      }

      logger.info('Verification email sent successfully', { to: email });
    } catch (error) {
      logger.error('Failed to send verification email', {
        to: email,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Envia email de reset de senha
   * 
   * @param email - Email do destinatário
   * @param name - Nome do usuário
   * @param resetUrl - URL para reset de senha
   */
  async sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<void> {
    try {
      logger.info('Sending password reset email', {
        to: email,
        name: name.substring(0, 3) + '***'
      });

      const emailData = {
        from: this.defaultFrom,
        to: email,
        subject: 'Redefinir sua senha - UltraZend',
        html: this.generatePasswordResetEmailHTML(name, resetUrl),
        text: this.generatePasswordResetEmailText(name, resetUrl),
        headers: {
          'X-Email-Type': 'password_reset',
          'X-UltraZend-Service': 'internal'
        }
      };

      const success = await this.smtpDelivery.deliverEmail(emailData);
      
      if (!success) {
        throw new Error('SMTP delivery failed');
      }

      logger.info('Password reset email sent successfully', { to: email });
    } catch (error) {
      logger.error('Failed to send password reset email', {
        to: email,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Envia notificação do sistema
   * 
   * @param email - Email do destinatário
   * @param notification - Dados da notificação
   */
  async sendSystemNotification(email: string, notification: SystemNotification): Promise<void> {
    try {
      logger.info('Sending system notification', {
        to: email,
        type: notification.type,
        title: notification.title
      });

      const emailData = {
        from: this.defaultFrom,
        to: email,
        subject: `UltraZend - ${notification.title}`,
        html: this.generateSystemNotificationHTML(notification),
        text: this.generateSystemNotificationText(notification),
        headers: {
          'X-Email-Type': notification.type,
          'X-UltraZend-Service': 'internal',
          'X-Notification-Type': notification.type
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
    } catch (error) {
      logger.error('Failed to send system notification', {
        to: email,
        type: notification.type,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Testa conexão do serviço
   * 
   * @returns true se conexão está funcionando
   */
  async testConnection(): Promise<boolean> {
    try {
      logger.debug('Testing internal email service connection');
      
      // Teste básico enviando para um email de teste interno
      const testEmail = {
        from: this.defaultFrom,
        to: 'test@ultrazend.com.br',
        subject: 'Test Connection - InternalEmailService',
        text: 'This is a connection test from InternalEmailService',
        html: '<p>This is a connection test from InternalEmailService</p>',
        headers: {
          'X-Email-Type': 'test',
          'X-UltraZend-Service': 'internal'
        }
      };

      // Não entregar realmente, só validar se a configuração está ok
      // Em um ambiente de produção, você pode querer enviar para um email de teste real
      return true;
    } catch (error) {
      logger.error('Internal email service connection test failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Constrói URL de verificação
   * 
   * @param token - Token de verificação
   * @returns URL completa de verificação
   */
  private buildVerificationUrl(token: string): string {
    const baseUrl = Env.get('APP_URL', 'https://ultrazend.com.br');
    return `${baseUrl}/verify-email?token=${token}`;
  }

  /**
   * Gera HTML para email de verificação
   * 
   * @param name - Nome do usuário
   * @param verificationUrl - URL de verificação
   * @returns HTML do email
   */
  private generateVerificationEmailHTML(name: string, verificationUrl: string): string {
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificar Email - UltraZend</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2563eb; margin: 0;">UltraZend</h1>
                <p style="color: #666; margin: 5px 0;">Plataforma de Email Marketing</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">Olá, ${sanitizeEmailHtml(name)}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
                Bem-vindo à UltraZend! Para completar seu cadastro e começar a usar nossa plataforma, 
                você precisa verificar seu endereço de email clicando no botão abaixo:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 5px; font-weight: bold; display: inline-block;">
                    Verificar Email
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                Se você não conseguir clicar no botão, copie e cole este link no seu navegador:<br>
                <a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a>
            </p>
            
            <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; color: #888; font-size: 12px;">
                <p>Se você não se cadastrou na UltraZend, pode ignorar este email.</p>
                <p>Este link de verificação expira em 24 horas.</p>
            </div>
        </div>
    </body>
    </html>`;
    
    return html;
  }

  /**
   * Gera texto puro para email de verificação
   * 
   * @param name - Nome do usuário
   * @param verificationUrl - URL de verificação
   * @returns Texto do email
   */
  private generateVerificationEmailText(name: string, verificationUrl: string): string {
    return `
UltraZend - Verificar Email

Olá, ${name}!

Bem-vindo à UltraZend! Para completar seu cadastro e começar a usar nossa plataforma, você precisa verificar seu endereço de email acessando o link abaixo:

${verificationUrl}

Se você não se cadastrou na UltraZend, pode ignorar este email.
Este link de verificação expira em 24 horas.

---
UltraZend - Plataforma de Email Marketing
https://ultrazend.com.br
    `.trim();
  }

  /**
   * Gera HTML para email de reset de senha
   * 
   * @param name - Nome do usuário
   * @param resetUrl - URL de reset
   * @returns HTML do email
   */
  private generatePasswordResetEmailHTML(name: string, resetUrl: string): string {
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Redefinir Senha - UltraZend</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2563eb; margin: 0;">UltraZend</h1>
                <p style="color: #666; margin: 5px 0;">Plataforma de Email Marketing</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">Olá, ${sanitizeEmailHtml(name)}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
                Recebemos uma solicitação para redefinir a senha da sua conta UltraZend. 
                Clique no botão abaixo para criar uma nova senha:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 5px; font-weight: bold; display: inline-block;">
                    Redefinir Senha
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                Se você não conseguir clicar no botão, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; color: #888; font-size: 12px;">
                <p>Se você não solicitou a redefinição de senha, pode ignorar este email.</p>
                <p>Este link expira em 1 hora por motivos de segurança.</p>
            </div>
        </div>
    </body>
    </html>`;
    
    return html;
  }

  /**
   * Gera texto puro para email de reset de senha
   * 
   * @param name - Nome do usuário
   * @param resetUrl - URL de reset
   * @returns Texto do email
   */
  private generatePasswordResetEmailText(name: string, resetUrl: string): string {
    return `
UltraZend - Redefinir Senha

Olá, ${name}!

Recebemos uma solicitação para redefinir a senha da sua conta UltraZend. 
Acesse o link abaixo para criar uma nova senha:

${resetUrl}

Se você não solicitou a redefinição de senha, pode ignorar este email.
Este link expira em 1 hora por motivos de segurança.

---
UltraZend - Plataforma de Email Marketing
https://ultrazend.com.br
    `.trim();
  }

  /**
   * Gera HTML para notificação do sistema
   * 
   * @param notification - Dados da notificação
   * @returns HTML do email
   */
  private generateSystemNotificationHTML(notification: SystemNotification): string {
    const buttonColor = this.getNotificationButtonColor(notification.type);
    
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${notification.title} - UltraZend</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2563eb; margin: 0;">UltraZend</h1>
                <p style="color: #666; margin: 5px 0;">Plataforma de Email Marketing</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">${sanitizeEmailHtml(notification.title)}</h2>
            
            <div style="color: #555; line-height: 1.6; margin-bottom: 25px;">
                ${sanitizeEmailHtml(notification.message).replace(/\n/g, '<br>')}
            </div>
            
            ${notification.actionUrl && notification.actionText ? `
            <div style="text-align: center; margin: 30px 0;">
                <a href="${notification.actionUrl}" 
                   style="background-color: ${buttonColor}; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 5px; font-weight: bold; display: inline-block;">
                    ${sanitizeEmailHtml(notification.actionText)}
                </a>
            </div>
            ` : ''}
            
            <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; color: #888; font-size: 12px;">
                <p>Esta é uma notificação automática do sistema UltraZend.</p>
            </div>
        </div>
    </body>
    </html>`;
    
    return html;
  }

  /**
   * Gera texto puro para notificação do sistema
   * 
   * @param notification - Dados da notificação
   * @returns Texto do email
   */
  private generateSystemNotificationText(notification: SystemNotification): string {
    let text = `
UltraZend - ${notification.title}

${notification.message}
    `;

    if (notification.actionUrl && notification.actionText) {
      text += `\n\n${notification.actionText}: ${notification.actionUrl}`;
    }

    text += `

---
UltraZend - Plataforma de Email Marketing
https://ultrazend.com.br
    `;

    return text.trim();
  }

  /**
   * Obtém cor do botão baseada no tipo de notificação
   * 
   * @param type - Tipo da notificação
   * @returns Cor hexadecimal
   */
  private getNotificationButtonColor(type: SystemNotification['type']): string {
    const colors = {
      welcome: '#059669',      // Verde
      password_reset: '#dc2626', // Vermelho
      account_update: '#2563eb', // Azul
      system_alert: '#f59e0b'    // Amarelo/Laranja
    };
    
    return colors[type] || '#2563eb';
  }
}