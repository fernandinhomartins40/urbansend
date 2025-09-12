/**
 * @ultrazend/smtp-internal - Template Engine
 * Engine simples para templates HTML
 */

import * as fs from 'fs';
import * as path from 'path';
import { EmailTemplateData } from '../types';
import { sanitizeEmailHtml } from '../utils/sanitize';

export class TemplateEngine {
  private templateCache: Map<string, string> = new Map();
  private templateDir: string;

  constructor(templateDir?: string) {
    this.templateDir = templateDir || path.join(__dirname, '../templates');
  }

  private loadTemplate(templateName: string): string {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templatePath = path.join(this.templateDir, `${templateName}.html`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    this.templateCache.set(templateName, templateContent);
    return templateContent;
  }

  private replaceVariables(template: string, data: Record<string, any>): string {
    let result = template;

    // Substituir variáveis simples {{variable}}
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value !== undefined && value !== null) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, String(value));
      }
    });

    // Tratar condicionais simples {{#if variable}}...{{/if}}
    result = result.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, variable, content) => {
      return data[variable] ? content : '';
    });

    // Limpar variáveis não substituídas
    result = result.replace(/{{[^}]+}}/g, '');

    return result;
  }

  renderVerificationEmail(data: EmailTemplateData): { html: string; text: string } {
    const htmlTemplate = this.loadTemplate('verification');
    const html = this.replaceVariables(htmlTemplate, data);

    const text = `
${data.appName} - Verificar Email

Olá, ${data.name}!

Bem-vindo ao ${data.appName}! Para completar seu cadastro e começar a usar nossa plataforma, você precisa verificar seu endereço de email acessando o link abaixo:

${data.actionUrl}

Se você não se cadastrou no ${data.appName}, pode ignorar este email.
Este link de verificação expira em 24 horas.

---
${data.appName}
${data.appUrl}
    `.trim();

    return {
      html: sanitizeEmailHtml(html),
      text
    };
  }

  renderPasswordResetEmail(data: EmailTemplateData): { html: string; text: string } {
    const htmlTemplate = this.loadTemplate('password-reset');
    const html = this.replaceVariables(htmlTemplate, data);

    const text = `
${data.appName} - Redefinir Senha

Olá, ${data.name}!

Recebemos uma solicitação para redefinir a senha da sua conta ${data.appName}. 
Acesse o link abaixo para criar uma nova senha:

${data.actionUrl}

Se você não solicitou a redefinição de senha, pode ignorar este email.
Este link expira em 1 hora por motivos de segurança.

---
${data.appName}
${data.appUrl}
    `.trim();

    return {
      html: sanitizeEmailHtml(html),
      text
    };
  }

  renderSystemNotification(data: EmailTemplateData): { html: string; text: string } {
    const htmlTemplate = this.loadTemplate('notification');
    
    // Substituir quebras de linha no HTML
    const messageWithBreaks = data.message ? data.message.replace(/\n/g, '<br>') : '';
    const templateData = { ...data, message: messageWithBreaks };
    
    const html = this.replaceVariables(htmlTemplate, templateData);

    let text = `
${data.appName} - ${data.title}

${data.message}
    `;

    if (data.actionUrl && data.actionText) {
      text += `\n\n${data.actionText}: ${data.actionUrl}`;
    }

    text += `\n\n---\n${data.appName}\n${data.appUrl}`;

    return {
      html: sanitizeEmailHtml(html),
      text: text.trim()
    };
  }
}