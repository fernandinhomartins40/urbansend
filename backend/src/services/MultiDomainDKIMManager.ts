import { DKIMManager, DKIMConfig } from './dkimManager';
import { logger } from '../config/logger';
import db from '../config/database';
import crypto from 'crypto';
import { generateVerificationToken } from '../utils/crypto';

export interface MultiDomainDKIMConfig extends DKIMConfig {
  domainId?: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DomainDKIMStatus {
  domain: string;
  hasConfig: boolean;
  isActive: boolean;
  selector: string;
  algorithm: string;
  keySize: number;
  createdAt?: Date;
}

/**
 * Gerenciador DKIM multi-domínio
 * Estende o DKIMManager base para suportar configuração automática de DKIM para múltiplos domínios
 */
export class MultiDomainDKIMManager extends DKIMManager {
  private readonly DEFAULT_SELECTOR = 'default';
  private readonly DEFAULT_ALGORITHM: 'rsa-sha256' = 'rsa-sha256';
  private readonly DEFAULT_CANONICALIZATION: 'relaxed/relaxed' = 'relaxed/relaxed';
  private readonly DEFAULT_KEY_SIZE = 2048;
  private readonly FALLBACK_DOMAIN = 'ultrazend.com.br';

  constructor() {
    super();
    logger.debug('MultiDomainDKIMManager initialized');
  }

  /**
   * Obtém configuração DKIM para um domínio específico
   * Implementa fallback automático e geração de chaves sob demanda
   * 
   * @param domain - Domínio para o qual buscar configuração DKIM
   * @returns Configuração DKIM ou null se não encontrada/erro
   */
  async getDKIMConfigForDomain(domain: string): Promise<DKIMConfig | null> {
    try {
      if (!domain) {
        logger.warn('Empty domain provided to getDKIMConfigForDomain');
        return this.getDefaultDKIMConfig();
      }

      const normalizedDomain = domain.toLowerCase().trim();
      
      logger.debug('Getting DKIM config for domain', { 
        originalDomain: domain,
        normalizedDomain 
      });

      // 1. Tentar buscar configuração específica do domínio
      const domainConfig = await this.loadDomainDKIMConfig(normalizedDomain);
      
      if (domainConfig) {
        logger.debug('Found existing DKIM config for domain', { 
          domain: normalizedDomain,
          selector: domainConfig.selector 
        });
        return domainConfig;
      }

      // 2. Para domínio principal UltraZend, usar configuração padrão
      if (this.isUltraZendDomain(normalizedDomain)) {
        logger.debug('Using default DKIM config for UltraZend domain', { 
          domain: normalizedDomain 
        });
        return await this.getDefaultDKIMConfig();
      }

      // 3. Para outros domínios, tentar gerar configuração automática
      const generatedConfig = await this.generateDKIMConfigForDomain(normalizedDomain);
      
      if (generatedConfig) {
        logger.info('Generated new DKIM config for domain', { 
          domain: normalizedDomain,
          selector: generatedConfig.selector 
        });
        return generatedConfig;
      }

      // 4. Fallback final para configuração padrão
      logger.warn('Falling back to default DKIM config for domain', { 
        domain: normalizedDomain 
      });
      return await this.getDefaultDKIMConfig();

    } catch (error) {
      logger.error('Error getting DKIM config for domain', {
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback seguro em caso de erro
      return await this.getDefaultDKIMConfig();
    }
  }

  /**
   * Carrega configuração DKIM existente do banco para um domínio
   * 
   * @param domain - Domínio a buscar
   * @returns Configuração DKIM ou null se não encontrada
   */
  private async loadDomainDKIMConfig(domain: string): Promise<DKIMConfig | null> {
    try {
      const config = await db('dkim_keys')
        .select('dkim_keys.*', 'domains.domain_name as domain')
        .join('domains', 'domains.id', 'dkim_keys.domain_id')
        .where('domains.domain_name', domain)
        .where('dkim_keys.is_active', true)
        .first();

      if (!config) {
        return null;
      }

      return this.parseDKIMConfigFromDB(config);
    } catch (error) {
      logger.error('Error loading domain DKIM config from database', {
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Gera nova configuração DKIM para um domínio
   * 
   * @param domain - Domínio para gerar configuração
   * @returns Nova configuração DKIM ou null se erro
   */
  private async generateDKIMConfigForDomain(domain: string): Promise<DKIMConfig | null> {
    try {
      // Verificar se o domínio existe na tabela domains e está verificado
      const domainRecord = await db('domains')
        .select('*')
        .where('domain_name', domain)
        .where('is_verified', true)
        .first();

      if (!domainRecord) {
        logger.debug('Domain not found or not verified, cannot generate DKIM', { 
          domain 
        });
        return null;
      }

      // Verificar se já existe configuração DKIM (pode estar inativa)
      const existingKey = await db('dkim_keys')
        .where('domain_id', domainRecord.id)
        .first();

      if (existingKey) {
        logger.debug('DKIM key already exists for domain, activating if needed', {
          domain,
          domainId: domainRecord.id,
          isActive: existingKey.is_active
        });

        // Se existir mas estiver inativo, reativar
        if (!existingKey.is_active) {
          await db('dkim_keys')
            .where('domain_id', domainRecord.id)
            .update({
              is_active: true,
              updated_at: new Date()
            });
        }

        return this.parseDKIMConfigFromDB({ ...existingKey, domain });
      }

      // Gerar novas chaves DKIM
      logger.info('Generating new DKIM keys for domain', { 
        domain,
        domainId: domainRecord.id 
      });

      const dkimKeys = await this.generateDKIMKeyPair(this.DEFAULT_KEY_SIZE);
      
      // Salvar no banco
      await db('dkim_keys').insert({
        domain_id: domainRecord.id,
        selector: this.DEFAULT_SELECTOR,
        private_key: dkimKeys.privateKey,
        public_key: dkimKeys.publicKey,
        algorithm: this.DEFAULT_ALGORITHM,
        canonicalization: this.DEFAULT_CANONICALIZATION,
        key_size: this.DEFAULT_KEY_SIZE,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      });

      const newConfig: DKIMConfig = {
        domain,
        selector: this.DEFAULT_SELECTOR,
        privateKey: dkimKeys.privateKey,
        publicKey: dkimKeys.publicKey,
        algorithm: this.DEFAULT_ALGORITHM,
        canonicalization: this.DEFAULT_CANONICALIZATION,
        keySize: this.DEFAULT_KEY_SIZE
      };

      logger.info('DKIM configuration generated successfully', {
        domain,
        selector: this.DEFAULT_SELECTOR,
        keySize: this.DEFAULT_KEY_SIZE
      });

      return newConfig;

    } catch (error) {
      logger.error('Error generating DKIM config for domain', {
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Gera par de chaves DKIM (pública/privada)
   * 
   * @param keySize - Tamanho da chave em bits
   * @returns Par de chaves DKIM
   */
  private async generateDKIMKeyPair(keySize: number = 2048): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (error, publicKey, privateKey) => {
        if (error) {
          reject(error);
          return;
        }

        // Extrair apenas a parte da chave pública (remover headers PEM)
        const publicKeyContent = publicKey
          .replace(/-----BEGIN PUBLIC KEY-----/g, '')
          .replace(/-----END PUBLIC KEY-----/g, '')
          .replace(/\n/g, '');

        resolve({
          privateKey,
          publicKey: publicKeyContent
        });
      });
    });
  }

  /**
   * Converte configuração do banco para formato DKIMConfig
   * 
   * @param dbConfig - Configuração do banco de dados
   * @returns Configuração DKIM formatada
   */
  private parseDKIMConfigFromDB(dbConfig: any): DKIMConfig {
    return {
      domain: dbConfig.domain || dbConfig.domain_name,
      selector: dbConfig.selector || this.DEFAULT_SELECTOR,
      privateKey: dbConfig.private_key,
      publicKey: dbConfig.public_key,
      algorithm: dbConfig.algorithm || this.DEFAULT_ALGORITHM,
      canonicalization: dbConfig.canonicalization || this.DEFAULT_CANONICALIZATION,
      keySize: dbConfig.key_size || this.DEFAULT_KEY_SIZE
    };
  }

  /**
   * Verifica se um domínio é da UltraZend
   * 
   * @param domain - Domínio a verificar
   * @returns true se for domínio UltraZend
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
   * Obtém configuração DKIM padrão (UltraZend)
   * 
   * @returns Configuração DKIM padrão
   */
  public async getDefaultDKIMConfig(): Promise<DKIMConfig | null> {
    try {
      // Usar método do DKIMManager pai se disponível
      if (super.getDKIMConfig) {
        return await super.getDKIMConfig(this.FALLBACK_DOMAIN);
      }

      // Fallback básico se método pai não estiver disponível
      logger.debug('Using basic fallback DKIM config');
      
      return {
        domain: this.FALLBACK_DOMAIN,
        selector: this.DEFAULT_SELECTOR,
        privateKey: '', // Será carregado pelo DKIMManager pai
        algorithm: this.DEFAULT_ALGORITHM,
        canonicalization: this.DEFAULT_CANONICALIZATION,
        keySize: this.DEFAULT_KEY_SIZE
      };
    } catch (error) {
      logger.error('Error getting default DKIM config', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Lista status DKIM de todos os domínios
   * 
   * @returns Array com status DKIM de cada domínio
   */
  async getAllDomainDKIMStatus(): Promise<DomainDKIMStatus[]> {
    try {
      const domains = await db('domains')
        .leftJoin('dkim_keys', 'domains.id', 'dkim_keys.domain_id')
        .select(
          'domains.domain_name as domain',
          'domains.is_verified',
          'dkim_keys.selector',
          'dkim_keys.algorithm',
          'dkim_keys.key_size',
          'dkim_keys.is_active',
          'dkim_keys.created_at'
        )
        .where('domains.is_verified', true);

      return domains.map(domain => ({
        domain: domain.domain,
        hasConfig: !!domain.selector,
        isActive: domain.is_active || false,
        selector: domain.selector || this.DEFAULT_SELECTOR,
        algorithm: domain.algorithm || this.DEFAULT_ALGORITHM,
        keySize: domain.key_size || this.DEFAULT_KEY_SIZE,
        createdAt: domain.created_at
      }));
    } catch (error) {
      logger.error('Error getting all domain DKIM status', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Remove configuração DKIM de um domínio (marca como inativo)
   * 
   * @param domain - Domínio para remover configuração
   * @returns true se removido com sucesso
   */
  async removeDKIMConfigForDomain(domain: string): Promise<boolean> {
    try {
      const domainRecord = await db('domains')
        .select('id')
        .where('domain_name', domain.toLowerCase())
        .first();

      if (!domainRecord) {
        logger.warn('Domain not found for DKIM removal', { domain });
        return false;
      }

      const updateCount = await db('dkim_keys')
        .where('domain_id', domainRecord.id)
        .update({
          is_active: false,
          updated_at: new Date()
        });

      if (updateCount > 0) {
        logger.info('DKIM configuration deactivated for domain', { domain });
        return true;
      }

      logger.warn('No DKIM configuration found to deactivate', { domain });
      return false;
    } catch (error) {
      logger.error('Error removing DKIM config for domain', {
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Regenera chaves DKIM para um domínio
   * 
   * @param domain - Domínio para regenerar chaves
   * @returns true se regenerado com sucesso
   */
  async regenerateDKIMKeysForDomain(domain: string): Promise<boolean> {
    try {
      const domainRecord = await db('domains')
        .select('id')
        .where('domain_name', domain.toLowerCase())
        .where('is_verified', true)
        .first();

      if (!domainRecord) {
        logger.warn('Domain not found or not verified for DKIM regeneration', { domain });
        return false;
      }

      // Gerar novas chaves
      const newKeys = await this.generateDKIMKeyPair(this.DEFAULT_KEY_SIZE);

      // Atualizar no banco
      const updateCount = await db('dkim_keys')
        .where('domain_id', domainRecord.id)
        .update({
          private_key: newKeys.privateKey,
          public_key: newKeys.publicKey,
          updated_at: new Date()
        });

      if (updateCount === 0) {
        // Se não existe configuração, criar nova
        await db('dkim_keys').insert({
          domain_id: domainRecord.id,
          selector: this.DEFAULT_SELECTOR,
          private_key: newKeys.privateKey,
          public_key: newKeys.publicKey,
          algorithm: this.DEFAULT_ALGORITHM,
          canonicalization: this.DEFAULT_CANONICALIZATION,
          key_size: this.DEFAULT_KEY_SIZE,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      logger.info('DKIM keys regenerated successfully for domain', { domain });
      return true;
    } catch (error) {
      logger.error('Error regenerating DKIM keys for domain', {
        domain,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}