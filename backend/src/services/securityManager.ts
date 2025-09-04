import { logger } from '../config/logger';
import { Knex } from 'knex';
import db from '../config/database';
import { ParsedMail } from 'mailparser';
import dns from 'dns';
import { Env } from '../utils/env';

export interface SecurityValidation {
  allowed: boolean;
  reason?: string;
  spamScore?: number;
  confidence?: number;
  details?: any;
  source?: string;
}

export interface RateLimitConfig {
  max: number;
  windowMs: number;
  keyGenerator: (req: any) => string;
}

export interface SpamAnalysisResult {
  isSpam: boolean;
  score: number;
  reason: string;
  details: {
    subjectScore: number;
    bodyScore: number;
    headerScore: number;
    attachmentScore: number;
  };
}

export interface MalwareScanResult {
  found: boolean;
  details?: {
    type: string;
    signature: string;
    file?: string;
  };
}

export interface PhishingDetectionResult {
  suspected: boolean;
  confidence: number;
  indicators: string[];
}

export class SecurityManager {
  private db: Knex;
  
  private blacklistedIPs: Set<string> = new Set();
  private rateLimiters: Map<string, Map<string, { count: number; window: number }>> = new Map();
  private spamKeywords: Set<string> = new Set();
  private phishingDomains: Set<string> = new Set();
  
  private readonly SPAM_THRESHOLD = 5.0;
  private readonly PHISHING_CONFIDENCE_THRESHOLD = 0.7;

  constructor(database?: Knex) {
    this.db = database || db;
    
    this.initializeTables();
    this.loadSecurityData();
  }

  private async initializeTables(): Promise<void> {
    try {
      // Tabela de blacklists de IPs
      const hasSecurityBlacklists = await this.db.schema.hasTable('security_blacklists');
      if (!hasSecurityBlacklists) {
        await this.db.schema.createTable('security_blacklists', (table) => {
          table.increments('id').primary();
          table.string('ip_address').unique().notNullable();
          table.text('reason').notNullable();
          table.boolean('is_active').defaultTo(true);
          table.string('added_by').defaultTo('system');
          table.datetime('created_at').defaultTo(this.db.fn.now());
          table.datetime('expires_at').nullable();
          table.datetime('last_seen').nullable();
        });
      }

      // Tabela de rate limiting (protegida contra condição de corrida)
      try {
        const hasRateLimitViolations = await this.db.schema.hasTable('rate_limit_violations');
        if (!hasRateLimitViolations) {
          await this.db.schema.createTable('rate_limit_violations', (table) => {
            table.increments('id').primary();
            table.string('identifier').notNullable();
            table.string('limit_type').notNullable();
            table.integer('violation_count').defaultTo(1);
            table.datetime('first_violation').defaultTo(this.db.fn.now());
            table.datetime('last_violation').defaultTo(this.db.fn.now());
            table.boolean('is_blocked').defaultTo(false);
            table.datetime('expires_at').nullable();
          });
        }
      } catch (error: any) {
        // Ignorar erro se tabela já existe (condição de corrida entre instâncias)
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }

      // Tabela de análise de spam
      const hasSpamAnalysis = await this.db.schema.hasTable('spam_analysis');
      if (!hasSpamAnalysis) {
        await this.db.schema.createTable('spam_analysis', (table) => {
          table.increments('id').primary();
          table.string('email_id').nullable();
          table.decimal('spam_score', 5, 2).notNullable();
          table.boolean('is_spam').notNullable();
          table.text('reason').nullable();
          table.text('details').nullable();
          table.string('sender_ip').nullable();
          table.string('sender_email').nullable();
          table.string('subject_hash').nullable();
          table.datetime('analyzed_at').defaultTo(this.db.fn.now());
        });
      }

      // Tabela de detecção de phishing
      const hasPhishingDetection = await this.db.schema.hasTable('phishing_detection');
      if (!hasPhishingDetection) {
        await this.db.schema.createTable('phishing_detection', (table) => {
          table.increments('id').primary();
          table.string('email_id').nullable();
          table.decimal('confidence_score', 3, 2).notNullable();
          table.boolean('is_phishing').notNullable();
          table.text('indicators').nullable();
          table.text('suspicious_urls').nullable();
          table.string('sender_domain').nullable();
          table.datetime('detected_at').defaultTo(this.db.fn.now());
        });
      }

      // Tabela de reputação de IPs
      const hasIpReputation = await this.db.schema.hasTable('ip_reputation');
      if (!hasIpReputation) {
        await this.db.schema.createTable('ip_reputation', (table) => {
          table.increments('id').primary();
          table.string('ip_address').unique().notNullable();
          table.decimal('reputation_score', 3, 2).defaultTo(1.0);
          table.integer('total_connections').defaultTo(0);
          table.integer('successful_connections').defaultTo(0);
          table.integer('blocked_connections').defaultTo(0);
          table.integer('spam_reports').defaultTo(0);
          table.datetime('last_activity').defaultTo(this.db.fn.now());
          table.datetime('updated_at').defaultTo(this.db.fn.now());
        });
      }

      // Tabela de logs de segurança (protegida contra condição de corrida)
      try {
        const hasSecurityLogs = await this.db.schema.hasTable('security_logs');
        if (!hasSecurityLogs) {
          await this.db.schema.createTable('security_logs', (table) => {
            table.increments('id').primary();
            table.string('event_type').notNullable();
            table.string('severity').notNullable();
            table.string('source_ip').nullable();
            table.integer('user_id').nullable();
            table.string('session_id').nullable();
            table.text('details').nullable();
            table.text('action_taken').nullable();
            table.datetime('timestamp').defaultTo(this.db.fn.now());
          });
        }
      } catch (error: any) {
        // Ignorar erro se tabela já existe (condição de corrida entre instâncias)
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }

      // Índices para performance (criar sempre, ignorar erros se já existem)
      try {
        await this.db.schema.alterTable('security_blacklists', (table) => {
          table.index(['ip_address', 'is_active'], 'idx_blacklists_ip');
        });
      } catch (error) {
        // Índice pode já existir
      }

      try {
        await this.db.schema.alterTable('rate_limit_violations', (table) => {
          table.index(['identifier', 'limit_type'], 'idx_rate_limit_identifier');
        });
      } catch (error) {
        // Índice pode já existir
      }

      try {
        await this.db.schema.alterTable('ip_reputation', (table) => {
          table.index(['ip_address'], 'idx_ip_reputation_ip');
        });
      } catch (error) {
        // Índice pode já existir
      }

      try {
        await this.db.schema.alterTable('security_logs', (table) => {
          table.index(['timestamp'], 'idx_security_logs_timestamp');
        });
      } catch (error) {
        // Índice pode já existir
      }

      logger.info('SecurityManager: Tabelas de segurança inicializadas com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar tabelas de segurança:', error);
      throw error;
    }
  }

  private async loadSecurityData(): Promise<void> {
    try {
      // Carregar blacklists ativas
      const blacklists = await this.db('security_blacklists')
        .select('ip_address', 'reason')
        .where('is_active', true)
        .where(function() {
          this.whereNull('expires_at')
            .orWhere('expires_at', '>', new Date());
        });

      blacklists.forEach(entry => {
        this.blacklistedIPs.add(entry.ip_address);
      });

      // Carregar palavras-chave de spam
      this.loadSpamKeywords();

      // Carregar domínios de phishing conhecidos
      this.loadPhishingDomains();

      logger.info(`SecurityManager: Dados de segurança carregados`, {
        blacklistedIPs: this.blacklistedIPs.size,
        spamKeywords: this.spamKeywords.size,
        phishingDomains: this.phishingDomains.size
      });
    } catch (error) {
      logger.error('Erro ao carregar dados de segurança:', error);
    }
  }

  private loadSpamKeywords(): void {
    const spamWords = [
      // Palavras comuns de spam
      'viagra', 'cialis', 'pharmacy', 'pills', 'medication',
      'casino', 'gambling', 'lottery', 'winner', 'congratulations',
      'urgent', 'immediate', 'act now', 'limited time', 'exclusive offer',
      'free money', 'get rich quick', 'make money fast', 'work from home',
      'weight loss', 'lose weight', 'diet pills', 'miracle cure',
      'nigerian prince', 'inheritance', 'beneficiary', 'transfer funds',
      'click here', 'limited offer', 'order now', 'call now',
      // Palavras em português
      'ganhe dinheiro', 'renda extra', 'trabalhe em casa', 'oportunidade única',
      'clique aqui', 'oferta limitada', 'desconto imperdível', 'promoção relâmpago'
    ];

    spamWords.forEach(word => this.spamKeywords.add(word.toLowerCase()));
  }

  private loadPhishingDomains(): void {
    const phishingDomains = [
      // Domínios suspeitos comuns
      'tempmail.org', '10minutemail.com', 'guerrillamail.com',
      'mailinator.com', 'yopmail.com', 'throwaway.email',
      // Imitações de bancos brasileiros
      'bradesc0.com', 'itau-unicc.com', 'santanderr.com',
      'caixaeconomicafederal.com', 'bancobbrasil.com'
    ];

    phishingDomains.forEach(domain => this.phishingDomains.add(domain.toLowerCase()));
  }

  public async validateMXConnection(remoteAddress: string, hostname?: string): Promise<SecurityValidation> {
    logger.debug('Validating MX connection', { remoteAddress, hostname });

    try {
      // 1. Verificar blacklist
      if (this.blacklistedIPs.has(remoteAddress)) {
        await this.logSecurityEvent('connection_blocked', 'HIGH', remoteAddress, null, null, {
          reason: 'IP in blacklist'
        }, 'CONNECTION_REJECTED');

        return {
          allowed: false,
          reason: 'IP address is blacklisted'
        };
      }

      // 2. Verificar rate limiting
      const rateLimitCheck = await this.checkRateLimit('connection', remoteAddress, {
        max: 100, // 100 connections per hour
        windowMs: 3600000,
        keyGenerator: () => remoteAddress
      });

      if (!rateLimitCheck.allowed) {
        return rateLimitCheck;
      }

      // 3. Verificar reputação do IP
      const reputationCheck = await this.checkIPReputation(remoteAddress);
      if (!reputationCheck.allowed) {
        return reputationCheck;
      }

      // 4. Verificar DNS reverso
      if (hostname) {
        const dnsCheck = await this.validateReverseDNS(remoteAddress, hostname);
        if (!dnsCheck.valid) {
          logger.warn('Reverse DNS validation failed', {
            remoteAddress,
            hostname,
            reason: dnsCheck.reason
          });
          // Não bloquear por DNS reverso, apenas log warning
        }
      }

      // 5. Atualizar estatísticas de conexão
      await this.updateIPReputation(remoteAddress, 'connection', true);

      return { allowed: true };

    } catch (error) {
      logger.error('Error validating MX connection:', error);
      return { allowed: true }; // Allow on error to avoid false positives
    }
  }

  public async checkEmailSecurity(emailData: ParsedMail, session: any): Promise<SecurityValidation> {
    logger.debug('Checking email security', {
      from: emailData.from?.text,
      subject: emailData.subject,
      sessionId: session.id
    });

    try {
      // 1. Análise de spam
      const spamCheck = await this.analyzeSpam(emailData, session);
      if (spamCheck.isSpam) {
        await this.logSecurityEvent('spam_detected', 'MEDIUM', session.remoteAddress, session.user, session.id, {
          spamScore: spamCheck.score,
          reason: spamCheck.reason,
          from: emailData.from?.text,
          subject: emailData.subject
        }, 'EMAIL_REJECTED');

        return {
          allowed: false,
          reason: `Spam detected: ${spamCheck.reason}`,
          spamScore: spamCheck.score
        };
      }

      // 2. Detecção de phishing
      const phishingCheck = await this.detectPhishing(emailData);
      if (phishingCheck.suspected) {
        await this.logSecurityEvent('phishing_detected', 'HIGH', session.remoteAddress, session.user, session.id, {
          confidence: phishingCheck.confidence,
          indicators: phishingCheck.indicators,
          from: emailData.from?.text,
          subject: emailData.subject
        }, 'EMAIL_REJECTED');

        return {
          allowed: false,
          reason: 'Phishing attempt detected',
          confidence: phishingCheck.confidence
        };
      }

      // 3. Verificação de malware
      const malwareCheck = await this.scanForMalware(emailData);
      if (malwareCheck.found) {
        await this.logSecurityEvent('malware_detected', 'CRITICAL', session.remoteAddress, session.user, session.id, {
          malwareType: malwareCheck.details?.type,
          signature: malwareCheck.details?.signature,
          from: emailData.from?.text
        }, 'EMAIL_QUARANTINED');

        return {
          allowed: false,
          reason: 'Malware detected',
          details: malwareCheck.details
        };
      }

      // 4. Log email aprovado
      await this.logSecurityEvent('email_approved', 'INFO', session.remoteAddress, session.user, session.id, {
        from: emailData.from?.text,
        subject: emailData.subject,
        spamScore: spamCheck.score
      }, 'EMAIL_ACCEPTED');

      return { allowed: true };

    } catch (error) {
      logger.error('Error checking email security:', error);
      return { allowed: true }; // Allow on error
    }
  }

  private async checkRateLimit(limitType: string, identifier: string, config: RateLimitConfig): Promise<SecurityValidation> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Verificar violações recentes
      const violations = await this.db('rate_limit_violations')
        .select('violation_count', 'first_violation', 'last_violation', 'is_blocked', 'expires_at')
        .where('identifier', identifier)
        .where('limit_type', limitType)
        .where(function() {
          this.whereNull('expires_at')
            .orWhere('expires_at', '>', new Date());
        })
        .first();

      if (!violations) {
        // Primeira conexão - criar registro
        await this.db('rate_limit_violations').insert({
          identifier,
          limit_type: limitType,
          violation_count: 1
        });
        
        return { allowed: true };
      }

      const firstViolation = new Date(violations.first_violation).getTime();
      const violationCount = violations.violation_count;

      // Se dentro da janela de tempo
      if (firstViolation > windowStart) {
        if (violationCount >= config.max) {
          // Rate limit excedido
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
          await this.db('rate_limit_violations')
            .where('identifier', identifier)
            .where('limit_type', limitType)
            .update({
              violation_count: this.db.raw('violation_count + 1'),
              last_violation: new Date(),
              is_blocked: true,
              expires_at: expiresAt
            });

          await this.logSecurityEvent('rate_limit_exceeded', 'MEDIUM', identifier, null, null, {
            limitType,
            violationCount: violationCount + 1,
            maxAllowed: config.max
          }, 'CONNECTION_RATE_LIMITED');

          return {
            allowed: false,
            reason: `Rate limit exceeded: ${violationCount + 1}/${config.max} in ${config.windowMs / 1000}s`
          };
        } else {
          // Dentro do limite - incrementar contador
          await this.db('rate_limit_violations')
            .where('identifier', identifier)
            .where('limit_type', limitType)
            .update({
              violation_count: this.db.raw('violation_count + 1'),
              last_violation: new Date()
            });
        }
      } else {
        // Janela expirou - reset contador
        await this.db('rate_limit_violations')
          .where('identifier', identifier)
          .where('limit_type', limitType)
          .update({
            violation_count: 1,
            first_violation: new Date(),
            last_violation: new Date(),
            is_blocked: false,
            expires_at: null
          });
      }

      return { allowed: true };

    } catch (error) {
      logger.error('Error checking rate limit:', error);
      return { allowed: true }; // Allow on error
    }
  }

  private async checkIPReputation(ipAddress: string): Promise<SecurityValidation> {
    try {
      // Verificar reputação interna
      const reputation = await this.db('ip_reputation')
        .select('reputation_score', 'total_connections', 'spam_reports')
        .where('ip_address', ipAddress)
        .first();

      if (reputation) {
        const score = reputation.reputation_score;
        const spamRate = reputation.spam_reports / Math.max(reputation.total_connections, 1);

        // Score baixo ou alta taxa de spam
        if (score < 0.3 || spamRate > 0.5) {
          return {
            allowed: false,
            reason: `Poor IP reputation: score=${score.toFixed(2)}, spam_rate=${(spamRate * 100).toFixed(1)}%`,
            details: { score, spamRate, totalConnections: reputation.total_connections }
          };
        }
      }

      // Verificar blacklists externas
      const blacklistCheck = await this.queryExternalBlacklists(ipAddress);
      if (!blacklistCheck.allowed) {
        // Adicionar à blacklist local
        await this.addToBlacklist(ipAddress, `Listed in external blacklist: ${blacklistCheck.source}`);
        return blacklistCheck;
      }

      return { allowed: true };

    } catch (error) {
      logger.error('Error checking IP reputation:', error);
      return { allowed: true };
    }
  }

  private async queryExternalBlacklists(ipAddress: string): Promise<SecurityValidation> {
    const blacklists = [
      'zen.spamhaus.org',
      'bl.spamcop.net',
      'dnsbl.sorbs.net',
      'psbl.surriel.com',
      'spam.dnsbl.anonmails.de'
    ];

    for (const blacklist of blacklists) {
      try {
        const listed = await this.queryDNSBL(ipAddress, blacklist);
        if (listed) {
          logger.warn(`IP ${ipAddress} found in blacklist ${blacklist}`);
          return {
            allowed: false,
            reason: `IP listed in ${blacklist}`,
            source: blacklist
          };
        }
      } catch (error) {
        logger.debug(`Error querying ${blacklist}:`, error);
        continue;
      }
    }

    return { allowed: true };
  }

  private async queryDNSBL(ipAddress: string, dnsbl: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      
      try {
        const reversedIP = ipAddress.split('.').reverse().join('.');
        const query = `${reversedIP}.${dnsbl}`;
        
        dns.resolve4(query, (err, addresses) => {
          clearTimeout(timeout);
          resolve(!err && addresses && addresses.length > 0);
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  private async validateReverseDNS(ipAddress: string, hostname: string): Promise<{ valid: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ valid: false, reason: 'DNS timeout' });
      }, 10000);

      dns.reverse(ipAddress, (err, hostnames) => {
        clearTimeout(timeout);
        
        if (err) {
          resolve({ valid: false, reason: 'No reverse DNS record' });
          return;
        }

        const matches = hostnames.some(h => 
          h.toLowerCase() === hostname.toLowerCase() ||
          hostname.toLowerCase().endsWith(`.${h.toLowerCase()}`)
        );

        if (!matches) {
          resolve({ 
            valid: false, 
            reason: `Reverse DNS mismatch: expected ${hostname}, got ${hostnames.join(', ')}` 
          });
        } else {
          resolve({ valid: true });
        }
      });
    });
  }

  private async analyzeSpam(emailData: ParsedMail, session: any): Promise<SpamAnalysisResult> {
    let totalScore = 0;
    const details = {
      subjectScore: 0,
      bodyScore: 0,
      headerScore: 0,
      attachmentScore: 0
    };

    try {
      // 1. Análise do assunto
      if (emailData.subject) {
        const subjectLower = emailData.subject.toLowerCase();
        let subjectScore = 0;

        // Verificar palavras-chave de spam
        for (const keyword of this.spamKeywords) {
          if (subjectLower.includes(keyword)) {
            subjectScore += 1.5;
          }
        }

        // Verificar padrões suspeitos
        if (/re:\s*re:\s*re:/i.test(emailData.subject)) subjectScore += 2; // Múltiplos RE:
        if (/urgent|immediate|act now/i.test(subjectLower)) subjectScore += 2;
        if (/free|winner|congratulations/i.test(subjectLower)) subjectScore += 1;
        if (/\$\d+|\d+%\s*off/i.test(subjectLower)) subjectScore += 1; // Preços/descontos
        if (/[A-Z]{5,}/.test(emailData.subject)) subjectScore += 1; // Muito maiúsculo

        details.subjectScore = subjectScore;
        totalScore += subjectScore;
      }

      // 2. Análise do corpo
      if (emailData.text || emailData.html) {
        const bodyText = (emailData.text || emailData.html || '').toLowerCase();
        let bodyScore = 0;

        // Verificar palavras-chave de spam
        for (const keyword of this.spamKeywords) {
          const matches = (bodyText.match(new RegExp(keyword, 'gi')) || []).length;
          bodyScore += matches * 0.5;
        }

        // Verificar padrões suspeitos
        const urlCount = (bodyText.match(/https?:\/\/[^\s]+/gi) || []).length;
        if (urlCount > 10) bodyScore += 2; // Muitos links

        const phoneNumbers = (bodyText.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || []).length;
        if (phoneNumbers > 3) bodyScore += 1; // Muitos telefones

        if (/click here|clique aqui/gi.test(bodyText)) bodyScore += 1;
        if (/limited time|tempo limitado/gi.test(bodyText)) bodyScore += 1;

        details.bodyScore = bodyScore;
        totalScore += bodyScore;
      }

      // 3. Análise de cabeçalhos
      let headerScore = 0;
      
      // Verificar From vs Reply-To
      const fromDomain = this.extractDomain(emailData.from?.text || '');
      const replyToDomain = this.extractDomain(emailData.replyTo?.text || '');
      
      if (fromDomain && replyToDomain && fromDomain !== replyToDomain) {
        headerScore += 1; // Domínios diferentes
      }

      // Verificar ausência de Message-ID
      if (!emailData.messageId) {
        headerScore += 1;
      }

      details.headerScore = headerScore;
      totalScore += headerScore;

      // 4. Análise de anexos
      let attachmentScore = 0;
      
      if (emailData.attachments) {
        for (const attachment of emailData.attachments) {
          const filename = attachment.filename?.toLowerCase() || '';
          
          // Extensões perigosas
          if (/\.(exe|scr|bat|cmd|pif|zip|rar)$/i.test(filename)) {
            attachmentScore += 3;
          }
          
          // Nomes suspeitos
          if (/invoice|receipt|document|important/i.test(filename)) {
            attachmentScore += 1;
          }
        }
      }

      details.attachmentScore = attachmentScore;
      totalScore += attachmentScore;

      // 5. Salvar análise
      const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const isSpam = totalScore >= this.SPAM_THRESHOLD;

      await this.db('spam_analysis').insert({
        email_id: emailId,
        spam_score: totalScore,
        is_spam: isSpam,
        reason: isSpam ? this.generateSpamReason(details) : null,
        details: JSON.stringify(details),
        sender_ip: session.remoteAddress,
        sender_email: emailData.from?.text,
        subject_hash: this.hashSubject(emailData.subject || '')
      });

      return {
        isSpam,
        score: totalScore,
        reason: isSpam ? this.generateSpamReason(details) : '',
        details
      };

    } catch (error) {
      logger.error('Error analyzing spam:', error);
      return {
        isSpam: false,
        score: 0,
        reason: '',
        details
      };
    }
  }

  private async detectPhishing(emailData: ParsedMail): Promise<PhishingDetectionResult> {
    const indicators: string[] = [];
    let confidence = 0;

    try {
      const fromDomain = this.extractDomain(emailData.from?.text || '');
      const bodyText = (emailData.text || emailData.html || '').toLowerCase();
      const subject = (emailData.subject || '').toLowerCase();

      // 1. Verificar domínios conhecidos de phishing
      if (fromDomain && this.phishingDomains.has(fromDomain)) {
        indicators.push(`Known phishing domain: ${fromDomain}`);
        confidence += 0.5;
      }

      // 2. Verificar imitação de bancos/serviços
      const bankPatterns = [
        /banco\s*(do\s*)?brasil/i,
        /bradesco/i,
        /itau|itaú/i,
        /santander/i,
        /caixa\s*econômica/i,
        /paypal/i,
        /amazon/i,
        /microsoft/i,
        /google/i
      ];

      for (const pattern of bankPatterns) {
        if (pattern.test(subject) || pattern.test(bodyText)) {
          if (fromDomain && !this.isLegitimateInstitution(fromDomain)) {
            indicators.push('Impersonating financial institution');
            confidence += 0.3;
          }
        }
      }

      // 3. Verificar URLs suspeitas
      const urls = this.extractURLs(bodyText);
      for (const url of urls) {
        try {
          const urlDomain = new URL(url).hostname.toLowerCase();
          
          // Verificar domínios muito similares
          if (this.isSuspiciousDomain(urlDomain)) {
            indicators.push(`Suspicious URL domain: ${urlDomain}`);
            confidence += 0.2;
          }
          
          // Verificar URLs encurtadas suspeitas
          if (this.isShortenerDomain(urlDomain) && urls.length < 3) {
            indicators.push('URL shortener in financial context');
            confidence += 0.1;
          }
        } catch (e) {
          // URL inválida é suspeita
          indicators.push('Invalid URL found');
          confidence += 0.1;
        }
      }

      // 4. Verificar táticas de urgência
      const urgencyPatterns = [
        /sua\s+conta\s+.*(bloqueada|suspensa|expirada)/i,
        /confirme\s+.*(dados|informações|senha)/i,
        /atualize\s+.*cadastro/i,
        /acesso\s+.*negado/i,
        /verify\s+.*account/i,
        /suspend.*account/i
      ];

      for (const pattern of urgencyPatterns) {
        if (pattern.test(subject) || pattern.test(bodyText)) {
          indicators.push('Uses urgency tactics');
          confidence += 0.2;
          break;
        }
      }

      // 5. Verificar solicitação de dados pessoais
      if (/cpf|rg|senha|password|cartão|card|pin/i.test(bodyText)) {
        indicators.push('Requests personal information');
        confidence += 0.3;
      }

      const suspected = confidence >= this.PHISHING_CONFIDENCE_THRESHOLD;

      // 6. Salvar análise
      if (suspected) {
        const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.db('phishing_detection').insert({
          email_id: emailId,
          confidence_score: confidence,
          is_phishing: true,
          indicators: JSON.stringify(indicators),
          suspicious_urls: JSON.stringify(urls),
          sender_domain: fromDomain
        });
      }

      return {
        suspected,
        confidence,
        indicators
      };

    } catch (error) {
      logger.error('Error detecting phishing:', error);
      return {
        suspected: false,
        confidence: 0,
        indicators: []
      };
    }
  }

  private async scanForMalware(emailData: ParsedMail): Promise<MalwareScanResult> {
    try {
      if (!emailData.attachments || emailData.attachments.length === 0) {
        return { found: false };
      }

      for (const attachment of emailData.attachments) {
        const filename = attachment.filename?.toLowerCase() || '';
        const content = attachment.content;

        // 1. Verificar extensões perigosas
        const dangerousExtensions = [
          '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.msi', 
          '.jar', '.js', '.vbs', '.ps1', '.sh'
        ];

        const hasDangerousExt = dangerousExtensions.some(ext => filename.endsWith(ext));
        if (hasDangerousExt) {
          return {
            found: true,
            details: {
              type: 'dangerous_executable',
              signature: `Dangerous file extension: ${filename}`,
              file: filename
            }
          };
        }

        // 2. Verificar assinaturas simples de malware
        if (content && content.length > 0) {
          const contentStr = content.toString('hex').toLowerCase();
          
          // Assinaturas básicas (MZ header para executáveis)
          if (contentStr.startsWith('4d5a')) { // MZ header
            return {
              found: true,
              details: {
                type: 'executable_content',
                signature: 'PE executable detected in attachment',
                file: filename
              }
            };
          }
          
          // Verificar scripts embutidos
          const contentText = content.toString('utf8', 0, Math.min(1000, content.length));
          if (/eval\s*\(|document\.write|<script/i.test(contentText)) {
            return {
              found: true,
              details: {
                type: 'script_injection',
                signature: 'Suspicious script content detected',
                file: filename
              }
            };
          }
        }

        // 3. Verificar dupla extensão
        const doublExtPattern = /\.(jpg|gif|png|pdf|doc|docx)\.(exe|scr|bat)$/i;
        if (doublExtPattern.test(filename)) {
          return {
            found: true,
            details: {
              type: 'double_extension',
              signature: `Double extension detected: ${filename}`,
              file: filename
            }
          };
        }
      }

      return { found: false };

    } catch (error) {
      logger.error('Error scanning for malware:', error);
      return { found: false };
    }
  }

  private async updateIPReputation(ipAddress: string, actionType: string, success: boolean): Promise<void> {
    try {
      const existing = await this.db('ip_reputation')
        .select('id')
        .where('ip_address', ipAddress)
        .first();

      if (existing) {
        // Atualizar registro existente
        await this.db('ip_reputation')
          .where('ip_address', ipAddress)
          .update({
            total_connections: this.db.raw('total_connections + 1'),
            successful_connections: this.db.raw(`successful_connections + ${success ? 1 : 0}`),
            blocked_connections: this.db.raw(`blocked_connections + ${success ? 0 : 1}`),
            last_activity: new Date(),
            updated_at: new Date()
          });
      } else {
        // Criar novo registro
        await this.db('ip_reputation').insert({
          ip_address: ipAddress,
          total_connections: 1,
          successful_connections: success ? 1 : 0,
          blocked_connections: success ? 0 : 1,
          reputation_score: 1.0
        });
      }

      // Recalcular score de reputação
      await this.recalculateIPReputation(ipAddress);

    } catch (error) {
      logger.error('Error updating IP reputation:', error);
    }
  }

  private async recalculateIPReputation(ipAddress: string): Promise<void> {
    try {
      const stats = await this.db('ip_reputation')
        .select('total_connections', 'successful_connections', 'blocked_connections', 'spam_reports')
        .where('ip_address', ipAddress)
        .first();

      if (stats && stats.total_connections > 0) {
        const successRate = stats.successful_connections / stats.total_connections;
        const spamRate = stats.spam_reports / stats.total_connections;
        
        // Calcular score: base no sucesso, penalizado por spam
        let score = successRate;
        score -= (spamRate * 0.5);
        score = Math.max(0, Math.min(1, score)); // Entre 0 e 1

        await this.db('ip_reputation')
          .where('ip_address', ipAddress)
          .update({
            reputation_score: score,
            updated_at: new Date()
          });
      }
    } catch (error) {
      logger.error('Error recalculating IP reputation:', error);
    }
  }

  public async addToBlacklist(ipAddress: string, reason: string, expiresIn?: number): Promise<void> {
    try {
      const expiresAt = expiresIn 
        ? new Date(Date.now() + expiresIn).toISOString()
        : null;

      // Knex não suporta INSERT OR REPLACE diretamente, então fazemos UPSERT
      const existing = await this.db('security_blacklists')
        .where('ip_address', ipAddress)
        .first();
      
      if (existing) {
        await this.db('security_blacklists')
          .where('ip_address', ipAddress)
          .update({
            reason,
            is_active: true,
            expires_at: expiresAt
          });
      } else {
        await this.db('security_blacklists').insert({
          ip_address: ipAddress,
          reason,
          is_active: true,
          expires_at: expiresAt
        });
      }

      this.blacklistedIPs.add(ipAddress);

      logger.info('IP added to blacklist', { 
        ipAddress, 
        reason, 
        expires: expiresAt 
      });

    } catch (error) {
      logger.error('Error adding IP to blacklist:', error);
    }
  }

  private async logSecurityEvent(
    eventType: string, 
    severity: string, 
    sourceIp?: string, 
    userId?: number, 
    sessionId?: string, 
    details?: any, 
    actionTaken?: string
  ): Promise<void> {
    try {
      await this.db('security_logs').insert({
        event_type: eventType,
        severity,
        source_ip: sourceIp,
        user_id: userId,
        session_id: sessionId,
        details: details ? JSON.stringify(details) : null,
        action_taken: actionTaken
      });
    } catch (error) {
      logger.error('Error logging security event:', error);
    }
  }

  // Métodos auxiliares
  private extractDomain(email: string): string | null {
    const match = email.match(/<(.+)>/) || email.match(/([^@]+@([^>]+))/);
    if (match) {
      const fullEmail = match[1] || match[0];
      const atIndex = fullEmail.lastIndexOf('@');
      if (atIndex > -1) {
        return fullEmail.substring(atIndex + 1).toLowerCase().trim();
      }
    }
    return null;
  }

  private extractURLs(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"\[\]{}|\\^`]+/gi;
    return text.match(urlRegex) || [];
  }

  private isSuspiciousDomain(domain: string): boolean {
    // Verificar caracteres suspeitos
    if (/[0-9]+[a-z]+[0-9]+/.test(domain)) return true; // Mistura números e letras
    if (/xn--/.test(domain)) return true; // Punycode (IDN homograph)
    if (domain.length > 50) return true; // Domínio muito longo
    
    // Verificar imitações de domínios conhecidos
    const legitimateDomains = ['google.com', 'microsoft.com', 'amazon.com', 'paypal.com'];
    for (const legitimate of legitimateDomains) {
      if (this.calculateSimilarity(domain, legitimate) > 0.8 && domain !== legitimate) {
        return true;
      }
    }
    
    return false;
  }

  private isShortenerDomain(domain: string): boolean {
    const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd'];
    return shorteners.includes(domain);
  }

  private isLegitimateInstitution(domain: string): boolean {
    const legitimate = [
      'bb.com.br', 'bradesco.com.br', 'itau.com.br', 'santander.com.br',
      'caixa.gov.br', 'paypal.com', 'amazon.com', 'microsoft.com'
    ];
    return legitimate.some(legit => domain.endsWith(legit));
  }

  private generateSpamReason(details: any): string {
    const reasons = [];
    if (details.subjectScore > 2) reasons.push('suspicious subject');
    if (details.bodyScore > 3) reasons.push('spam keywords in body');
    if (details.headerScore > 1) reasons.push('suspicious headers');
    if (details.attachmentScore > 2) reasons.push('dangerous attachments');
    
    return reasons.join(', ') || 'high spam score';
  }

  private hashSubject(subject: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(subject.toLowerCase()).digest('hex');
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  public async getSecurityStats(): Promise<any> {
    try {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [blacklistedCount, reputationStats, spamStats, phishingStats]: any[] = await Promise.all([
        this.db('security_blacklists').count('* as count').where('is_active', true).first(),
        this.db('ip_reputation').select(
          this.db.raw('COUNT(*) as total'),
          this.db.raw('AVG(reputation_score) as avgScore')
        ).first(),
        this.db('spam_analysis').select(
          this.db.raw('COUNT(*) as total'),
          this.db.raw('SUM(CASE WHEN is_spam = 1 THEN 1 ELSE 0 END) as spam')
        ).where('analyzed_at', '>', last24h).first(),
        this.db('phishing_detection').select(
          this.db.raw('COUNT(*) as total'),
          this.db.raw('SUM(CASE WHEN is_phishing = 1 THEN 1 ELSE 0 END) as phishing')
        ).where('detected_at', '>', last24h).first()
      ]);

      return {
        blacklisted_ips: blacklistedCount.count,
        reputation: {
          total_ips: reputationStats.total,
          average_score: parseFloat((reputationStats.avgScore || 0).toFixed(2))
        },
        last_24h: {
          emails_analyzed: spamStats.total,
          spam_detected: spamStats.spam,
          phishing_detected: phishingStats.phishing
        },
        status: 'active'
      };
    } catch (error) {
      logger.error('Error getting security stats:', error);
      return { error: 'Failed to get security stats' };
    }
  }

  async close(): Promise<void> {
    try {
      await this.db.destroy();
      logger.info('SecurityManager: Conexão fechada');
    } catch (error) {
      logger.error('Erro ao fechar conexão do SecurityManager:', error);
      throw error;
    }
  }
}