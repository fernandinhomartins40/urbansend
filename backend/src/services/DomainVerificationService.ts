import db from '../config/database';
import { DomainSetupService, type VerificationResult as DomainSetupVerificationResult } from './DomainSetupService';

interface VerificationRecord {
  raw: string;
}

export interface DomainVerificationConfig {
  domain: string;
  dkimSelector: string;
  userId: number;
}

export interface VerificationResult {
  success: boolean;
  domain: string;
  mail_from_mx: {
    verified: boolean;
    error?: string;
    record?: VerificationRecord;
  };
  spf: {
    verified: boolean;
    error?: string;
    record?: VerificationRecord;
  };
  dkim: {
    verified: boolean;
    error?: string;
    record?: VerificationRecord;
  };
  dmarc: {
    verified: boolean;
    error?: string;
    record?: VerificationRecord;
  };
  timestamp: Date;
  errors: string[];
}

export interface DomainStatus {
  id: number;
  domain_name: string;
  is_verified: boolean;
  spf_enabled: boolean;
  dkim_enabled: boolean;
  dmarc_enabled: boolean;
  dkim_selector: string;
  last_verification_attempt?: Date;
  verification_errors?: string;
}

type DomainRow = {
  id: number;
  user_id: number;
  domain_name: string;
  dkim_selector?: string | null;
  dmarc_policy?: string | null;
  is_verified: boolean;
  spf_enabled: boolean;
  dkim_enabled: boolean;
  dmarc_enabled: boolean;
  last_verification_attempt?: Date;
  verification_errors?: string;
};

export class DomainVerificationService {
  private static readonly CACHE_TTL = 300000;
  private static cache: Map<string, { result: VerificationResult; timestamp: number }> = new Map();
  private readonly setupService = new DomainSetupService();

  private getCacheKey(userId: number, domain: string): string {
    return `${userId}:${domain.toLowerCase()}`;
  }

  private getCachedResult(key: string): VerificationResult | null {
    const cached = DomainVerificationService.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > DomainVerificationService.CACHE_TTL) {
      DomainVerificationService.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  private setCachedResult(key: string, result: VerificationResult): void {
    DomainVerificationService.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  private clearCachedResult(key: string): void {
    DomainVerificationService.cache.delete(key);
  }

  private mapStep(result: DomainSetupVerificationResult['results'][keyof DomainSetupVerificationResult['results']]) {
    return {
      verified: result.valid,
      error: result.error,
      record: result.actualValue ? { raw: result.actualValue } : undefined
    };
  }

  private collectErrors(result: DomainSetupVerificationResult): string[] {
    return Object.values(result.results)
      .filter((entry) => !entry.valid)
      .map((entry) => entry.error || `Expected ${entry.expectedValue}`);
  }

  private mapVerificationResult(result: DomainSetupVerificationResult): VerificationResult {
    return {
      success: result.all_passed,
      domain: result.domain,
      mail_from_mx: this.mapStep(result.results.mail_from_mx),
      spf: this.mapStep(result.results.spf),
      dkim: this.mapStep(result.results.dkim),
      dmarc: this.mapStep(result.results.dmarc),
      timestamp: new Date(result.verified_at),
      errors: this.collectErrors(result)
    };
  }

  public async verifyDomain(config: DomainVerificationConfig): Promise<VerificationResult> {
    const domain = await db('domains')
      .where('user_id', config.userId)
      .where('domain_name', config.domain)
      .first() as DomainRow | undefined;

    if (!domain) {
      throw new Error(`Domain ${config.domain} not found for user ${config.userId}`);
    }

    const cacheKey = this.getCacheKey(domain.user_id, domain.domain_name);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.verifyAndUpdateDomain(domain.id);

    if (result.success) {
      this.setCachedResult(cacheKey, result);
    }

    return result;
  }

  public async updateDomainStatus(domainId: number, verificationResult: VerificationResult): Promise<void> {
    const timestamp = verificationResult.timestamp || new Date();

    await db('domains')
      .where('id', domainId)
      .update({
        is_verified: verificationResult.success,
        spf_enabled: true,
        dkim_enabled: true,
        dmarc_enabled: true,
        verified_at: verificationResult.success ? timestamp : null,
        last_verification_attempt: timestamp,
        verification_errors: verificationResult.errors.length > 0
          ? JSON.stringify(verificationResult.errors)
          : null,
        updated_at: timestamp
      });
  }

  public async verifyAndUpdateDomain(domainId: number): Promise<VerificationResult> {
    const domain = await db('domains').where('id', domainId).first() as DomainRow | undefined;

    if (!domain) {
      throw new Error(`Domain with ID ${domainId} not found`);
    }

    const result = this.mapVerificationResult(
      await this.setupService.verifyDomainSetup(domain.user_id, domain.id)
    );
    const cacheKey = this.getCacheKey(domain.user_id, domain.domain_name);

    if (result.success) {
      this.setCachedResult(cacheKey, result);
    } else {
      this.clearCachedResult(cacheKey);
    }

    return result;
  }

  public async getDomainStatus(domainId: number): Promise<DomainStatus | null> {
    const domain = await db('domains')
      .select(
        'id',
        'domain_name',
        'is_verified',
        'spf_enabled',
        'dkim_enabled',
        'dmarc_enabled',
        'dkim_selector',
        'last_verification_attempt',
        'verification_errors'
      )
      .where('id', domainId)
      .first();

    return domain || null;
  }

  public async getDNSInstructions(domainId: number): Promise<{
    domain: string;
    instructions: {
      mail_from_mx: string;
      spf: string;
      dkim: string;
      dmarc: string;
    };
  } | null> {
    const domain = await db('domains').where('id', domainId).first() as DomainRow | undefined;

    if (!domain) {
      return null;
    }

    const dkimSelector = domain.dkim_selector || 'default';
    const dmarcPolicy = domain.dmarc_policy || 'none';

    return {
      domain: domain.domain_name,
      instructions: {
        mail_from_mx: `uz-mail.${domain.domain_name} MX 10 mail.ultrazend.com.br`,
        spf: `uz-mail.${domain.domain_name} TXT "v=spf1 include:ultrazend.com.br -all"`,
        dkim: `${dkimSelector}._domainkey.${domain.domain_name} TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY_HERE"`,
        dmarc: `_dmarc.${domain.domain_name} TXT "v=DMARC1; p=${dmarcPolicy}"`
      }
    };
  }

  public async retryVerification(domainId: number, maxRetries: number = 3): Promise<VerificationResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.verifyAndUpdateDomain(domainId);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  public static clearCache(): void {
    this.cache.clear();
  }

  public static getCacheStats(): { size: number; domains: string[] } {
    return {
      size: this.cache.size,
      domains: Array.from(this.cache.keys())
    };
  }
}
