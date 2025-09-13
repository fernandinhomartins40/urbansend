import { logger } from '../config/logger';
import db from '../config/database';
import { generateVerificationToken } from '../utils/crypto';
import { MultiDomainDKIMManager } from './MultiDomainDKIMManager';
import { DomainValidator } from './DomainValidator';
import { SimpleEmailValidator } from '../email/EmailValidator';
import dns from 'dns';
import { promisify } from 'util';

// Promisificar métodos DNS para uso com async/await
const resolveTxt = promisify(dns.resolveTxt);
const resolveA = promisify(dns.resolve4);
const resolveMx = promisify(dns.resolveMx);

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
  // Registros A para subdomínios de email (CRÍTICOS para funcionamento híbrido)
  a_records: {
    smtp: { record: string; value: string; priority: number; description: string; };
    mail: { record: string; value: string; priority: number; description: string; };
  };

  // Registro MX (obrigatório para direcionamento de email)
  mx: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };

  // Registros TXT para autenticação (já existentes)
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
  dns_instructions: DNSInstructions;
  verification_token: string;
  setup_guide: string[];
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
    smtp_a: DNSVerificationResult;
    mail_a: DNSVerificationResult;
    mx: DNSVerificationResult;
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

      // 5. CRIAR DOMÍNIO PRIMEIRO, depois DKIM
      let domainRecord: DomainRecord;
      let domainId: number;
      
      await db.transaction(async (trx) => {
        try {
          // Criar registro do domínio PRIMEIRO
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

          const [insertedId] = await trx('domains').insert(domainData);
          domainId = insertedId;
          domainRecord = await trx('domains').where('id', domainId).first() as DomainRecord;

          logger.info('✅ Domain record created successfully', { 
            userId, 
            domain: normalizedDomain, 
            domainId 
          });

        } catch (transactionError) {
          logger.error('❌ CRITICAL: Domain creation transaction failed', {
            userId,
            domain: normalizedDomain,
            error: transactionError instanceof Error ? transactionError.message : String(transactionError)
          });
          
          // Transação será automaticamente revertida
          throw new Error(`Falha crítica na criação do domínio: ${transactionError instanceof Error ? transactionError.message : 'Erro desconhecido'}`);
        }
      });
      
      // 6. AGORA GERAR DKIM para o domínio que já existe
      logger.info('Generating DKIM keys for domain after creation', { 
        domain: normalizedDomain, 
        domainId 
      });
      
      const dkimGenerated = await this.dkimManager.regenerateDKIMKeysForDomain(normalizedDomain);
      if (!dkimGenerated) {
        throw new Error(`Falha ao gerar chaves DKIM para ${normalizedDomain}`);
      }

      // 7. BUSCAR CHAVES DKIM GERADAS
      const dkimRecord = await db('dkim_keys')
        .select('private_key', 'public_key')
        .where('domain_id', domainId)
        .first();

      if (!dkimRecord || !dkimRecord.private_key || !dkimRecord.public_key) {
        throw new Error(`Chaves DKIM não encontradas após geração para ${normalizedDomain}`);
      }

      const dkimKeys = {
        privateKey: dkimRecord.private_key,
        publicKey: dkimRecord.public_key
      };

      logger.info('✅ DKIM keys generated successfully', {
        domain: normalizedDomain,
        domainId,
        publicKeyLength: dkimKeys.publicKey.length
      });
      
      // 8. Criar instruções DNS detalhadas
      const dnsInstructions = this.createDNSInstructions(
        normalizedDomain,
        dkimKeys.publicKey
      );

      // 9. Gerar guia de configuração
      const setupGuide = this.generateSetupGuide(normalizedDomain);

      const result: DomainSetupResult = {
        domain: domainRecord,
        dns_instructions: dnsInstructions,
        verification_token: verificationToken,
        setup_guide: setupGuide
      };

      logger.info('Domain setup initiated successfully', {
        userId,
        domain: normalizedDomain,
        domainId: domainRecord.id,
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

      // Executar verificações DNS COMPLETAS em paralelo (A+MX+SPF+DKIM+DMARC)
      const [smtpAResult, mailAResult, mxResult, spfResult, dkimResult, dmarcResult] = await Promise.allSettled([
        this.verifyARecord(`smtp.${domain.domain_name}`, '31.97.162.155'),
        this.verifyARecord(`mail.${domain.domain_name}`, '31.97.162.155'),
        this.verifyMxRecord(domain.domain_name),
        this.verifySpfRecord(domain.domain_name),
        this.verifyDkimRecord(domain.domain_name, domain.dkim_selector),
        this.verifyDmarcRecord(domain.domain_name)
      ]);

      // Processar resultados (TODOS os registros necessários)
      const results = {
        smtp_a: this.processVerificationResult(smtpAResult, 'SMTP-A'),
        mail_a: this.processVerificationResult(mailAResult, 'MAIL-A'),
        mx: this.processVerificationResult(mxResult, 'MX'),
        spf: this.processVerificationResult(spfResult, 'SPF'),
        dkim: this.processVerificationResult(dkimResult, 'DKIM'),
        dmarc: this.processVerificationResult(dmarcResult, 'DMARC')
      };

      // Domínio aprovado quando TODOS os registros estão válidos (A+MX+SPF+DKIM+DMARC)
      const all_passed = results.smtp_a.valid && results.mail_a.valid && results.mx.valid &&
                        results.spf.valid && results.dkim.valid && results.dmarc.valid;

      logger.info('DNS verification completed', {
        userId,
        domainId,
        domain: domain.domain_name,
        allPassed: all_passed,
        results: {
          smtp_a: results.smtp_a.valid,
          mail_a: results.mail_a.valid,
          mx: results.mx.valid,
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
   * Garante que o domínio principal esteja verificado
   * CORREÇÃO CRÍTICA: Validação obrigatória do domínio principal
   * 
   * @returns Promise<boolean> - true se verificado, false caso contrário
   */
  async ensureMainDomainVerification(): Promise<boolean> {
    try {
      const mainDomain = 'ultrazend.com.br';
      logger.info('🔧 CORREÇÃO CRÍTICA: Verificando domínio principal obrigatoriamente', {
        domain: mainDomain
      });

      // Buscar usuário sistema ou admin para o domínio principal
      const systemUser = await db('users')
        .where('email', 'like', '%ultrazend.com.br')
        .orWhere('is_admin', true)
        .first();

      if (!systemUser) {
        logger.error('❌ CRÍTICO: Usuário sistema não encontrado para domínio principal');
        return false;
      }

      // Buscar domínio principal
      const mainDomainRecord = await db('domains')
        .where('domain_name', mainDomain)
        .where('user_id', systemUser.id)
        .first();

      if (!mainDomainRecord) {
        logger.error('❌ CRÍTICO: Registro do domínio principal não encontrado');
        return false;
      }

      // Se já está verificado, validar se DNS ainda funciona
      if (mainDomainRecord.is_verified) {
        logger.info('🔍 Revalidando domínio principal já verificado');
        const revalidation = await this.verifyDomainSetup(systemUser.id, mainDomainRecord.id);
        return revalidation.all_passed;
      }

      // Se não verificado, fazer verificação completa
      logger.info('⚡ Verificando domínio principal pela primeira vez');
      const verification = await this.verifyDomainSetup(systemUser.id, mainDomainRecord.id);

      if (!verification.all_passed) {
        logger.error('❌ CRÍTICO: Domínio principal falhou na verificação DNS', {
          domain: mainDomain,
          results: verification.results
        });
        return false;
      }

      logger.info('✅ SUCESSO: Domínio principal verificado com sucesso');
      return true;

    } catch (error) {
      logger.error('❌ ERRO CRÍTICO: Falha na verificação do domínio principal', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
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
   * Gera chaves DKIM para um domínio dentro de uma transação de banco
   * Versão profissional que trabalha com transações atômicas
   * 
   * @param trx - Transação do Knex
   * @param domainId - ID do domínio
   * @param domain - Nome do domínio
   * @returns Chaves DKIM geradas
   */
  private async generateDKIMKeysForDomainTransaction(
    trx: any, 
    domainId: number, 
    domain: string
  ): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    try {
      logger.debug('Generating DKIM keys for domain in transaction', { domainId, domain });

      // CRÍTICO: Verificar se já existem chaves para evitar duplicatas
      const existingDkimKey = await trx('dkim_keys').where('domain_id', domainId).first();
      if (existingDkimKey) {
        logger.warn('DKIM keys already exist for domain, removing old keys first', { 
          domainId, 
          domain 
        });
        await trx('dkim_keys').where('domain_id', domainId).del();
      }

      // Usar MultiDomainDKIMManager para gerar chaves
      const regenerated = await this.dkimManager.regenerateDKIMKeysForDomain(domain);
      
      if (!regenerated) {
        throw new Error(`MultiDomainDKIMManager falhou ao gerar chaves para ${domain}`);
      }

      // VALIDAÇÃO: Buscar chaves geradas na transação
      const dkimRecord = await trx('dkim_keys').where('domain_id', domainId).first();

      if (!dkimRecord) {
        // Tentar buscar por nome do domínio como fallback
        const dkimByDomain = await trx('dkim_keys')
          .join('domains', 'dkim_keys.domain_id', 'domains.id')
          .where('domains.domain_name', domain)
          .select('dkim_keys.*')
          .first();

        if (dkimByDomain) {
          logger.info('DKIM found by domain name, updating domain_id', {
            domainId,
            domain,
            foundDkimId: dkimByDomain.id
          });
          
          // Atualizar domain_id correto
          await trx('dkim_keys').where('id', dkimByDomain.id).update({ domain_id: domainId });
          
          return {
            privateKey: dkimByDomain.private_key,
            publicKey: dkimByDomain.public_key
          };
        }
        
        throw new Error(`Chaves DKIM não foram salvas na transação para domínio ${domain}`);
      }

      // VALIDAÇÃO CRÍTICA: Verificar se as chaves são válidas
      if (!dkimRecord.private_key || !dkimRecord.public_key) {
        throw new Error(`Chaves DKIM inválidas geradas para domínio ${domain}`);
      }

      if (dkimRecord.private_key.length < 100 || dkimRecord.public_key.length < 100) {
        throw new Error(`Chaves DKIM muito curtas para domínio ${domain} - possível corrupção`);
      }

      logger.info('✅ DKIM keys generated successfully in transaction', { 
        domainId, 
        domain,
        privateKeyLength: dkimRecord.private_key.length,
        publicKeyLength: dkimRecord.public_key.length,
        hasPrivateKey: !!dkimRecord.private_key,
        hasPublicKey: !!dkimRecord.public_key
      });

      return {
        privateKey: dkimRecord.private_key,
        publicKey: dkimRecord.public_key
      };

    } catch (error) {
      logger.error('❌ CRITICAL: Failed to generate DKIM keys in transaction', {
        domainId,
        domain,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw para fazer rollback da transação
      throw new Error(`Falha crítica na geração de DKIM: ${error instanceof Error ? error.message : String(error)}`);
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
    const ULTRAZEND_IP = '31.97.162.155';
    const ULTRAZEND_MX = 'mail.ultrazend.com.br';

    return {
      // ✅ REGISTROS A - Subdomínios de email (CRÍTICOS para configuração híbrida)
      a_records: {
        smtp: {
          record: `smtp.${domain}`,
          value: ULTRAZEND_IP,
          priority: 1,
          description: 'Registro A que aponta o subdomínio smtp do seu domínio para o servidor UltraZend (OBRIGATÓRIO para envio)'
        },
        mail: {
          record: `mail.${domain}`,
          value: ULTRAZEND_IP,
          priority: 1,
          description: 'Registro A que aponta o subdomínio mail do seu domínio para o servidor UltraZend (OBRIGATÓRIO para recebimento)'
        }
      },

      // ✅ REGISTRO MX - Direcionamento de email
      mx: {
        record: `${domain}`,
        value: `${ULTRAZEND_MX}`,
        priority: 10,
        description: 'Registro MX que direciona emails do seu domínio para o servidor UltraZend (OBRIGATÓRIO)'
      },

      // ✅ REGISTROS TXT - Autenticação (atualizados)
      spf: {
        record: `${domain}`,
        value: `v=spf1 a mx ip4:${ULTRAZEND_IP} include:${this.ULTRAZEND_SPF_INCLUDE} ~all`,
        priority: 2,
        description: 'Registro SPF completo que autoriza servidores UltraZend (IP + subdomínios A/MX + include)'
      },

      dkim: {
        record: `default._domainkey.${domain}`,
        value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
        priority: 3,
        description: 'Chave DKIM para autenticação criptográfica de emails'
      },

      dmarc: {
        record: `_dmarc.${domain}`,
        value: `v=DMARC1; p=quarantine; rua=mailto:${this.DMARC_REPORT_EMAIL}`,
        priority: 4,
        description: 'Política DMARC para tratamento de emails não autenticados'
      }
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
      '🌐 CONFIGURAÇÃO HÍBRIDA - Mantenha seu site funcionando!',
      '',
      '1. Acesse seu provedor DNS (GoDaddy, Cloudflare, etc.)',
      '2. Navegue até a seção de Gerenciamento DNS',
      '3. ⚠️  IMPORTANTE: NÃO altere registros @ e www do seu site',
      '4. 🎯 ADICIONE APENAS: Registros A para smtp.' + domain + ' e mail.' + domain,
      '5. 📧 ADICIONE: Registro MX @ apontando para mail.ultrazend.com.br',
      '6. 📝 ADICIONE: Registros TXT (SPF, DKIM, DMARC) conforme listados',
      '7. ⏰ Aguarde 5-30 minutos para propagação DNS',
      '8. ✅ Execute a verificação DNS para completar',
      '9. 🎉 Resultado: Site continua funcionando + Emails via UltraZend!'
    ];
  }

  /**
   * Verifica registro A de um subdomínio
   *
   * @param subdomain - Subdomínio completo (ex: smtp.exemplo.com)
   * @param expectedIp - IP esperado
   * @returns Resultado da verificação A
   */
  private async verifyARecord(subdomain: string, expectedIp: string): Promise<DNSVerificationResult> {
    try {
      logger.debug('Verifying A record', { subdomain, expectedIp });

      const aRecords = await this.resolveAWithRetry(subdomain);
      const hasExpectedIp = aRecords.includes(expectedIp);

      return {
        valid: hasExpectedIp,
        expectedValue: expectedIp,
        actualValue: aRecords.join(', '),
        error: hasExpectedIp ? undefined : `Registro A não encontrado ou IP incorreto para ${subdomain}`
      };
    } catch (error) {
      logger.debug('A record verification failed', {
        subdomain,
        expectedIp,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        expectedValue: expectedIp,
        error: `Resolução DNS falhou: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Verifica registro MX de um domínio
   *
   * @param domain - Nome do domínio
   * @returns Resultado da verificação MX
   */
  private async verifyMxRecord(domain: string): Promise<DNSVerificationResult> {
    const expectedMx = 'mail.ultrazend.com.br';

    try {
      logger.debug('Verifying MX record', { domain, expectedMx });

      const mxRecords = await this.resolveMxWithRetry(domain);
      const hasExpectedMx = mxRecords.some(mx =>
        mx.exchange.toLowerCase() === expectedMx.toLowerCase()
      );

      return {
        valid: hasExpectedMx,
        expectedValue: expectedMx,
        actualValue: mxRecords.map(mx => `${mx.exchange} (${mx.priority})`).join(', '),
        error: hasExpectedMx ? undefined : `Registro MX não aponta para ${expectedMx}`
      };
    } catch (error) {
      logger.debug('MX record verification failed', {
        domain,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        expectedValue: expectedMx,
        error: `Resolução DNS falhou: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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
   * Resolve registros A com retry automático
   *
   * @param domain - Domínio a resolver
   * @returns Array de IPs
   */
  private async resolveAWithRetry(domain: string): Promise<string[]> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.MAX_DNS_RETRIES; attempt++) {
      try {
        logger.debug(`DNS A resolution attempt ${attempt}/${this.MAX_DNS_RETRIES}`, { domain });

        const records = await Promise.race([
          resolveA(domain),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DNS timeout')), this.DNS_TIMEOUT)
          )
        ]);

        return records;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.debug(`DNS A resolution attempt ${attempt} failed`, {
          domain,
          error: lastError.message
        });

        if (attempt < this.MAX_DNS_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Resolução DNS A falhou após tentativas');
  }

  /**
   * Resolve registros MX com retry automático
   *
   * @param domain - Domínio a resolver
   * @returns Array de registros MX
   */
  private async resolveMxWithRetry(domain: string): Promise<{exchange: string, priority: number}[]> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.MAX_DNS_RETRIES; attempt++) {
      try {
        logger.debug(`DNS MX resolution attempt ${attempt}/${this.MAX_DNS_RETRIES}`, { domain });

        const records = await Promise.race([
          resolveMx(domain),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DNS timeout')), this.DNS_TIMEOUT)
          )
        ]);

        return records;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.debug(`DNS MX resolution attempt ${attempt} failed`, {
          domain,
          error: lastError.message
        });

        if (attempt < this.MAX_DNS_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Resolução DNS MX falhou após tentativas');
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

    if (!results.smtp_a.valid) {
      steps.push('🎯 ADICIONAR URGENTE: Registro A smtp.seudominio.com apontando para 31.97.162.155');
    }

    if (!results.mail_a.valid) {
      steps.push('🎯 ADICIONAR URGENTE: Registro A mail.seudominio.com apontando para 31.97.162.155');
    }

    if (!results.mx.valid) {
      steps.push('📧 ADICIONAR: Registro MX @ apontando para mail.ultrazend.com.br (prioridade 10)');
    }

    if (!results.spf.valid) {
      steps.push('📝 Configurar registro SPF para autorizar servidores UltraZend');
    }

    if (!results.dkim.valid) {
      steps.push('📝 Adicionar registro DKIM para autenticação de email');
    }

    if (!results.dmarc.valid) {
      steps.push('📝 Configurar política DMARC para segurança de email');
    }

    if (steps.length === 0) {
      steps.push('✅ Todos os registros DNS verificados com sucesso! Seu domínio está pronto para enviar emails.');
    } else {
      steps.push('⏰ Aguarde 5-30 minutos após fazer alterações DNS antes de tentar verificar novamente');
      steps.push('🔄 IMPORTANTE: Registros A são OBRIGATÓRIOS para o funcionamento do email!');
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
    return SimpleEmailValidator.isValidDomainFormat(domain);
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

// Export singleton instance
export const domainSetupService = new DomainSetupService();