import { logger } from '../config/logger';
import { Database } from 'sqlite3';
import { promisify } from 'util';
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
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;
  
  private blacklistedIPs: Set<string> = new Set();
  private rateLimiters: Map<string, Map<string, { count: number; window: number }>> = new Map();
  private spamKeywords: Set<string> = new Set();
  private phishingDomains: Set<string> = new Set();
  
  private readonly SPAM_THRESHOLD = 5.0;
  private readonly PHISHING_CONFIDENCE_THRESHOLD = 0.7;

  constructor(database?: Database) {
    this.db = database || new Database('./database.sqlite');
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
    
    this.initializeTables();
    this.loadSecurityData();
  }

  private async initializeTables(): Promise<void> {
    try {
      // Tabela de blacklists de IPs
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS security_blacklists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address TEXT UNIQUE NOT NULL,
          reason TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          added_by TEXT DEFAULT 'system',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          last_seen DATETIME
        )
      `);

      // Tabela de rate limiting
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS rate_limit_violations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          identifier TEXT NOT NULL,
          limit_type TEXT NOT NULL,
          violation_count INTEGER DEFAULT 1,
          first_violation DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_violation DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_blocked BOOLEAN DEFAULT 0,
          expires_at DATETIME
        )
      `);

      // Tabela de análise de spam
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS spam_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email_id TEXT,
          spam_score REAL NOT NULL,
          is_spam BOOLEAN NOT NULL,
          reason TEXT,
          details TEXT,
          sender_ip TEXT,
          sender_email TEXT,
          subject_hash TEXT,
          analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de detecção de phishing
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS phishing_detection (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email_id TEXT,
          confidence_score REAL NOT NULL,
          is_phishing BOOLEAN NOT NULL,
          indicators TEXT,
          suspicious_urls TEXT,
          sender_domain TEXT,
          detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de reputação de IPs
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS ip_reputation (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address TEXT UNIQUE NOT NULL,
          reputation_score REAL DEFAULT 1.0,
          total_connections INTEGER DEFAULT 0,
          successful_connections INTEGER DEFAULT 0,
          blocked_connections INTEGER DEFAULT 0,
          spam_reports INTEGER DEFAULT 0,
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de logs de segurança
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS security_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          source_ip TEXT,
          user_id INTEGER,
          session_id TEXT,
          details TEXT,
          action_taken TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Índices para performance
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_blacklists_ip ON security_blacklists(ip_address, is_active)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_violations(identifier, limit_type)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_ip_reputation_ip ON ip_reputation(ip_address)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp)`);

      logger.info('SecurityManager: Tabelas de segurança inicializadas com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar tabelas de segurança:', error);
      throw error;
    }
  }

  private async loadSecurityData(): Promise<void> {
    try {
      // Carregar blacklists ativas
      const blacklists = await this.dbAll(`
        SELECT ip_address, reason 
        FROM security_blacklists 
        WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
      `);

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
      const violations = await this.dbGet(`
        SELECT violation_count, first_violation, last_violation, is_blocked, expires_at
        FROM rate_limit_violations 
        WHERE identifier = ? AND limit_type = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `, [identifier, limitType]);

      if (!violations) {
        // Primeira conexão - criar registro
        await this.dbRun(`
          INSERT INTO rate_limit_violations (identifier, limit_type, violation_count)
          VALUES (?, ?, 1)
        `, [identifier, limitType]);
        
        return { allowed: true };
      }

      const firstViolation = new Date(violations.first_violation).getTime();
      const violationCount = violations.violation_count;

      // Se dentro da janela de tempo
      if (firstViolation > windowStart) {
        if (violationCount >= config.max) {
          // Rate limit excedido
          await this.dbRun(`
            UPDATE rate_limit_violations 
            SET violation_count = violation_count + 1,
                last_violation = CURRENT_TIMESTAMP,
                is_blocked = 1,
                expires_at = datetime('now', '+1 hour')
            WHERE identifier = ? AND limit_type = ?
          `, [identifier, limitType]);

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
          await this.dbRun(`
            UPDATE rate_limit_violations 
            SET violation_count = violation_count + 1,
                last_violation = CURRENT_TIMESTAMP
            WHERE identifier = ? AND limit_type = ?
          `, [identifier, limitType]);
        }
      } else {
        // Janela expirou - reset contador
        await this.dbRun(`
          UPDATE rate_limit_violations 
          SET violation_count = 1,
              first_violation = CURRENT_TIMESTAMP,
              last_violation = CURRENT_TIMESTAMP,
              is_blocked = 0,
              expires_at = NULL
            WHERE identifier = ? AND limit_type = ?
        `, [identifier, limitType]);
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
      const reputation = await this.dbGet(`
        SELECT reputation_score, total_connections, spam_reports
        FROM ip_reputation 
        WHERE ip_address = ?
      `, [ipAddress]);

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

      await this.dbRun(`
        INSERT INTO spam_analysis (
          email_id, spam_score, is_spam, reason, details, 
          sender_ip, sender_email, subject_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        emailId,
        totalScore,
        isSpam ? 1 : 0,
        isSpam ? this.generateSpamReason(details) : null,
        JSON.stringify(details),
        session.remoteAddress,
        emailData.from?.text,
        this.hashSubject(emailData.subject || '')
      ]);

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
        
        await this.dbRun(`
          INSERT INTO phishing_detection (
            email_id, confidence_score, is_phishing, indicators, 
            suspicious_urls, sender_domain
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          emailId,
          confidence,
          1,
          JSON.stringify(indicators),
          JSON.stringify(urls),
          fromDomain
        ]);
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
      const existing = await this.dbGet(`
        SELECT id FROM ip_reputation WHERE ip_address = ?
      `, [ipAddress]);

      if (existing) {
        // Atualizar registro existente
        await this.dbRun(`
          UPDATE ip_reputation SET
            total_connections = total_connections + 1,
            successful_connections = successful_connections + ?,
            blocked_connections = blocked_connections + ?,
            last_activity = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE ip_address = ?
        `, [success ? 1 : 0, success ? 0 : 1, ipAddress]);
      } else {
        // Criar novo registro
        await this.dbRun(`
          INSERT INTO ip_reputation (
            ip_address, total_connections, successful_connections, 
            blocked_connections, reputation_score
          ) VALUES (?, 1, ?, ?, 1.0)
        `, [ipAddress, success ? 1 : 0, success ? 0 : 1]);
      }

      // Recalcular score de reputação
      await this.recalculateIPReputation(ipAddress);

    } catch (error) {
      logger.error('Error updating IP reputation:', error);
    }
  }

  private async recalculateIPReputation(ipAddress: string): Promise<void> {
    try {
      const stats = await this.dbGet(`
        SELECT total_connections, successful_connections, blocked_connections, spam_reports
        FROM ip_reputation WHERE ip_address = ?
      `, [ipAddress]);

      if (stats && stats.total_connections > 0) {
        const successRate = stats.successful_connections / stats.total_connections;
        const spamRate = stats.spam_reports / stats.total_connections;
        
        // Calcular score: base no sucesso, penalizado por spam
        let score = successRate;
        score -= (spamRate * 0.5);
        score = Math.max(0, Math.min(1, score)); // Entre 0 e 1

        await this.dbRun(`
          UPDATE ip_reputation SET 
            reputation_score = ?, 
            updated_at = CURRENT_TIMESTAMP 
          WHERE ip_address = ?
        `, [score, ipAddress]);
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

      await this.dbRun(`
        INSERT OR REPLACE INTO security_blacklists 
        (ip_address, reason, is_active, expires_at) 
        VALUES (?, ?, 1, ?)
      `, [ipAddress, reason, expiresAt]);

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
      await this.dbRun(`
        INSERT INTO security_logs (
          event_type, severity, source_ip, user_id, session_id, 
          details, action_taken
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        eventType, 
        severity, 
        sourceIp, 
        userId, 
        sessionId, 
        details ? JSON.stringify(details) : null, 
        actionTaken
      ]);
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
      const [blacklistedCount, reputationStats, spamStats, phishingStats] = await Promise.all([
        this.dbGet('SELECT COUNT(*) as count FROM security_blacklists WHERE is_active = 1'),
        this.dbGet('SELECT COUNT(*) as total, AVG(reputation_score) as avgScore FROM ip_reputation'),
        this.dbGet('SELECT COUNT(*) as total, SUM(CASE WHEN is_spam = 1 THEN 1 ELSE 0 END) as spam FROM spam_analysis WHERE analyzed_at > datetime("now", "-24 hours")'),
        this.dbGet('SELECT COUNT(*) as total, SUM(CASE WHEN is_phishing = 1 THEN 1 ELSE 0 END) as phishing FROM phishing_detection WHERE detected_at > datetime("now", "-24 hours")')
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
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Erro ao fechar conexão do SecurityManager:', err);
          reject(err);
        } else {
          logger.info('SecurityManager: Conexão fechada');
          resolve();
        }
      });
    });
  }
}