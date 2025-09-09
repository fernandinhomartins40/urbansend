import { logger } from '../config/logger';
import db from '../config/database';
import { validateEmailAddress } from '../utils/email';

export interface ValidatedSender {
  email: string;
  dkimDomain: string;
  valid: boolean;
  fallback?: boolean;
  reason?: string;
}

export interface DomainRecord {
  id: number;
  user_id: number;
  domain_name: string;
  is_verified: boolean;
  verification_token?: string;
  verification_method?: string;
  dkim_enabled: boolean;
  dkim_selector: string;
  spf_enabled: boolean;
  dmarc_enabled: boolean;
  dmarc_policy: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Validador de domínios para emails externos
 * Implementa a lógica de validação e fallback conforme Fase 2 do plano
 */
export class DomainValidator {
  private readonly INTERNAL_DOMAINS = [
    'ultrazend.com.br',
    'mail.ultrazend.com.br',
    'www.ultrazend.com.br'
  ];

  private readonly FALLBACK_DOMAIN = 'ultrazend.com.br';

  /**
   * Valida e corrige o domínio do sender conforme regras de negócio
   * 
   * @param userId - ID do usuário que está enviando o email
   * @param fromEmail - Email original do remetente
   * @returns Informações do sender validado/corrigido
   */
  async validateSenderDomain(userId: number, fromEmail: string): Promise<ValidatedSender> {
    try {
      // 🔧 FIX: Verificar se fromEmail é válido primeiro
      if (!fromEmail || typeof fromEmail !== 'string') {
        logger.warn('Invalid fromEmail parameter', { userId, fromEmail });
        return this.createFallbackSender(userId, 'Invalid email parameter');
      }

      // 1. Validação básica do formato do email
      const emailValidation = await validateEmailAddress(fromEmail);
      if (!emailValidation.isValid) {
        logger.warn('Invalid email format provided', { userId, fromEmail, reason: emailValidation.reason });
        return this.createFallbackSender(userId, `Invalid email format: ${emailValidation.reason}`);
      }

      const domain = this.extractDomain(fromEmail);
      
      if (!domain) {
        logger.warn('Could not extract domain from email', { userId, fromEmail });
        return this.createFallbackSender(userId, 'Invalid domain');
      }

      logger.debug('Validating sender domain', { 
        userId, 
        fromEmail, 
        domain 
      });

      // 2. Verificar se é domínio interno (sempre permitido)
      if (this.isInternalDomain(domain)) {
        logger.debug('Internal domain detected, allowing without modification', { 
          userId, 
          domain 
        });
        return {
          email: fromEmail,
          dkimDomain: this.FALLBACK_DOMAIN,
          valid: true
        };
      }

      // 3. Verificar propriedade e verificação do domínio pelo usuário
      const domainRecord = await this.checkDomainOwnership(userId, domain);

      if (domainRecord && domainRecord.is_verified) {
        logger.debug('Verified domain found for user', { 
          userId, 
          domain, 
          domainId: domainRecord.id 
        });
        
        return {
          email: fromEmail,
          dkimDomain: domain,
          valid: true
        };
      }

      // 4. Domínio não verificado ou não pertence ao usuário - aplicar fallback
      const reason = domainRecord ? 'Domain not verified' : 'Domain not owned';
      
      logger.info('Applying fallback for unverified domain', {
        userId,
        originalEmail: fromEmail,
        domain,
        reason
      });

      return this.createFallbackSender(userId, reason);

    } catch (error) {
      logger.error('Error validating sender domain', { 
        error: error instanceof Error ? error.message : String(error),
        userId, 
        fromEmail 
      });

      // Fallback de segurança em caso de erro
      return this.createFallbackSender(userId, 'Validation error');
    }
  }

  /**
   * Verifica se um domínio é considerado interno (UltraZend)
   * 
   * @param domain - Domínio a ser verificado
   * @returns true se for domínio interno
   */
  private isInternalDomain(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase();
    
    // 🔧 PROTEÇÃO EXTRA: Lista expandida de domínios principais para garantir funcionamento
    const allInternalDomains = [
      ...this.INTERNAL_DOMAINS,
      'ultrazend.com.br',      // Domínio principal
      'www.ultrazend.com.br',  // Subdomínio www
      'mail.ultrazend.com.br'  // Subdomínio mail
    ];
    
    return allInternalDomains.includes(normalizedDomain);
  }

  /**
   * Verifica se um usuário possui e verificou um domínio específico
   * 
   * @param userId - ID do usuário
   * @param domain - Domínio a ser verificado
   * @returns Registro do domínio se encontrado
   */
  private async checkDomainOwnership(userId: number, domain: string): Promise<DomainRecord | null> {
    try {
      const domainRecord = await db('domains')
        .select('*')
        .where('user_id', userId)
        .where('domain_name', domain.toLowerCase())
        .first() as DomainRecord | undefined;

      if (domainRecord) {
        logger.debug('Domain record found', {
          userId,
          domain,
          domainId: domainRecord.id,
          isVerified: domainRecord.is_verified
        });
      } else {
        logger.debug('No domain record found for user', { userId, domain });
      }

      return domainRecord || null;
    } catch (error) {
      logger.error('Error checking domain ownership', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        domain
      });
      return null;
    }
  }

  /**
   * Extrai o domínio de um endereço de email
   * 
   * @param email - Endereço de email
   * @returns Domínio extraído ou string vazia
   */
  private extractDomain(email: string): string {
    try {
      const parts = email.split('@');
      if (parts.length !== 2) {
        return '';
      }
      return parts[1].toLowerCase().trim();
    } catch (error) {
      logger.debug('Error extracting domain from email', { email, error });
      return '';
    }
  }

  /**
   * Cria um sender de fallback seguro usando o domínio principal
   * 
   * @param userId - ID do usuário
   * @param reason - Motivo do fallback
   * @returns ValidatedSender com configuração de fallback
   */
  private createFallbackSender(userId: number, reason: string): ValidatedSender {
    const fallbackEmail = `noreply+user${userId}@${this.FALLBACK_DOMAIN}`;
    
    logger.info('Creating fallback sender', {
      userId,
      fallbackEmail,
      reason,
      fallbackDomain: this.FALLBACK_DOMAIN
    });

    return {
      email: fallbackEmail,
      dkimDomain: this.FALLBACK_DOMAIN,
      valid: true,
      fallback: true,
      reason
    };
  }

  /**
   * Verifica se um email pode ser enviado por um usuário específico
   * Método auxiliar para validação prévia
   * 
   * @param userId - ID do usuário
   * @param fromEmail - Email do remetente
   * @returns true se pode enviar, false caso contrário
   */
  async canUserSendFromEmail(userId: number, fromEmail: string): Promise<boolean> {
    try {
      const validatedSender = await this.validateSenderDomain(userId, fromEmail);
      return validatedSender.valid;
    } catch (error) {
      logger.error('Error checking if user can send from email', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        fromEmail
      });
      return false;
    }
  }

  /**
   * Obtém a lista de domínios verificados de um usuário
   * 
   * @param userId - ID do usuário
   * @returns Lista de domínios verificados
   */
  async getVerifiedDomainsByUser(userId: number): Promise<DomainRecord[]> {
    try {
      const domains = await db('domains')
        .select('*')
        .where('user_id', userId)
        .where('is_verified', true)
        .orderBy('created_at', 'desc') as DomainRecord[];

      logger.debug('Retrieved verified domains for user', {
        userId,
        domainCount: domains.length
      });

      return domains;
    } catch (error) {
      logger.error('Error retrieving verified domains', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return [];
    }
  }

  /**
   * Valida se um domínio tem formato válido
   * 
   * @param domain - Domínio a ser validado
   * @returns true se formato é válido
   */
  static isValidDomainFormat(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    // Regex básica para validação de domínio
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    
    return domainRegex.test(domain.toLowerCase().trim());
  }

  /**
   * Normaliza um domínio removendo www e convertendo para minúsculas
   * 
   * @param domain - Domínio a ser normalizado
   * @returns Domínio normalizado
   */
  static normalizeDomain(domain: string): string {
    if (!domain) return '';
    
    let normalized = domain.toLowerCase().trim();
    
    // Remove prefixo www.
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    
    return normalized;
  }
}