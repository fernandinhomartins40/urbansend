import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import fs from 'fs/promises';
import path from 'path';
import db from '../config/database';

export interface DKIMConfig {
  domain: string;
  selector: string;
  privateKey: string;
  publicKey?: string;
  algorithm: 'rsa-sha256' | 'rsa-sha1';
  canonicalization: 'relaxed/relaxed' | 'simple/simple' | 'relaxed/simple' | 'simple/relaxed';
  keySize: 1024 | 2048 | 4096;
}

export interface SignedEmailData {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  dkimSignature?: string;
}

export class DKIMManager {
  private dkimConfigs: Map<string, DKIMConfig> = new Map();
  private defaultSelector = 'default';
  private defaultAlgorithm: 'rsa-sha256' = 'rsa-sha256';
  private defaultCanonical: 'relaxed/relaxed' = 'relaxed/relaxed';

  constructor() {
    this.initializeDKIM();
  }

  private async initializeDKIM() {
    try {
      logger.info('Starting DKIM Manager initialization', {
        timestamp: new Date().toISOString()
      });
      
      // Aguardar um momento para garantir que outras tabelas foram criadas
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await this.createDKIMTables();
      await this.loadDKIMConfigs();
      
      // Aguardar mais um momento antes de tentar criar domínio/chaves
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await this.ensureDefaultDKIM();
      
      logger.info('DKIMManager initialized successfully', {
        configuredDomains: this.dkimConfigs.size,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to initialize DKIMManager', { 
        error: error.message,
        code: error.code,
        errno: error.errno,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      // Não relançar o erro para não impedir a inicialização do sistema
    }
  }

  private async createDKIMTables() {
    try {
      const hasDKIMTable = await db.schema.hasTable('dkim_keys');
      if (!hasDKIMTable) {
        await db.schema.createTable('dkim_keys', (table) => {
          table.increments('id').primary();
          table.string('domain', 255).notNullable();
          table.string('selector', 100).notNullable().defaultTo('default');
          table.text('private_key').notNullable();
          table.text('public_key');
          table.string('algorithm', 20).defaultTo('rsa-sha256');
          table.string('canonicalization', 50).defaultTo('relaxed/relaxed');
          table.integer('key_size').defaultTo(2048);
          table.boolean('is_active').defaultTo(true);
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('expires_at');
          table.timestamps(true, true);
          
          table.unique(['domain', 'selector']);
          table.index('domain');
          table.index('is_active');
        });
      }

      // Tabela para logs de assinatura DKIM
      const hasDKIMLogsTable = await db.schema.hasTable('dkim_signature_logs');
      if (!hasDKIMLogsTable) {
        await db.schema.createTable('dkim_signature_logs', (table) => {
          table.increments('id').primary();
          table.string('domain', 255).notNullable();
          table.string('selector', 100).notNullable();
          table.string('message_id', 255);
          table.string('recipient_domain', 255);
          table.boolean('signature_valid').defaultTo(true);
          table.string('algorithm', 20);
          table.text('signature_hash');
          table.timestamp('signed_at').defaultTo(db.fn.now());
          table.timestamps(true, true);
          
          table.index(['domain', 'signed_at']);
          table.index('signature_valid');
        });
      }

      logger.info('DKIM tables created successfully');
    } catch (error) {
      logger.error('Failed to create DKIM tables', { error });
    }
  }

  private async loadDKIMConfigs() {
    try {
      const configs = await db('dkim_keys')
        .join('domains', 'dkim_keys.domain_id', 'domains.id')
        .where('dkim_keys.is_active', true)
        .select('dkim_keys.*', 'domains.domain');

      configs.forEach(config => {
        const dkimConfig: DKIMConfig = {
          domain: config.domain,
          selector: config.selector,
          privateKey: config.private_key,
          publicKey: config.public_key,
          algorithm: config.algorithm,
          canonicalization: config.canonicalization,
          keySize: config.key_size
        };

        this.dkimConfigs.set(config.domain, dkimConfig);
      });

      logger.info('DKIM configurations loaded', {
        domains: this.dkimConfigs.size,
        configuredDomains: Array.from(this.dkimConfigs.keys())
      });
    } catch (error: any) {
      logger.error('Failed to load DKIM configurations', { 
        error: error.message,
        code: error.code
      });
    }
  }

  private async ensureDefaultDKIM() {
    try {
      const primaryDomain = Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br');
      const baseDomain = primaryDomain.replace(/^mail\./, '').replace(/^www\./, '');
      
      // Padronizar para ultrazend.com.br sem www
      const standardDomain = 'ultrazend.com.br';
      
      logger.info('Ensuring default DKIM for domain', { 
        primaryDomain, 
        baseDomain, 
        standardDomain 
      });

      if (!this.dkimConfigs.has(standardDomain)) {
        // Primeiro, garantir que o domínio existe na tabela domains
        await this.ensureDomainExists(standardDomain);
        
        logger.info('Generating DKIM keys for primary domain', { domain: standardDomain });
        await this.generateDKIMKeys(standardDomain);
      } else {
        logger.info('DKIM configuration already exists for domain', { domain: standardDomain });
      }
    } catch (error) {
      logger.error('Failed to ensure default DKIM', { error });
      // Não relançar o erro para não impedir a inicialização do sistema
    }
  }

  public async generateDKIMKeys(
    domain: string,
    selector: string = 'default',
    keySize: 1024 | 2048 | 4096 = 2048
  ): Promise<{ privateKey: string; publicKey: string; dnsRecord: string }> {
    try {
      logger.info('Starting DKIM key generation', { domain, selector, keySize });

      // PASSO 1: Verificar se o domínio existe na tabela domains
      await this.ensureDomainExists(domain);

      // PASSO 2: Gerar par de chaves RSA
      logger.debug('Generating RSA key pair', { keySize });
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      // PASSO 3: Extrair chave pública para formato DKIM
      const publicKeyData = this.extractPublicKeyData(publicKey);
      logger.debug('Public key extracted', { 
        publicKeyLength: publicKeyData.length,
        publicKeyPreview: publicKeyData.substring(0, 50) + '...'
      });

      // PASSO 4: Criar registro DNS
      const dnsRecord = this.generateDNSRecord(publicKeyData, keySize);

      // PASSO 5: Obter domain_id do domínio criado
      const domainRecord = await db('domains')
        .where('domain', domain)
        .first();
      
      if (!domainRecord) {
        throw new Error(`Domain ${domain} was not found after creation`);
      }
      
      const domainId = domainRecord.id;
      logger.debug('Found domain record for DKIM keys', { domain, domainId });
      
      // PASSO 6: Salvar configuração no banco com retry logic
      const maxRetries = 3;
      let attempt = 0;
      let insertSuccess = false;
      
      while (attempt < maxRetries && !insertSuccess) {
        try {
          attempt++;
          logger.debug('Attempting to save DKIM keys to database', { attempt, maxRetries, domainId });
          
          await db('dkim_keys')
            .insert({
              domain_id: domainId,
              selector,
              private_key: privateKey,
              public_key: publicKeyData,
              algorithm: this.defaultAlgorithm,
              canonicalization: this.defaultCanonical,
              key_size: keySize,
              is_active: true
            })
            .onConflict(['domain_id', 'selector'])
            .merge();
          
          insertSuccess = true;
          logger.debug('DKIM keys saved to database successfully');
        } catch (dbError: any) {
          logger.error('Database insertion attempt failed', { 
            attempt, 
            maxRetries, 
            error: dbError.message,
            code: dbError.code,
            errno: dbError.errno,
            domainId 
          });
          
          if (attempt === maxRetries) {
            throw new Error(`Failed to save DKIM keys after ${maxRetries} attempts: ${dbError.message}`);
          }
          
          // Aguardar um pouco antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // PASSO 6: Atualizar cache
      const config: DKIMConfig = {
        domain,
        selector,
        privateKey,
        publicKey: publicKeyData,
        algorithm: this.defaultAlgorithm,
        canonicalization: this.defaultCanonical,
        keySize
      };

      this.dkimConfigs.set(domain, config);
      logger.debug('DKIM configuration cached', { domain });

      // PASSO 7: Salvar chaves em arquivos para backup
      await this.saveKeysToFiles(domain, selector, privateKey, publicKeyData);

      logger.info('DKIM keys generated successfully', { 
        domain, 
        selector,
        keySize,
        dnsRecord: dnsRecord.substring(0, 100) + '...',
        publicKeyPreview: publicKeyData.substring(0, 50) + '...',
        cacheSize: this.dkimConfigs.size
      });

      return {
        privateKey,
        publicKey: publicKeyData,
        dnsRecord
      };

    } catch (error: any) {
      logger.error('Failed to generate DKIM keys', { 
        error: error.message, 
        stack: error.stack,
        domain, 
        selector,
        keySize 
      });
      throw error;
    }
  }

  private extractPublicKeyData(publicKeyPem: string): string {
    // Remover headers PEM e extrair apenas os dados da chave
    return publicKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');
  }

  private generateDNSRecord(publicKeyData: string, keySize: number): string {
    return `v=DKIM1; k=rsa; t=s; s=email; p=${publicKeyData}`;
  }

  private async saveKeysToFiles(
    domain: string,
    selector: string,
    privateKey: string,
    publicKey: string
  ): Promise<void> {
    try {
      const keysDir = path.join(process.cwd(), 'configs', 'dkim-keys');
      
      // Criar diretório se não existir
      await fs.mkdir(keysDir, { recursive: true });

      // Salvar chave privada
      const privateKeyPath = path.join(keysDir, `${domain}-${selector}-private.pem`);
      await fs.writeFile(privateKeyPath, privateKey, { mode: 0o600 }); // Permissão restrita

      // Salvar chave pública
      const publicKeyPath = path.join(keysDir, `${domain}-${selector}-public.txt`);
      await fs.writeFile(publicKeyPath, publicKey);

      // Salvar registro DNS
      const dnsRecord = this.generateDNSRecord(publicKey, 2048);
      const dnsPath = path.join(keysDir, `${domain}-${selector}-dns.txt`);
      await fs.writeFile(dnsPath, dnsRecord);

      logger.info('DKIM keys saved to files', { 
        domain, 
        selector,
        privateKeyPath,
        publicKeyPath,
        dnsPath
      });

    } catch (error) {
      logger.error('Failed to save DKIM keys to files', { error });
    }
  }

  public async signEmail(emailData: any): Promise<SignedEmailData> {
    try {
      const fromAddress = emailData.from;
      const domain = this.extractDomainFromEmail(fromAddress);
      
      // Buscar configuração DKIM para o domínio
      const config = this.dkimConfigs.get(domain);
      if (!config) {
        logger.warn('No DKIM configuration found for domain', { domain });
        return emailData; // Retorna sem assinatura
      }

      // Gerar cabeçalhos DKIM
      const dkimHeaders = this.generateDKIMHeaders(emailData, config);
      
      // Calcular assinatura
      const signature = this.calculateSignature(dkimHeaders, emailData, config);
      
      // Criar cabeçalho DKIM-Signature completo
      const dkimSignature = this.buildDKIMSignature(dkimHeaders, signature, config);

      // Log da assinatura
      await this.logDKIMSignature(
        domain,
        config.selector,
        emailData.messageId,
        this.extractDomainFromEmail(emailData.to),
        config.algorithm,
        signature
      );

      const signedEmail: SignedEmailData = {
        ...emailData,
        headers: {
          ...emailData.headers,
          'DKIM-Signature': dkimSignature
        },
        dkimSignature
      };

      logger.debug('Email signed with DKIM', {
        domain,
        selector: config.selector,
        algorithm: config.algorithm,
        to: emailData.to
      });

      return signedEmail;

    } catch (error) {
      logger.error('Failed to sign email with DKIM', { error });
      return emailData; // Retorna sem assinatura em caso de erro
    }
  }

  private extractDomainFromEmail(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1].trim() : '';
  }

  private generateDKIMHeaders(emailData: any, config: DKIMConfig): string {
    const headers = [
      `v=1`,
      `a=${config.algorithm}`,
      `c=${config.canonicalization}`,
      `d=${config.domain}`,
      `s=${config.selector}`,
      `h=from:to:subject:date:message-id`,
      `bh=${this.calculateBodyHash(emailData)}`,
      `b=`
    ];

    return headers.join('; ');
  }

  private calculateBodyHash(emailData: any): string {
    // Canonicalizar corpo do email
    let body = emailData.html || emailData.text || '';
    
    // Aplicar canonicalização relaxed
    if (this.defaultCanonical.includes('relaxed')) {
      body = this.canonicalizeBodyRelaxed(body);
    }

    // Calcular hash SHA-256 do corpo
    return crypto.createHash('sha256').update(body, 'utf8').digest('base64');
  }

  private canonicalizeBodyRelaxed(body: string): string {
    return body
      .replace(/\r\n/g, '\n') // Normalizar line endings
      .replace(/[ \t]+/g, ' ') // Reduzir espaços múltiplos
      .replace(/[ \t]+\n/g, '\n') // Remover espaços no final das linhas
      .replace(/\n+$/, '') // Remover linhas vazias no final
      + (body.length > 0 ? '\n' : ''); // Adicionar linha final se necessário
  }

  private calculateSignature(
    dkimHeaders: string,
    emailData: any,
    config: DKIMConfig
  ): string {
    // Criar string para assinar (cabeçalhos + corpo)
    const headersToSign = this.canonicalizeHeaders(emailData);
    const signatureString = headersToSign + '\n' + dkimHeaders;

    // Criar assinatura
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureString, 'utf8');
    
    return sign.sign(config.privateKey, 'base64');
  }

  private canonicalizeHeaders(emailData: any): string {
    const headers = [];
    
    // Cabeçalhos obrigatórios para assinatura
    if (emailData.from) headers.push(`from:${emailData.from.toLowerCase()}`);
    if (emailData.to) headers.push(`to:${emailData.to.toLowerCase()}`);
    if (emailData.subject) headers.push(`subject:${emailData.subject}`);
    
    // Adicionar cabeçalhos de data e message-id se existirem
    if (emailData.date) headers.push(`date:${emailData.date}`);
    if (emailData.messageId) headers.push(`message-id:${emailData.messageId}`);

    return headers.join('\n');
  }

  private buildDKIMSignature(
    dkimHeaders: string,
    signature: string,
    config: DKIMConfig
  ): string {
    return dkimHeaders.replace('b=', `b=${signature}`);
  }

  private async logDKIMSignature(
    domain: string,
    selector: string,
    messageId?: string,
    recipientDomain?: string,
    algorithm?: string,
    signature?: string
  ): Promise<void> {
    try {
      await db('dkim_signature_logs').insert({
        domain,
        selector,
        message_id: messageId,
        recipient_domain: recipientDomain,
        signature_valid: true,
        algorithm,
        signature_hash: signature ? crypto.createHash('sha256').update(signature).digest('hex') : null,
        signed_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to log DKIM signature', { error });
    }
  }

  public async verifyDKIMSignature(
    emailData: any,
    dkimSignature: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Parsear cabeçalho DKIM-Signature
      const dkimParams = this.parseDKIMSignature(dkimSignature);
      
      if (!dkimParams.d || !dkimParams.s) {
        return { valid: false, reason: 'Missing domain or selector in DKIM signature' };
      }

      // Buscar chave pública via DNS (simulado - busca no banco)
      const config = this.dkimConfigs.get(dkimParams.d);
      if (!config) {
        return { valid: false, reason: 'DKIM public key not found' };
      }

      // Reconstruir string de assinatura
      const headersToVerify = this.canonicalizeHeaders(emailData);
      const dkimHeadersForVerify = dkimSignature.replace(/b=[^;]+/, 'b=');
      const verificationString = headersToVerify + '\n' + dkimHeadersForVerify;

      // Verificar assinatura
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(verificationString, 'utf8');
      
      // Converter chave pública para formato PEM
      const publicKeyPem = this.formatPublicKeyPEM(config.publicKey || '');
      const isValid = verify.verify(publicKeyPem, dkimParams.b, 'base64');

      return { valid: isValid };

    } catch (error) {
      logger.error('DKIM signature verification failed', { error });
      return { valid: false, reason: 'Verification error' };
    }
  }

  private parseDKIMSignature(signature: string): Record<string, string> {
    const params: Record<string, string> = {};
    
    signature.split(';').forEach(param => {
      const [key, value] = param.trim().split('=', 2);
      if (key && value) {
        params[key.trim()] = value.trim();
      }
    });

    return params;
  }

  private formatPublicKeyPEM(publicKeyData: string): string {
    return `-----BEGIN PUBLIC KEY-----\n${publicKeyData.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
  }

  /**
   * Garante que o domínio existe na tabela domains antes de tentar criar chaves DKIM
   */
  private async ensureDomainExists(domain: string): Promise<void> {
    try {
      logger.debug('Checking if domain exists in database', { domain });
      
      // Primeiro, verificar se as tabelas necessárias existem
      const hasUsersTable = await db.schema.hasTable('users');
      const hasDomainsTable = await db.schema.hasTable('domains');
      
      if (!hasUsersTable || !hasDomainsTable) {
        logger.error('Required tables do not exist', { 
          hasUsersTable, 
          hasDomainsTable 
        });
        throw new Error('Required database tables (users, domains) do not exist');
      }
      
      // Verificar se o domínio já existe
      const existingDomain = await db('domains')
        .where('domain', domain)
        .first();
      
      if (existingDomain) {
        logger.debug('Domain already exists in database', { 
          domain, 
          domainId: existingDomain.id,
          isVerified: existingDomain.is_verified
        });
        return;
      }
      
      logger.info('Domain does not exist, creating domain record', { domain });
      
      // Verificar se existe pelo menos um usuário para associar o domínio
      let systemUser = await db('users')
        .where('email', 'like', '%system%')
        .orWhere('email', 'like', '%admin%')
        .first();
      
      // Se não encontrou usuário sistema, pegar o primeiro usuário disponível
      if (!systemUser) {
        systemUser = await db('users')
          .orderBy('id', 'asc')
          .first();
      }
      
      // Se ainda não há usuários, criar um usuário sistema
      if (!systemUser) {
        logger.warn('No users found, creating default system user');
        
        const systemUserData = {
          name: 'System',
          email: 'system@ultrazend.com.br',
          password: await bcrypt.hash('system-generated-password-' + Date.now(), 12),
          is_admin: true,
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date()
        };
        
        try {
          const result = await db('users')
            .insert(systemUserData)
            .returning('id');
          
          const systemUserId = Array.isArray(result) ? result[0] : result;
          logger.info('System user created', { systemUserId });
          systemUser = { id: systemUserId, ...systemUserData };
        } catch (userError: any) {
          logger.error('Failed to create system user', { 
            error: userError.message,
            code: userError.code
          });
          throw userError;
        }
      }
      
      const userId = systemUser.id;
      
      // Criar registro do domínio
      const domainData = {
        user_id: userId,
        domain,
        is_verified: true, // Assumir como verificado para domínio principal
        verification_method: 'manual',
        dkim_enabled: true,
        spf_enabled: true,
        dmarc_enabled: false,
        verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };
      
      try {
        const result = await db('domains')
          .insert(domainData)
          .returning('id');
        
        const domainId = Array.isArray(result) ? result[0] : result;
        
        logger.info('Domain created successfully', { 
          domain, 
          domainId, 
          userId 
        });
      } catch (domainError: any) {
        logger.error('Failed to create domain record', { 
          error: domainError.message,
          code: domainError.code,
          errno: domainError.errno
        });
        throw domainError;
      }
      
    } catch (error: any) {
      logger.error('Failed to ensure domain exists', { 
        error: error.message,
        code: error.code,
        errno: error.errno,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        domain 
      });
      throw error;
    }
  }

  // Métodos de gerenciamento público
  public async getDKIMConfig(domain: string): Promise<DKIMConfig | null> {
    return this.dkimConfigs.get(domain) || null;
  }

  public async listDKIMDomains(): Promise<string[]> {
    return Array.from(this.dkimConfigs.keys());
  }

  public async rotateDKIMKeys(
    domain: string,
    newSelector?: string,
    keySize?: 1024 | 2048 | 4096
  ): Promise<string> {
    try {
      // Obter domain_id
      const domainRecord = await db('domains')
        .where('domain', domain)
        .first();
      
      if (!domainRecord) {
        throw new Error(`Domain ${domain} not found`);
      }
      
      // Desativar configuração atual
      await db('dkim_keys')
        .where('domain_id', domainRecord.id)
        .update({ is_active: false });

      // Gerar novas chaves com novo seletor
      const selector = newSelector || `rotate-${Date.now()}`;
      const result = await this.generateDKIMKeys(domain, selector, keySize);

      logger.info('DKIM keys rotated successfully', { domain, selector });

      return result.dnsRecord;
    } catch (error: any) {
      logger.error('Failed to rotate DKIM keys', { 
        error: error.message,
        code: error.code,
        domain 
      });
      throw error;
    }
  }

  public async getDKIMStats(): Promise<any> {
    try {
      const [
        totalConfigs,
        activeConfigs,
        recentSignatures,
        signaturesByDomain
      ] = await Promise.all([
        db('dkim_keys').count('* as count').first(),
        db('dkim_keys').where('is_active', true).count('* as count').first(),
        db('dkim_signature_logs')
          .where('signed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        db('dkim_signature_logs')
          .where('signed_at', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .groupBy('domain')
          .count('* as count')
          .select('domain')
          .limit(10)
      ]);

      return {
        configurations: {
          total: totalConfigs?.count || 0,
          active: activeConfigs?.count || 0
        },
        signatures: {
          last_24h: recentSignatures?.count || 0,
          by_domain: signaturesByDomain || []
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Failed to get DKIM stats', { 
        error: error.message,
        code: error.code 
      });
      return {
        configurations: { total: 0, active: 0 },
        signatures: { last_24h: 0, by_domain: [] },
        timestamp: new Date().toISOString()
      };
    }
  }

  public async exportDNSRecords(): Promise<string> {
    try {
      const configs = await db('dkim_keys')
        .join('domains', 'dkim_keys.domain_id', 'domains.id')
        .where('dkim_keys.is_active', true)
        .select('domains.domain', 'dkim_keys.selector', 'dkim_keys.public_key', 'dkim_keys.key_size');

      const dnsRecords = configs.map(config => {
        const dnsRecord = this.generateDNSRecord(config.public_key, config.key_size);
        return `${config.selector}._domainkey.${config.domain}. IN TXT "${dnsRecord}"`;
      }).join('\n');

      logger.info('DNS records exported', { domains: configs.length });

      return dnsRecords;
    } catch (error: any) {
      logger.error('Failed to export DNS records', { 
        error: error.message,
        code: error.code
      });
      return '';
    }
  }
}