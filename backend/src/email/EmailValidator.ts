/**
 * 🔧 EMAIL VALIDATOR - ARQUITETURA SIMPLIFICADA V3
 * 
 * Validador de email simples para a nova arquitetura
 * Substitui o validador complexo anterior com funcionalidade essencial
 */

import { logger } from '../config/logger'

export interface EmailValidationResult {
  isValid: boolean
  errors: string[]
  domain?: string
  normalizedFrom?: string
  normalizedTo?: string | string[]
}

export interface EmailRequest {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  reply_to?: string
  template_id?: number
  variables?: Record<string, string>
  tracking_enabled?: boolean
}

/**
 * Validador simples de email para arquitetura V3
 */
export class SimpleEmailValidator {
  
  /**
   * Validar formato básico de email
   */
  private isValidEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email.trim())
  }

  /**
   * Extrair domínio do email
   */
  private extractDomain(email: string): string | null {
    try {
      const trimmed = email.trim()
      const atIndex = trimmed.lastIndexOf('@')
      
      if (atIndex === -1 || atIndex === trimmed.length - 1) {
        return null
      }
      
      return trimmed.substring(atIndex + 1).toLowerCase()
    } catch (error) {
      logger.error('Erro ao extrair domínio', { email, error })
      return null
    }
  }

  /**
   * Normalizar endereços de email
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
  }

  /**
   * Normalizar lista de destinatários
   */
  private normalizeTo(to: string | string[]): string | string[] {
    if (Array.isArray(to)) {
      return to.map(email => this.normalizeEmail(email))
    }
    return this.normalizeEmail(to)
  }

  /**
   * Validar email request completo
   */
  validateEmailRequest(emailData: EmailRequest): EmailValidationResult {
    const errors: string[] = []
    
    try {
      // Validar campo 'from'
      if (!emailData.from || typeof emailData.from !== 'string') {
        errors.push('Campo "from" é obrigatório e deve ser string')
      } else if (!this.isValidEmailFormat(emailData.from)) {
        errors.push('Campo "from" deve ter formato válido de email')
      }

      // Validar campo 'to'
      if (!emailData.to) {
        errors.push('Campo "to" é obrigatório')
      } else {
        const toEmails = Array.isArray(emailData.to) ? emailData.to : [emailData.to]
        
        if (toEmails.length === 0) {
          errors.push('Campo "to" não pode estar vazio')
        }
        
        for (const email of toEmails) {
          if (typeof email !== 'string' || !this.isValidEmailFormat(email)) {
            errors.push(`Email destinatário inválido: ${email}`)
          }
        }
      }

      // Validar subject
      if (!emailData.subject || typeof emailData.subject !== 'string') {
        errors.push('Campo "subject" é obrigatório e deve ser string')
      } else if (emailData.subject.trim().length === 0) {
        errors.push('Campo "subject" não pode estar vazio')
      }

      // Validar conteúdo
      if (!emailData.html && !emailData.text && !emailData.template_id) {
        errors.push('Email deve ter pelo menos um dos campos: html, text ou template_id')
      }

      // Validar reply_to se fornecido
      if (emailData.reply_to && !this.isValidEmailFormat(emailData.reply_to)) {
        errors.push('Campo "reply_to" deve ter formato válido de email')
      }

      // Extrair domínio e normalizar
      const domain = emailData.from ? this.extractDomain(emailData.from) : null
      const normalizedFrom = emailData.from ? this.normalizeEmail(emailData.from) : undefined
      const normalizedTo = emailData.to ? this.normalizeTo(emailData.to) : undefined

      return {
        isValid: errors.length === 0,
        errors,
        domain,
        normalizedFrom,
        normalizedTo
      }

    } catch (error) {
      logger.error('Erro na validação de email', { error, emailData })
      return {
        isValid: false,
        errors: ['Erro interno na validação']
      }
    }
  }

  /**
   * Validar apenas formato de email (método auxiliar)
   */
  validateEmailFormat(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false
    }
    return this.isValidEmailFormat(email)
  }

  /**
   * Validar domínio (método auxiliar)
   */
  validateDomain(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false
    }
    
    // Validação básica de domínio (suporta todos os tipos: .com, .com.br, .gov.br, etc.)
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    return domainRegex.test(domain.trim().toLowerCase())
  }

  /**
   * Validar formato de domínio (método estático)
   */
  static isValidDomainFormat(domain: string): boolean {
    const validator = new SimpleEmailValidator()
    return validator.validateDomain(domain)
  }

  /**
   * Verificar propriedade de domínio (método simplificado)
   */
  async checkDomainOwnership(domain: string, userId: number): Promise<{ verified: boolean; verifiedAt?: Date }> {
    try {
      // Implementação simplificada - verificar se usuário tem domínio verificado
      const result = await require('../config/database').default('domains')
        .where('domain_name', domain)
        .where('user_id', userId)
        .where('is_verified', true)
        .first()
      
      return {
        verified: !!result,
        verifiedAt: result?.created_at ? new Date(result.created_at) : undefined
      }
    } catch (error) {
      logger.error('Erro ao verificar propriedade do domínio', { domain, userId, error })
      return { verified: false }
    }
  }

  /**
   * Validar email request (método legacy compatível)
   */
  validate(emailData: EmailRequest): EmailValidationResult {
    return this.validateEmailRequest(emailData)
  }

  /**
   * Adicionar domínio verificado (stub para compatibilidade)
   */
  addVerifiedDomain(domain: string, userId: number): void {
    logger.info('addVerifiedDomain chamado - arquitetura V3 usa verificação direta no banco', { domain, userId })
  }

  /**
   * Obter domínios verificados do usuário
   */
  async getUserVerifiedDomains(userId: number): Promise<string[]> {
    try {
      const domains = await require('../config/database').default('domains')
        .where('user_id', userId)
        .where('is_verified', true)
        .select('domain_name')
      
      return domains.map(d => d.domain_name)
    } catch (error) {
      logger.error('Erro ao buscar domínios verificados', { userId, error })
      return []
    }
  }

  /**
   * Remover domínio verificado (stub para compatibilidade)
   */
  removeVerifiedDomain(domain: string, userId: number): void {
    logger.info('removeVerifiedDomain chamado - arquitetura V3 usa remoção direta no banco', { domain, userId })
  }

  /**
   * Obter estatísticas de validação
   */
  getValidationStats(): any {
    return {
      architecture: 'simplified-v3',
      validationsPerformed: 0,
      domainsVerified: 0,
      timestamp: new Date().toISOString()
    }
  }
}

// Exportar instância singleton para compatibilidade
export const emailValidator = new SimpleEmailValidator()
export default emailValidator