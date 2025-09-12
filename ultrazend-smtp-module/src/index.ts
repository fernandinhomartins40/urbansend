/**
 * @ultrazend/smtp-internal
 * Módulo SMTP interno para aplicações Node.js
 * 
 * Funcionalidades:
 * - Email de verificação de conta
 * - Email de reset de senha  
 * - Notificações do sistema
 * - Templates HTML responsivos
 * - Migrations automáticas
 * - TypeScript nativo
 */

export { InternalEmailService } from './services/InternalEmailService';
export { SMTPDeliveryService } from './services/SMTPDeliveryService';
export { MigrationRunner } from './migrations/MigrationRunner';
export { TemplateEngine } from './templates/TemplateEngine';
export { SimpleLogger, logger } from './utils/logger';
export { sanitizeEmailHtml, generateTrackingId } from './utils/sanitize';

// Exportar todos os tipos
export * from './types';

// Classe principal para uso simplificado
import { InternalEmailService } from './services/InternalEmailService';
import { MigrationRunner } from './migrations/MigrationRunner';
import { ModuleConfig } from './types';
import { logger } from './utils/logger';

export class UltraZendSMTP {
  private emailService: InternalEmailService;
  private migrationRunner: MigrationRunner;

  constructor(config: ModuleConfig = {}) {
    this.emailService = new InternalEmailService(config);
    
    // Configurar migrations se database foi especificado
    if (config.database) {
      this.migrationRunner = new MigrationRunner(config.database);
    } else {
      this.migrationRunner = new MigrationRunner('./emails.sqlite');
    }
  }

  /**
   * Inicializa o módulo (executa migrations)
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing UltraZend SMTP module...');
      await this.migrationRunner.runMigrations();
      logger.info('UltraZend SMTP module initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize UltraZend SMTP module', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Testa conexão SMTP
   */
  async testConnection(): Promise<boolean> {
    return await this.emailService.testConnection();
  }

  /**
   * Envia email de verificação
   */
  async sendVerificationEmail(email: string, name: string, token: string) {
    return await this.emailService.sendVerificationEmail(email, name, token);
  }

  /**
   * Envia email de reset de senha
   */
  async sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
    return await this.emailService.sendPasswordResetEmail(email, name, resetUrl);
  }

  /**
   * Envia notificação do sistema
   */
  async sendSystemNotification(email: string, notification: import('./types').SystemNotification) {
    return await this.emailService.sendSystemNotification(email, notification);
  }

  /**
   * Obtém configuração atual
   */
  getConfig() {
    return this.emailService.getConfig();
  }

  /**
   * Fecha conexões e limpa recursos
   */
  async close(): Promise<void> {
    await this.emailService.close();
    await this.migrationRunner.close();
  }

  /**
   * Obtém instância do banco de dados
   */
  getDatabase() {
    return this.migrationRunner.getDatabase();
  }
}

// Exportar como default também
export default UltraZendSMTP;