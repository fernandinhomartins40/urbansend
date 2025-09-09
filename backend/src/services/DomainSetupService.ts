import { logger } from '../config/logger';
import db from '../config/database';
import { generateVerificationToken } from '../utils/crypto';
import { MultiDomainDKIMManager } from './MultiDomainDKIMManager';
import { DomainValidator } from './DomainValidator';
import dns from 'dns';
import { promisify } from 'util';

// Promisificar métodos DNS para uso com async/await
const resolveTxt = promisify(dns.resolveTxt);

export interface DomainRecord {
  id: number;
  user_id: number;
  domain_name: string;
  verification_token: string;
  verification_method: string;
  is_verified: boolean;
  dkim_enabled: boolean;
  dkim_selector: string;
  spf_enabled: boolean;
  dmarc_enabled: boolean;
  dmarc_policy: string;
  created_at: Date;
  updated_at: Date;
  verified_at?: Date;
}

export interface DNSInstructions {
  spf: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
  dkim: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
  dmarc: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
}

export interface DomainSetupResult {
  domain: DomainRecord;
  dnsInstructions: DNSInstructions;
  verificationToken: string;
  setupGuide: string[];
}

export interface DNSVerificationResult {
  valid: boolean;
  value?: string;
  error?: string;
  expectedValue: string;
  actualValue?: string;
}

export interface VerificationResult {
  success: boolean;
  domain: string;
  all_passed: boolean;
  results: {
    spf: DNSVerificationResult;
    dkim: DNSVerificationResult;
    dmarc: DNSVerificationResult;
  };
  verified_at: Date;
  nextSteps: string[];
}

export interface DomainStatus {
  domain: DomainRecord;
  dkim_status: {
    configured: boolean;
    public_key?: string;
    dns_valid: boolean;
  };
  spf_status: {
    configured: boolean;
    dns_valid: boolean;
  };
  dmarc_status: {
    configured: boolean;
    dns_valid: boolean;
  };
  overall_status: 'pending' | 'partial' | 'verified' | 'failed';
  completion_percentage: number;
}

/**
 * Serviço para configuração completa de domínios
 * Implementa todo o ciclo de vida de setup de domínio para clientes
 */
export class DomainSetupService {
  private readonly dkimManager: MultiDomainDKIMManager;
  private readonly domainValidator: DomainValidator;
  
  // Configurações DNS UltraZend
  private readonly ULTRAZEND_SPF_INCLUDE = 'ultrazend.com.br';
  private readonly DMARC_REPORT_EMAIL = 'dmarc@ultrazend.com.br';
  private readonly DNS_TIMEOUT = 10000; // 10 segundos
  private readonly MAX_DNS_RETRIES = 3;

  constructor() {
    this.dkimManager = new MultiDomainDKIMManager();
    this.domainValidator = new DomainValidator();
    
    logger.debug('DomainSetupService initialized');
  }

  /**
   * Inicia o processo de configuração de um domínio
   * 
   * @param userId - ID do usuário
   * @param domain - Domínio a ser configurado
   * @returns Resultado do setup com instruções DNS
   */
  async initiateDomainSetup(userId: number, domain: string): Promise<DomainSetupResult> {
    try {
      logger.info('Initiating domain setup', { userId, domain });

      // 1. Validar formato do domínio
      if (!this.isValidDomainFormat(domain)) {
        throw new Error('Formato de domínio inválido. Use um domínio válido como exemplo.com');
      }

      // Normalizar domínio
      const normalizedDomain = DomainValidator.normalizeDomain(domain);
      
      // 2. Verificar se domínio já existe para este usuário
      const existingDomain = await this.checkExistingDomain(userId, normalizedDomain);
      if (existingDomain) {
        throw new Error(`Domínio ${normalizedDomain} já está configurado para esta conta`);
      }

      // 3. Verificar se domínio é interno (UltraZend)
      if (this.isUltraZendDomain(normalizedDomain)) {
        throw new Error('Domínios UltraZend são gerenciados automaticamente e não podem ser configurados manualmente');
      }

      // 4. Gerar token de verificação
      const verificationToken = generateVerificationToken();
      
      logger.debug('Generated verification token', { 
        userId, 
        domain: normalizedDomain,
        tokenLength: verificationToken.length 
      });

      // 5. Criar registro do domínio
      const domainData = {
        user_id: userId,
        domain_name: normalizedDomain,
        verification_token: verificationToken,
        verification_method: 'dns',
        is_verified: false,
        dkim_enabled: true,
        dkim_selector: 'default',
        spf_enabled: true,
        dmarc_enabled: true,
        dmarc_policy: 'quarantine',
        created_at: new Date(),
        updated_at: new Date()
      };

      const [domainId] = await db('domains').insert(domainData);
      const domainRecord = await db('domains').where('id', domainId).first() as DomainRecord;

      logger.info('Domain record created', { 
        userId, 
        domain: normalizedDomain, 
        domainId 
      });

      // 6. Gerar chaves DKIM para o domínio
      const dkimKeys = await this.generateDKIMKeysForDomain(domainId, normalizedDomain);
      
      // 7. Criar instruções DNS detalhadas
      const dnsInstructions = this.createDNSInstructions(
        normalizedDomain,
        dkimKeys.publicKey
      );

      // 8. Gerar guia de configuração
      const setupGuide = this.generateSetupGuide(normalizedDomain);

      const result: DomainSetupResult = {
        domain: domainRecord,
        dnsInstructions,
        verificationToken,
        setupGuide
      };

      logger.info('Domain setup initiated successfully', {
        userId,
        domain: normalizedDomain,
        domainId,
        dkimGenerated: !!dkimKeys.publicKey
      });

      return result;
    } catch (error) {
      logger.error('Failed to initiate domain setup', {
        userId,
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Verifica a configuração DNS de um domínio
   * 
   * @param userId - ID do usuário
   * @param domainId - ID do domínio no banco
   * @returns Resultado da verificação
   */
  async verifyDomainSetup(userId: number, domainId: string | number): Promise<VerificationResult> {
    try {
      logger.info('Starting domain verification', { userId, domainId });

      // Buscar domínio
      const domain = await db('domains')
        .where('id', domainId)
        .where('user_id', userId)
        .first() as DomainRecord | undefined;

      if (!domain) {
        throw new Error('Domínio não encontrado ou acesso negado');
      }

      logger.debug('Found domain for verification', {
        userId,
        domainId,
        domainName: domain.domain_name,
        isVerified: domain.is_verified
      });

      // Executar verificações DNS essenciais em paralelo (SPF+DKIM+DMARC)
      const [spfResult, dkimResult, dmarcResult] = await Promise.allSettled([
        this.verifySpfRecord(domain.domain_name),
        this.verifyDkimRecord(domain.domain_name, domain.dkim_selector),
        this.verifyDmarcRecord(domain.domain_name)
      ]);

      // Processar resultados (apenas registros essenciais)
      const results = {
        spf: this.processVerificationResult(spfResult, 'SPF'),
        dkim: this.processVerificationResult(dkimResult, 'DKIM'),
        dmarc: this.processVerificationResult(dmarcResult, 'DMARC')
      };

      // Domínio aprovado quando SPF+DKIM+DMARC estão válidos
      const all_passed = results.spf.valid && results.dkim.valid && results.dmarc.valid;

      logger.info('DNS verification completed', {
        userId,
        domainId,
        domain: domain.domain_name,
        allPassed: all_passed,
        results: {
          spf: results.spf.valid,
          dkim: results.dkim.valid,
          dmarc: results.dmarc.valid
        }
      });

      // Atualizar status do domínio se todas as verificações passaram
      if (all_passed && !domain.is_verified) {
        await db('domains')
          .where('id', domainId)
          .update({
            is_verified: true,
            verified_at: new Date(),
            updated_at: new Date()
          });

        logger.info('Domain marked as verified', {
          userId,
          domainId,
          domain: domain.domain_name
        });
      }

      const verificationResult_final: VerificationResult = {
        success: all_passed,
        domain: domain.domain_name,
        all_passed,
        results,
        verified_at: new Date(),
        nextSteps: all_passed ? [] : this.generateNextSteps(results)
      };

      return verificationResult_final;
    } catch (error) {
      logger.error('Domain verification failed', {
        userId,
        domainId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Obtém o status de todos os domínios de um usuário
   * 
   * @param userId - ID do usuário
   * @returns Lista de domínios com status detalhado
   */
  async getUserDomainsStatus(userId: number): Promise<DomainStatus[]> {
    try {
      logger.debug('Getting domains status for user', { userId });

      const domains = await db('domains')
        .select('*')
        .where('user_id', userId)
        .orderBy('created_at', 'desc') as DomainRecord[];

      const domainsWithStatus = await Promise.all(
        domains.map(async (domain) => {
          try {
            // Verificar status DKIM
            const dkimStatus = await this.checkDKIMStatus(domain.domain_name, domain.dkim_selector);
            
            // Verificar status SPF
            const spfStatus = await this.checkSPFStatus(domain.domain_name);
            
            // Verificar status DMARC
            const dmarcStatus = await this.checkDMARCStatus(domain.domain_name);

            // Calcular status geral
            const overallStatus = this.calculateOverallStatus(domain, dkimStatus, spfStatus, dmarcStatus);
            const completionPercentage = this.calculateCompletionPercentage(domain, dkimStatus, spfStatus, dmarcStatus);

            return {
              domain,
              dkim_status: dkimStatus,
              spf_status: spfStatus,
              dmarc_status: dmarcStatus,
              overall_status: overallStatus,
              completion_percentage: completionPercentage
            } as DomainStatus;
          } catch (error) {
            logger.error('Error checking domain status', {
              domainId: domain.id,
              domainName: domain.domain_name,
              error: error instanceof Error ? error.message : String(error)
            });

            // Retornar status de erro
            return {
              domain,
              dkim_status: { configured: false, dns_valid: false },
              spf_status: { configured: false, dns_valid: false },
              dmarc_status: { configured: false, dns_valid: false },
              overall_status: 'failed' as const,
              completion_percentage: 0
            } as DomainStatus;
          }
        })
      );

      logger.debug('Retrieved domains status', {
        userId,
        domainCount: domains.length
      });

      return domainsWithStatus;
    } catch (error) {
      logger.error('Failed to get user domains status', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Remove um domínio PERMANENTEMENTE do banco de dados
   * 
   * @param userId - ID do usuário
   * @param domainId - ID do domínio
   * @returns true se removido com sucesso
   */
  async removeDomain(userId: number, domainId: string | number): Promise<boolean> {
    try {
      logger.info('Removing domain', { userId, domainId });

      // Verificar se domínio pertence ao usuário
      const domain = await db('domains')
        .where('id', domainId)
        .where('user_id', userId)
        .first();

      if (!domain) {
        logger.warn('Domain not found or access denied', { userId, domainId });
        return false;
      }

      // REMOÇÃO REAL do domínio e dados relacionados
      await db.transaction(async (trx) => {
        // Remover chaves DKIM associadas
        await trx('dkim_keys')
          .where('domain_id', domainId)
          .del();

        // Remover registros de verificação DNS se existirem
        await trx('dns_verification_records')
          .where('domain_id', domainId)
          .del();

        // Remover qualquer histórico de verificação
        await trx('domain_verification_history')
          .where('domain_id', domainId)
          .del();

        // Finalmente, remover o domínio
        await trx('domains')
          .where('id', domainId)
          .del();
      });

      logger.info('Domain removed successfully', {
        userId,
        domainId,
        domainName: domain.domain_name
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove domain', {
        userId,
        domainId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Gera chaves DKIM para um domínio
   * 
   * @param domainId - ID do domínio
   * @param domain - Nome do domínio
   * @returns Chaves DKIM geradas
   */
  private async generateDKIMKeysForDomain(domainId: number, domain: string): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    try {
      logger.debug('Generating DKIM keys for domain', { domainId, domain });

      // Usar MultiDomainDKIMManager para gerar chaves
      const regenerated = await this.dkimManager.regenerateDKIMKeysForDomain(domain);
      
      if (!regenerated) {
        throw new Error('Falha ao gerar chaves DKIM');
      }

      // Buscar chaves geradas
      const dkimRecord = await db('dkim_keys')
        .where('domain_id', domainId)
        .first();

      if (!dkimRecord) {
        throw new Error('Chaves DKIM não foram salvas corretamente');
      }

      logger.info('DKIM keys generated successfully', { 
        domainId, 
        domain,
        hasPrivateKey: !!dkimRecord.private_key,
        hasPublicKey: !!dkimRecord.public_key
      });

      return {
        privateKey: dkimRecord.private_key,
        publicKey: dkimRecord.public_key
      };
    } catch (error) {
      logger.error('Failed to generate DKIM keys', {
        domainId,
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Cria instruções DNS detalhadas para um domínio
   * 
   * @param domain - Nome do domínio
   * @param verificationToken - Token de verificação
   * @param dkimPublicKey - Chave pública DKIM
   * @returns Instruções DNS estruturadas
   */
  private createDNSInstructions(domain: string, dkimPublicKey: string): DNSInstructions {
    return {
      spf: {
        record: `${domain}`,
        value: `v=spf1 include:${this.ULTRAZEND_SPF_INCLUDE} ~all`,
        priority: 1,
        description: 'SPF record authorizes UltraZend to send emails on behalf of your domain'
      },
      dkim: {
        record: `default._domainkey.${domain}`,
        value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
        priority: 2,
        description: 'DKIM record provides cryptographic authentication for emails from your domain'
      },
      dmarc: {
        record: `_dmarc.${domain}`,
        value: `v=DMARC1; p=quarantine; rua=mailto:${this.DMARC_REPORT_EMAIL}`,
        priority: 3,
        description: 'DMARC policy instructs receivers how to handle emails that fail SPF/DKIM checks'
      },
    };
  }

  /**
   * Gera guia passo a passo para configuração
   * 
   * @param domain - Nome do domínio
   * @returns Array de instruções
   */
  private generateSetupGuide(domain: string): string[] {
    return [
      '1. Access your domain registrar or DNS hosting provider (GoDaddy, Cloudflare, etc.)',
      '2. Navigate to DNS management or DNS records section',
      '3. Add the SPF TXT record to authorize email sending',
      '4. Add the DKIM TXT record for email authentication', 
      '5. Add the DMARC TXT record for email policy',
      '6. Wait 5-15 minutes for DNS propagation',
      '7. Click "Verify DNS Records" to complete setup',
      '8. Once verified, your domain is ready to send authenticated emails!'
    ];
  }

  /**
   * Verifica registro SPF de um domínio
   * 
   * @param domain - Nome do domínio
   * @returns Resultado da verificação SPF
   */
  private async verifySpfRecord(domain: string): Promise<DNSVerificationResult> {
    const expectedValue = `v=spf1 include:${this.ULTRAZEND_SPF_INCLUDE} ~all`;
    
    try {
      logger.debug('Verifying SPF record', { domain, expectedValue });

      const txtRecords = await this.resolveTxtWithRetry(domain);
      const spfRecord = txtRecords.find(record => 
        record.toLowerCase().startsWith('v=spf1')
      );

      if (!spfRecord) {
        return {
          valid: false,
          expectedValue,
          error: 'No SPF record found'
        };
      }

      // Verificar se inclui UltraZend
      const includesUltraZend = spfRecord.toLowerCase().includes(this.ULTRAZEND_SPF_INCLUDE.toLowerCase());
      
      return {
        valid: includesUltraZend,
        expectedValue,
        actualValue: spfRecord,
        error: includesUltraZend ? undefined : 'SPF record does not include UltraZend servers'
      };
    } catch (error) {
      logger.debug('SPF verification failed', { 
        domain, 
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        expectedValue,
        error: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Verifica registro DKIM de um domínio
   * 
   * @param domain - Nome do domínio
   * @param selector - Seletor DKIM
   * @returns Resultado da verificação DKIM
   */
  private async verifyDkimRecord(domain: string, selector: string): Promise<DNSVerificationResult> {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    
    try {
      logger.debug('Verifying DKIM record', { domain, selector, dkimDomain });

      const txtRecords = await this.resolveTxtWithRetry(dkimDomain);
      const dkimRecord = txtRecords.find(record => 
        record.toLowerCase().startsWith('v=dkim1')
      );

      if (!dkimRecord) {
        return {
          valid: false,
          expectedValue: 'v=DKIM1; k=rsa; p=<public_key>',
          error: 'No DKIM record found'
        };
      }

      // Verificar se tem chave pública
      const hasPublicKey = dkimRecord.toLowerCase().includes('p=') && 
                          !dkimRecord.toLowerCase().includes('p=;');
      
      return {
        valid: hasPublicKey,
        expectedValue: 'v=DKIM1; k=rsa; p=<public_key>',
        actualValue: dkimRecord,
        error: hasPublicKey ? undefined : 'DKIM record is missing public key'
      };
    } catch (error) {
      logger.debug('DKIM verification failed', { 
        domain, 
        selector,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        expectedValue: 'v=DKIM1; k=rsa; p=<public_key>',
        error: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Verifica registro DMARC de um domínio
   * 
   * @param domain - Nome do domínio
   * @returns Resultado da verificação DMARC
   */
  private async verifyDmarcRecord(domain: string): Promise<DNSVerificationResult> {
    const dmarcDomain = `_dmarc.${domain}`;
    const expectedValue = `v=DMARC1; p=quarantine; rua=mailto:${this.DMARC_REPORT_EMAIL}`;
    
    try {
      logger.debug('Verifying DMARC record', { domain, dmarcDomain });

      const txtRecords = await this.resolveTxtWithRetry(dmarcDomain);
      const dmarcRecord = txtRecords.find(record => 
        record.toLowerCase().startsWith('v=dmarc1')
      );

      if (!dmarcRecord) {
        return {
          valid: false,
          expectedValue,
          error: 'No DMARC record found'
        };
      }

      // DMARC básico é válido se tem v=DMARC1 e alguma política
      const hasPolicy = dmarcRecord.toLowerCase().includes('p=');
      
      return {
        valid: hasPolicy,
        expectedValue,
        actualValue: dmarcRecord,
        error: hasPolicy ? undefined : 'DMARC record is missing policy'
      };
    } catch (error) {
      logger.debug('DMARC verification failed', { 
        domain,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        expectedValue,
        error: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Verifica token de propriedade do domínio
   * 
   * @param domain - Nome do domínio
   * @param expectedToken - Token esperado
   * @returns Resultado da verificação
   */
  private async verifyDomainOwnership(domain: string, expectedToken: string): Promise<DNSVerificationResult> {
    const verificationDomain = `ultrazend-verification.${domain}`;
    
    try {
      logger.debug('Verifying domain ownership', { domain, verificationDomain });

      const txtRecords = await this.resolveTxtWithRetry(verificationDomain);
      const verificationRecord = txtRecords.find(record => 
        record.trim() === expectedToken
      );

      return {
        valid: !!verificationRecord,
        expectedValue: expectedToken,
        actualValue: verificationRecord,
        error: verificationRecord ? undefined : 'Verification token not found in DNS'
      };
    } catch (error) {
      logger.debug('Domain ownership verification failed', { 
        domain,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        expectedValue: expectedToken,
        error: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Resolve registros TXT com retry automático
   * 
   * @param domain - Domínio a resolver
   * @returns Array de registros TXT
   */
  private async resolveTxtWithRetry(domain: string): Promise<string[]> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.MAX_DNS_RETRIES; attempt++) {
      try {
        logger.debug(`DNS resolution attempt ${attempt}/${this.MAX_DNS_RETRIES}`, { domain });
        
        const records = await Promise.race([
          resolveTxt(domain),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('DNS timeout')), this.DNS_TIMEOUT)
          )
        ]);

        // Flatmap para juntar arrays de strings em um único array
        return records.flat();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.debug(`DNS resolution attempt ${attempt} failed`, { 
          domain, 
          error: lastError.message 
        });
        
        if (attempt < this.MAX_DNS_RETRIES) {
          // Aguardar antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError || new Error('Resolução DNS falhou após tentativas');
  }

  /**
   * Processa resultado de Promise.allSettled
   * 
   * @param result - Resultado da promise
   * @param operation - Nome da operação
   * @returns Resultado processado
   */
  private processVerificationResult(
    result: PromiseSettledResult<DNSVerificationResult>,
    operation: string
  ): DNSVerificationResult {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    
    logger.debug(`${operation} verification rejected`, { reason: result.reason });
    
    return {
      valid: false,
      expectedValue: 'N/A',
      error: `${operation} verification failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
    };
  }

  /**
   * Gera próximos passos baseado nos resultados da verificação
   * 
   * @param results - Resultados das verificações
   * @returns Array de próximos passos
   */
  private generateNextSteps(results: VerificationResult['results']): string[] {
    const steps: string[] = [];

    if (!results.spf.valid) {
      steps.push('Configure SPF record to authorize UltraZend servers');
    }

    if (!results.dkim.valid) {
      steps.push('Add DKIM record for email authentication');
    }

    if (!results.dmarc.valid) {
      steps.push('Configure DMARC policy for email security');
    }

    if (steps.length === 0) {
      steps.push('All DNS records verified successfully!');
    } else {
      steps.push('Wait 5-15 minutes after making DNS changes before retrying verification');
    }

    return steps;
  }

  /**
   * Verifica se um domínio já está configurado para o usuário
   * 
   * @param userId - ID do usuário
   * @param domain - Nome do domínio
   * @returns Domínio existente ou null
   */
  private async checkExistingDomain(userId: number, domain: string): Promise<DomainRecord | null> {
    const existing = await db('domains')
      .where('user_id', userId)
      .where('domain_name', domain)
      .first() as DomainRecord | undefined;

    return existing || null;
  }

  /**
   * Verifica se formato do domínio é válido
   * 
   * @param domain - Domínio a verificar
   * @returns true se válido
   */
  private isValidDomainFormat(domain: string): boolean {
    return DomainValidator.isValidDomainFormat(domain);
  }

  /**
   * Verifica se é domínio interno UltraZend
   * 
   * @param domain - Domínio a verificar
   * @returns true se for interno
   */
  private isUltraZendDomain(domain: string): boolean {
    const ultraZendDomains = [
      'ultrazend.com.br',
      'mail.ultrazend.com.br',
      'www.ultrazend.com.br'
    ];
    
    return ultraZendDomains.includes(domain.toLowerCase());
  }

  /**
   * Verifica status DKIM atual de um domínio
   * 
   * @param domain - Nome do domínio
   * @param selector - Seletor DKIM
   * @returns Status DKIM
   */
  private async checkDKIMStatus(domain: string, selector: string) {
    try {
      const dkimResult = await this.verifyDkimRecord(domain, selector);
      
      return {
        configured: true,
        public_key: dkimResult.actualValue,
        dns_valid: dkimResult.valid
      };
    } catch (error) {
      return {
        configured: false,
        dns_valid: false
      };
    }
  }

  /**
   * Verifica status SPF atual de um domínio
   * 
   * @param domain - Nome do domínio
   * @returns Status SPF
   */
  private async checkSPFStatus(domain: string) {
    try {
      const spfResult = await this.verifySpfRecord(domain);
      
      return {
        configured: true,
        dns_valid: spfResult.valid
      };
    } catch (error) {
      return {
        configured: false,
        dns_valid: false
      };
    }
  }

  /**
   * Verifica status DMARC atual de um domínio
   * 
   * @param domain - Nome do domínio
   * @returns Status DMARC
   */
  private async checkDMARCStatus(domain: string) {
    try {
      const dmarcResult = await this.verifyDmarcRecord(domain);
      
      return {
        configured: true,
        dns_valid: dmarcResult.valid
      };
    } catch (error) {
      return {
        configured: false,
        dns_valid: false
      };
    }
  }

  /**
   * Calcula status geral de um domínio
   * 
   * @param domain - Registro do domínio
   * @param dkimStatus - Status DKIM
   * @param spfStatus - Status SPF
   * @param dmarcStatus - Status DMARC
   * @returns Status geral
   */
  private calculateOverallStatus(
    domain: DomainRecord,
    dkimStatus: any,
    spfStatus: any,
    dmarcStatus: any
  ): 'pending' | 'partial' | 'verified' | 'failed' {
    if (domain.is_verified) {
      return 'verified';
    }

    const validChecks = [
      dkimStatus.dns_valid,
      spfStatus.dns_valid,
      dmarcStatus.dns_valid
    ].filter(Boolean).length;

    if (validChecks === 0) {
      return 'pending';
    } else if (validChecks < 3) {
      return 'partial';
    } else {
      return 'verified';
    }
  }

  /**
   * Calcula porcentagem de completude de um domínio
   * 
   * @param domain - Registro do domínio
   * @param dkimStatus - Status DKIM
   * @param spfStatus - Status SPF
   * @param dmarcStatus - Status DMARC
   * @returns Porcentagem de 0 a 100
   */
  private calculateCompletionPercentage(
    domain: DomainRecord,
    dkimStatus: any,
    spfStatus: any,
    dmarcStatus: any
  ): number {
    const totalChecks = 4; // verification + dkim + spf + dmarc
    let completedChecks = 0;

    if (domain.is_verified) completedChecks++;
    if (dkimStatus.dns_valid) completedChecks++;
    if (spfStatus.dns_valid) completedChecks++;
    if (dmarcStatus.dns_valid) completedChecks++;

    return Math.round((completedChecks / totalChecks) * 100);
  }
}