import { DNSUtils, DNSVerificationResult, SPFRecord, DKIMRecord, DMARCRecord } from '../utils/dnsUtils';
import db from '../config/database';

export interface DomainVerificationConfig {
  domain: string;
  verificationToken: string;
  dkimSelector: string;
  userId: number;
}

export interface VerificationResult {
  success: boolean;
  domain: string;
  ownership: {
    verified: boolean;
    error?: string;
    record?: string;
  };
  spf: {
    verified: boolean;
    error?: string;
    record?: SPFRecord;
  };
  dkim: {
    verified: boolean;
    error?: string;
    record?: DKIMRecord;
  };
  dmarc: {
    verified: boolean;
    error?: string;
    record?: DMARCRecord;
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
  verification_token: string;
  dkim_selector: string;
  last_verification_attempt?: Date;
  verification_errors?: string;
}

export class DomainVerificationService {
  private static readonly VERIFICATION_TIMEOUT = 60000; // 60 seconds
  private static readonly CACHE_TTL = 300000; // 5 minutes
  private static cache: Map<string, { result: VerificationResult; timestamp: Date }> = new Map();

  private logVerificationAttempt(
    domain: string, 
    action: string, 
    result: 'success' | 'error', 
    message?: string
  ): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] DOMAIN_VERIFICATION: ${action} for ${domain} - ${result.toUpperCase()}${message ? ': ' + message : ''}`;
    
    if (result === 'error') {
      console.error(logMessage);
    } else {
      console.info(logMessage);
    }
  }

  private getCachedResult(domain: string): VerificationResult | null {
    const cached = DomainVerificationService.cache.get(domain);
    if (!cached) return null;

    const now = new Date();
    const timeDiff = now.getTime() - cached.timestamp.getTime();
    
    if (timeDiff > DomainVerificationService.CACHE_TTL) {
      DomainVerificationService.cache.delete(domain);
      return null;
    }

    return cached.result;
  }

  private setCachedResult(domain: string, result: VerificationResult): void {
    DomainVerificationService.cache.set(domain, {
      result,
      timestamp: new Date()
    });
  }

  public async verifyDomain(config: DomainVerificationConfig): Promise<VerificationResult> {
    const { domain, verificationToken, dkimSelector } = config;
    
    this.logVerificationAttempt(domain, 'START_VERIFICATION', 'success');

    // Check cache first
    const cachedResult = this.getCachedResult(domain);
    if (cachedResult) {
      this.logVerificationAttempt(domain, 'CACHE_HIT', 'success');
      return cachedResult;
    }

    const result: VerificationResult = {
      success: false,
      domain,
      ownership: { verified: false },
      spf: { verified: false },
      dkim: { verified: false },
      dmarc: { verified: false },
      timestamp: new Date(),
      errors: []
    };

    try {
      // Validate domain name first
      if (!DNSUtils.validateDomainName(domain)) {
        const error = 'Invalid domain name format';
        result.errors.push(error);
        this.logVerificationAttempt(domain, 'DOMAIN_VALIDATION', 'error', error);
        return result;
      }

      // Run all verifications in parallel for better performance
      const [ownershipResult, spfResult, dkimResult, dmarcResult] = await Promise.all([
        this.timeoutPromise(this.verifyOwnership(domain, verificationToken), DomainVerificationService.VERIFICATION_TIMEOUT),
        this.timeoutPromise(this.verifySPF(domain), DomainVerificationService.VERIFICATION_TIMEOUT),
        this.timeoutPromise(this.verifyDKIM(domain, dkimSelector), DomainVerificationService.VERIFICATION_TIMEOUT),
        this.timeoutPromise(this.verifyDMARC(domain), DomainVerificationService.VERIFICATION_TIMEOUT)
      ]);

      result.ownership = ownershipResult;
      result.spf = spfResult;
      result.dkim = dkimResult;
      result.dmarc = dmarcResult;

      // Overall success if at least ownership is verified
      result.success = result.ownership.verified;

      // Log individual results
      this.logVerificationAttempt(
        domain, 
        'OWNERSHIP_CHECK', 
        result.ownership.verified ? 'success' : 'error',
        result.ownership.error
      );

      this.logVerificationAttempt(
        domain, 
        'SPF_CHECK', 
        result.spf.verified ? 'success' : 'error',
        result.spf.error
      );

      this.logVerificationAttempt(
        domain, 
        'DKIM_CHECK', 
        result.dkim.verified ? 'success' : 'error',
        result.dkim.error
      );

      this.logVerificationAttempt(
        domain, 
        'DMARC_CHECK', 
        result.dmarc.verified ? 'success' : 'error',
        result.dmarc.error
      );

      // Cache successful results
      if (result.success) {
        this.setCachedResult(domain, result);
      }

      this.logVerificationAttempt(
        domain, 
        'COMPLETE_VERIFICATION', 
        result.success ? 'success' : 'error',
        `Overall success: ${result.success}`
      );

      return result;

    } catch (error: any) {
      const errorMessage = `Verification failed: ${error.message}`;
      result.errors.push(errorMessage);
      this.logVerificationAttempt(domain, 'VERIFICATION_ERROR', 'error', errorMessage);
      return result;
    }
  }

  private async timeoutPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      )
    ]);
  }

  private async verifyOwnership(
    domain: string, 
    verificationToken: string
  ): Promise<VerificationResult['ownership']> {
    try {
      const isVerified = await DNSUtils.verifyDomainOwnership(domain, verificationToken);
      
      if (isVerified) {
        return {
          verified: true,
          record: `_ultrazend-verification.${domain} TXT "ultrazend-verification=${verificationToken}"`
        };
      } else {
        return {
          verified: false,
          error: 'Verification TXT record not found or incorrect'
        };
      }
    } catch (error: any) {
      return {
        verified: false,
        error: `Ownership verification error: ${error.message}`
      };
    }
  }

  private async verifySPF(domain: string): Promise<VerificationResult['spf']> {
    try {
      const spfResult = await DNSUtils.verifySPFRecord(domain);
      
      return {
        verified: spfResult.valid,
        error: spfResult.error,
        record: spfResult.record
      };
    } catch (error: any) {
      return {
        verified: false,
        error: `SPF verification error: ${error.message}`
      };
    }
  }

  private async verifyDKIM(
    domain: string, 
    selector: string
  ): Promise<VerificationResult['dkim']> {
    try {
      const dkimResult = await DNSUtils.verifyDKIMRecord(domain, selector);
      
      return {
        verified: dkimResult.valid,
        error: dkimResult.error,
        record: dkimResult.record
      };
    } catch (error: any) {
      return {
        verified: false,
        error: `DKIM verification error: ${error.message}`
      };
    }
  }

  private async verifyDMARC(domain: string): Promise<VerificationResult['dmarc']> {
    try {
      const dmarcResult = await DNSUtils.verifyDMARCRecord(domain);
      
      return {
        verified: dmarcResult.valid,
        error: dmarcResult.error,
        record: dmarcResult.record
      };
    } catch (error: any) {
      return {
        verified: false,
        error: `DMARC verification error: ${error.message}`
      };
    }
  }

  public async updateDomainStatus(
    domainId: number, 
    verificationResult: VerificationResult
  ): Promise<void> {
    try {
      const updateData = {
        is_verified: verificationResult.ownership.verified,
        spf_enabled: verificationResult.spf.verified,
        dkim_enabled: verificationResult.dkim.verified,
        dmarc_enabled: verificationResult.dmarc.verified,
        last_verification_attempt: new Date(),
        verification_errors: verificationResult.errors.length > 0 
          ? JSON.stringify(verificationResult.errors) 
          : null,
        updated_at: new Date()
      };

      // Only set verified_at if ownership is verified and wasn't verified before
      const currentDomain = await db('domains').where('id', domainId).first();
      if (verificationResult.ownership.verified && !currentDomain?.is_verified) {
        (updateData as any).verified_at = new Date();
      }

      await db('domains').where('id', domainId).update(updateData);

      this.logVerificationAttempt(
        verificationResult.domain,
        'DATABASE_UPDATE',
        'success',
        `Domain ID ${domainId} updated in database`
      );

    } catch (error: any) {
      this.logVerificationAttempt(
        verificationResult.domain,
        'DATABASE_UPDATE',
        'error',
        `Failed to update domain ID ${domainId}: ${error.message}`
      );
      throw error;
    }
  }

  public async verifyAndUpdateDomain(domainId: number): Promise<VerificationResult> {
    try {
      // Get domain from database
      const domain = await db('domains').where('id', domainId).first();
      
      if (!domain) {
        throw new Error(`Domain with ID ${domainId} not found`);
      }

      const config: DomainVerificationConfig = {
        domain: domain.domain_name,
        verificationToken: domain.verification_token,
        dkimSelector: domain.dkim_selector || 'default',
        userId: domain.user_id
      };

      // Perform verification
      const result = await this.verifyDomain(config);

      // Update database with results
      await this.updateDomainStatus(domainId, result);

      return result;

    } catch (error: any) {
      this.logVerificationAttempt(
        'unknown',
        'VERIFY_AND_UPDATE',
        'error',
        `Domain ID ${domainId}: ${error.message}`
      );
      throw error;
    }
  }

  public async getDomainStatus(domainId: number): Promise<DomainStatus | null> {
    try {
      const domain = await db('domains')
        .select(
          'id',
          'domain_name',
          'is_verified',
          'spf_enabled',
          'dkim_enabled',
          'dmarc_enabled',
          'verification_token',
          'dkim_selector',
          'last_verification_attempt',
          'verification_errors'
        )
        .where('id', domainId)
        .first();

      return domain || null;

    } catch (error: any) {
      this.logVerificationAttempt(
        'unknown',
        'GET_DOMAIN_STATUS',
        'error',
        `Domain ID ${domainId}: ${error.message}`
      );
      throw error;
    }
  }

  public async getDNSInstructions(domainId: number): Promise<{
    domain: string;
    instructions: {
      ownership: string;
      spf: string;
      dkim: string;
      dmarc: string;
    }
  } | null> {
    try {
      const domain = await db('domains').where('id', domainId).first();
      
      if (!domain) {
        return null;
      }

      const dkimSelector = domain.dkim_selector || 'default';

      return {
        domain: domain.domain_name,
        instructions: {
          ownership: `_ultrazend-verification.${domain.domain_name} TXT "ultrazend-verification=${domain.verification_token}"`,
          spf: `${domain.domain_name} TXT "v=spf1 include:ultrazend.com.br ~all"`,
          dkim: `${dkimSelector}._domainkey.${domain.domain_name} TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY_HERE"`,
          dmarc: `_dmarc.${domain.domain_name} TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@ultrazend.com.br"`
        }
      };

    } catch (error: any) {
      this.logVerificationAttempt(
        'unknown',
        'GET_DNS_INSTRUCTIONS',
        'error',
        `Domain ID ${domainId}: ${error.message}`
      );
      throw error;
    }
  }

  public async retryVerification(
    domainId: number, 
    maxRetries: number = 3
  ): Promise<VerificationResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logVerificationAttempt(
          'unknown',
          'RETRY_ATTEMPT',
          'success',
          `Attempt ${attempt}/${maxRetries} for domain ID ${domainId}`
        );

        const result = await this.verifyAndUpdateDomain(domainId);
        
        if (result.success) {
          return result;
        }

        // If not successful, wait before retry (except on last attempt)
        if (attempt < maxRetries) {
          await this.delay(2000 * attempt); // Exponential backoff
        }

      } catch (error: any) {
        lastError = error;
        this.logVerificationAttempt(
          'unknown',
          'RETRY_ERROR',
          'error',
          `Attempt ${attempt}/${maxRetries} failed: ${error.message}`
        );

        if (attempt < maxRetries) {
          await this.delay(2000 * attempt);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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