/**
 * 🛡️ SIMPLE EMAIL VALIDATOR
 * Validador simplificado mas robusto para emails externos
 * Versão: 1.0.0 - Sem Over-Engineering
 */

import { logger } from '../config/logger';
import { validateEmailAddress } from '../utils/email';
import db from '../config/database';
import {
  EmailData,
  ValidationResult,
  UserDomain
} from './types';

// Interface para resultados de estatísticas de validação
interface ValidationStatsResult {
  total_validations: number;
  fallback_count: number;
  validation_failures: number;
}

export interface DomainValidationConfig {
  enableDomainValidation: boolean;
  fallbackDomain: string;
  allowedInternalDomains: string[];
  strictValidation: boolean;
}

export class SimpleEmailValidator {
  private config: DomainValidationConfig;

  constructor(config?: Partial<DomainValidationConfig>) {
    this.config = {
      enableDomainValidation: true,
      fallbackDomain: 'ultrazend.com.br',
      allowedInternalDomains: [
        'ultrazend.com.br',
        'mail.ultrazend.com.br',
        'www.ultrazend.com.br'
      ],
      strictValidation: false,
      ...config
    };

    logger.debug('SimpleEmailValidator initialized', {
      config: this.config
    });
  }

  /**
   * Validação principal de email com verificação de domínio
   */
  async validate(emailData: EmailData, userId: number): Promise<ValidationResult> {
    try {
      logger.debug('Starting email validation', {
        userId,
        from: emailData.from,
        enableDomainValidation: this.config.enableDomainValidation
      });

      // 1. Validação básica de formato
      const formatValidation = await this.validateEmailFormat(emailData.from);
      if (!formatValidation.valid) {
        return {
          valid: false,
          reason: formatValidation.reason,
          warnings: ['Email format validation failed']
        };
      }

      // 2. Extrair domínio
      const domain = this.extractDomain(emailData.from);
      if (!domain) {
        return {
          valid: false,
          reason: 'Could not extract domain from email address'
        };
      }

      // 3. Verificar se é domínio interno (sempre permitido)
      if (this.isInternalDomain(domain)) {
        logger.debug('Internal domain detected, allowing without validation', {
          userId,
          domain,
          email: emailData.from
        });

        return {
          valid: true,
          email: emailData
        };
      }

      // 4. Validação de propriedade de domínio (se habilitada)
      if (this.config.enableDomainValidation) {
        const domainOwnership = await this.checkDomainOwnership(domain, userId);
        
        if (domainOwnership.verified) {
          logger.info('Domain ownership verified', {
            userId,
            domain,
            verifiedAt: domainOwnership.verifiedAt
          });

          return {
            valid: true,
            email: emailData
          };
        } else {
          // Aplicar fallback se domínio não verificado
          const fallbackResult = this.applyFallback(emailData, 
            `Domain '${domain}' not verified for user ${userId}`
          );

          logger.warn('Domain not verified, applying fallback', {
            userId,
            originalDomain: domain,
            fallbackDomain: this.config.fallbackDomain,
            originalFrom: emailData.from,
            fallbackFrom: fallbackResult.email?.from
          });

          return fallbackResult;
        }
      }

      // 5. Se validação de domínio desabilitada, permitir tudo
      logger.debug('Domain validation disabled, allowing email', {
        userId,
        domain
      });

      return {
        valid: true,
        email: emailData
      };

    } catch (error) {
      logger.error('Email validation failed with error', {
        userId,
        email: emailData.from,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Em caso de erro, aplicar fallback para garantir funcionamento
      if (this.config.strictValidation) {
        return {
          valid: false,
          reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      } else {
        return this.applyFallback(emailData, 
          `Validation error, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Validação básica de formato de email
   */
  private async validateEmailFormat(email: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      if (!email || typeof email !== 'string' || email.trim() === '') {
        return {
          valid: false,
          reason: 'Email address is required and must be a non-empty string'
        };
      }

      const validation = await validateEmailAddress(email.trim());
      return {
        valid: validation.isValid,
        reason: validation.reason
      };

    } catch (error) {
      return {
        valid: false,
        reason: `Email format validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Extrair domínio do email
   */
  private extractDomain(email: string): string | null {
    try {
      const trimmedEmail = email.trim();
      const atIndex = trimmedEmail.lastIndexOf('@');
      
      if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
        return null;
      }

      const domain = trimmedEmail.substring(atIndex + 1).toLowerCase();
      
      // Validação básica do domínio
      if (domain.length === 0 || domain.includes(' ') || !domain.includes('.')) {
        return null;
      }

      return domain;
    } catch (error) {
      logger.debug('Failed to extract domain', { email, error });
      return null;
    }
  }

  /**
   * Verificar se é domínio interno
   */
  private isInternalDomain(domain: string): boolean {
    return this.config.allowedInternalDomains.includes(domain.toLowerCase());
  }

  /**
   * Verificar propriedade do domínio pelo usuário
   */
  async checkDomainOwnership(domain: string, userId: number): Promise<{
    verified: boolean;
    verifiedAt?: Date;
  }> {
    try {
      const domainRecord = await db('user_domains')
        .where('user_id', userId)
        .where('domain', domain.toLowerCase())
        .where('verified', true)
        .first() as UserDomain | undefined;

      if (domainRecord) {
        return {
          verified: true,
          verifiedAt: domainRecord.verified_at || undefined
        };
      }

      return { verified: false };

    } catch (error) {
      logger.error('Failed to check domain ownership', {
        userId,
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Em caso de erro, assumir não verificado
      return { verified: false };
    }
  }

  /**
   * Aplicar fallback para domínio não verificado
   */
  applyFallback(emailData: EmailData, reason: string): ValidationResult {
    try {
      const originalFrom = emailData.from;
      const localPart = this.extractLocalPart(originalFrom);
      const fallbackEmail = `${localPart}@${this.config.fallbackDomain}`;

      const fallbackEmailData: EmailData = {
        ...emailData,
        from: fallbackEmail
      };

      logger.info('Fallback applied to email', {
        originalFrom,
        fallbackFrom: fallbackEmail,
        reason
      });

      return {
        valid: true,
        email: fallbackEmailData,
        warnings: [
          `Original sender domain not verified, using fallback: ${this.config.fallbackDomain}`,
          reason
        ]
      };

    } catch (error) {
      logger.error('Failed to apply fallback', {
        originalEmail: emailData.from,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        valid: false,
        reason: `Fallback application failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Extrair parte local do email (antes do @)
   */
  private extractLocalPart(email: string): string {
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) {
      return email; // Fallback se não encontrar @
    }
    return email.substring(0, atIndex);
  }

  /**
   * Adicionar domínio verificado para um usuário
   */
  async addVerifiedDomain(userId: number, domain: string, verificationMethod: string = 'manual'): Promise<boolean> {
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      
      // Verificar se já existe
      const existing = await db('user_domains')
        .where('user_id', userId)
        .where('domain', normalizedDomain)
        .first();

      if (existing) {
        // Atualizar se não verificado
        if (!existing.verified) {
          await db('user_domains')
            .where('id', existing.id)
            .update({
              verified: true,
              verified_at: new Date(),
              verification_method: verificationMethod,
              updated_at: new Date()
            });

          logger.info('Domain verification updated', {
            userId,
            domain: normalizedDomain,
            method: verificationMethod
          });
        }
        return true;
      }

      // Inserir novo domínio verificado
      await db('user_domains').insert({
        user_id: userId,
        domain: normalizedDomain,
        verified: true,
        verified_at: new Date(),
        verification_method: verificationMethod,
        created_at: new Date(),
        updated_at: new Date()
      });

      logger.info('New verified domain added', {
        userId,
        domain: normalizedDomain,
        method: verificationMethod
      });

      return true;

    } catch (error) {
      logger.error('Failed to add verified domain', {
        userId,
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Listar domínios verificados do usuário
   */
  async getUserVerifiedDomains(userId: number): Promise<UserDomain[]> {
    try {
      const domains = await db('user_domains')
        .where('user_id', userId)
        .where('verified', true)
        .orderBy('verified_at', 'desc');

      return domains;

    } catch (error) {
      logger.error('Failed to get user verified domains', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Remover domínio verificado
   */
  async removeVerifiedDomain(userId: number, domain: string): Promise<boolean> {
    try {
      const result = await db('user_domains')
        .where('user_id', userId)
        .where('domain', domain.toLowerCase())
        .del();

      if (result > 0) {
        logger.info('Verified domain removed', { userId, domain });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to remove verified domain', {
        userId,
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Validar múltiplos emails de uma vez (para batch)
   */
  async validateBatch(emailDataList: EmailData[], userId: number): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const emailData of emailDataList) {
      try {
        const result = await this.validate(emailData, userId);
        results.push(result);
      } catch (error) {
        results.push({
          valid: false,
          reason: `Batch validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    return results;
  }

  /**
   * Obter estatísticas de validação
   */
  async getValidationStats(userId?: number): Promise<any> {
    try {
      let query = db('email_events')
        .select(
          db.raw('COUNT(*) as total_validations'),
          db.raw('COUNT(CASE WHEN event_data LIKE "%fallback_applied%" THEN 1 END) as fallback_count'),
          db.raw('COUNT(CASE WHEN event_type = "failed" THEN 1 END) as validation_failures')
        );

      if (userId) {
        query = query.where('user_id', userId);
      }

      const statsRaw = await query.first();

      const stats: ValidationStatsResult | undefined = statsRaw ? {
        total_validations: Number((statsRaw as any).total_validations) || 0,
        fallback_count: Number((statsRaw as any).fallback_count) || 0,
        validation_failures: Number((statsRaw as any).validation_failures) || 0
      } : undefined;

      return {
        total_validations: stats?.total_validations || 0,
        fallback_applications: stats?.fallback_count || 0,
        validation_failures: stats?.validation_failures || 0,
        fallback_rate: stats?.total_validations > 0 ? 
          ((stats.fallback_count / stats.total_validations) * 100).toFixed(2) + '%' : '0%'
      };

    } catch (error) {
      logger.error('Failed to get validation stats', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  // ==============================
  // 🔄 MIGRATED STATIC METHODS 
  // From DomainValidator for backward compatibility
  // ==============================

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