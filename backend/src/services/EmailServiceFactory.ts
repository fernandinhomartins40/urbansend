import { IEmailService } from './IEmailService';
import { logger } from '../config/logger';

// Imports dinâmicos para evitar dependências circulares
let InternalEmailService: any;
let ExternalEmailService: any;
let DomainValidator: any;
let MultiDomainDKIMManager: any;

export enum EmailServiceType {
  INTERNAL = 'internal',
  EXTERNAL = 'external'
}

export interface EmailServiceOptions {
  defaultFrom?: string;
  dkimDomain?: string;
  domainValidator?: any;
  dkimManager?: any;
}

/**
 * Factory para criação de serviços de email
 * Implementa o padrão Factory para separar emails da aplicação dos emails dos clientes
 */
export class EmailServiceFactory {
  private static domainValidator: any = null;
  private static dkimManager: any = null;
  private static initialized = false;

  /**
   * Inicializa as dependências de forma lazy
   */
  private static async initializeDependencies(): Promise<void> {
    if (!this.initialized) {
      try {
        // Imports dinâmicos para evitar problemas de dependência circular
        const internalModule = await import('./InternalEmailService');
        InternalEmailService = internalModule.InternalEmailService;

        const externalModule = await import('./ExternalEmailService');
        ExternalEmailService = externalModule.ExternalEmailService;

        const validatorModule = await import('./DomainValidator');
        DomainValidator = validatorModule.DomainValidator;

        const dkimModule = await import('./MultiDomainDKIMManager');
        MultiDomainDKIMManager = dkimModule.MultiDomainDKIMManager;

        this.initialized = true;
        logger.debug('EmailServiceFactory dependencies initialized');
      } catch (error) {
        logger.error('Failed to initialize EmailServiceFactory dependencies', { error });
        throw error;
      }
    }
  }

  /**
   * Cria uma instância do serviço de email apropriado
   * 
   * @param type - Tipo do serviço (INTERNAL ou EXTERNAL)
   * @param options - Opções adicionais para configuração
   * @returns Instância do serviço de email
   */
  static async createService(type: EmailServiceType, options?: EmailServiceOptions): Promise<IEmailService> {
    await this.initializeDependencies();
    
    logger.debug('Creating email service', { type, options: Object.keys(options || {}) });

    try {
      switch (type) {
        case EmailServiceType.INTERNAL:
          return new InternalEmailService({
            defaultFrom: options?.defaultFrom || 'noreply@ultrazend.com.br',
            dkimDomain: options?.dkimDomain || 'ultrazend.com.br'
          });

        case EmailServiceType.EXTERNAL:
          // Usar instâncias singleton para evitar múltiplas inicializações
          const domainValidator = options?.domainValidator || await this.getDomainValidator();
          const dkimManager = options?.dkimManager || await this.getDKIMManager();

          return new ExternalEmailService({
            domainValidator,
            dkimManager
          });

        default:
          const exhaustiveCheck: never = type;
          throw new Error(`Unsupported email service type: ${exhaustiveCheck}`);
      }
    } catch (error) {
      logger.error('Failed to create email service', { 
        type, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Cria um serviço para emails da aplicação (verificação, reset de senha, etc.)
   * 
   * @param options - Opções de configuração
   * @returns Serviço configurado para emails internos
   */
  static async createInternalService(options?: Partial<EmailServiceOptions>): Promise<IEmailService> {
    logger.debug('Creating internal email service');
    
    return this.createService(EmailServiceType.INTERNAL, {
      defaultFrom: options?.defaultFrom || 'noreply@ultrazend.com.br',
      dkimDomain: options?.dkimDomain || 'ultrazend.com.br'
    });
  }

  /**
   * Cria um serviço para emails dos clientes (via API)
   * 
   * @param options - Opções de configuração
   * @returns Serviço configurado para emails externos
   */
  static async createExternalService(options?: Partial<EmailServiceOptions>): Promise<IEmailService> {
    logger.debug('Creating external email service');
    
    return this.createService(EmailServiceType.EXTERNAL, {
      domainValidator: options?.domainValidator,
      dkimManager: options?.dkimManager
    });
  }

  /**
   * Obtém uma instância singleton do DomainValidator
   * 
   * @returns Instância compartilhada do DomainValidator
   */
  private static async getDomainValidator(): Promise<any> {
    if (!this.domainValidator) {
      logger.debug('Creating new DomainValidator instance');
      this.domainValidator = new DomainValidator();
    }
    return this.domainValidator;
  }

  /**
   * Obtém uma instância singleton do MultiDomainDKIMManager
   * 
   * @returns Instância compartilhada do MultiDomainDKIMManager
   */
  private static async getDKIMManager(): Promise<any> {
    if (!this.dkimManager) {
      logger.debug('Creating new MultiDomainDKIMManager instance');
      this.dkimManager = new MultiDomainDKIMManager();
    }
    return this.dkimManager;
  }

  /**
   * Reseta as instâncias singleton (útil para testes)
   */
  static resetSingletons(): void {
    logger.debug('Resetting singleton instances');
    this.domainValidator = null;
    this.dkimManager = null;
    this.initialized = false;
  }

  /**
   * Verifica se um tipo de serviço é válido
   * 
   * @param type - Tipo a ser validado
   * @returns true se válido
   */
  static isValidServiceType(type: string): type is EmailServiceType {
    return Object.values(EmailServiceType).includes(type as EmailServiceType);
  }

  /**
   * Lista todos os tipos de serviço disponíveis
   * 
   * @returns Array com todos os tipos válidos
   */
  static getAvailableServiceTypes(): EmailServiceType[] {
    return Object.values(EmailServiceType);
  }
}