import dns from 'dns/promises';
import * as dnsPacket from 'dns-packet';

export interface DNSRecord {
  type: string;
  name: string;
  data: string;
  ttl?: number;
}

export interface DNSVerificationResult {
  success: boolean;
  records: DNSRecord[];
  errors: string[];
  recordType: string;
  domain: string;
}

export interface SPFRecord {
  version: string;
  mechanisms: string[];
  qualifier: string;
  raw: string;
}

export interface DKIMRecord {
  version: string;
  keyType: string;
  publicKey: string;
  serviceTypes: string[];
  raw: string;
}

export interface DMARCRecord {
  version: string;
  policy: string;
  subdomainPolicy?: string;
  percentage?: number;
  reportingEmail?: string;
  raw: string;
}

export class DNSUtils {
  private static readonly TIMEOUT_MS = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 2000; // 2 seconds

  public static async resolveTXTRecords(domain: string): Promise<DNSVerificationResult> {
    return this.performDNSLookup(domain, 'TXT', dns.resolveTxt);
  }

  public static async resolveMXRecords(domain: string): Promise<DNSVerificationResult> {
    return this.performDNSLookup(domain, 'MX', dns.resolveMx);
  }

  public static async resolveARecords(domain: string): Promise<DNSVerificationResult> {
    return this.performDNSLookup(domain, 'A', dns.resolve4);
  }

  private static async performDNSLookup(
    domain: string,
    recordType: string,
    resolver: Function
  ): Promise<DNSVerificationResult> {
    const result: DNSVerificationResult = {
      success: false,
      records: [],
      errors: [],
      recordType,
      domain
    };

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const records = await Promise.race([
          resolver(domain),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DNS lookup timeout')), this.TIMEOUT_MS)
          )
        ]);

        result.records = this.formatRecords(records, recordType);
        result.success = true;
        return result;

      } catch (error: any) {
        const errorMsg = `Attempt ${attempt}/${this.MAX_RETRIES}: ${error.message}`;
        result.errors.push(errorMsg);

        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.RETRY_DELAY_MS * attempt); // Exponential backoff
        }
      }
    }

    return result;
  }

  private static formatRecords(records: any[], recordType: string): DNSRecord[] {
    if (!Array.isArray(records)) {
      return [];
    }

    return records.map((record, index) => {
      let data: string;
      let name: string = '';

      switch (recordType) {
        case 'TXT':
          data = Array.isArray(record) ? record.join('') : record;
          break;
        case 'MX':
          data = `${record.priority} ${record.exchange}`;
          name = record.exchange;
          break;
        case 'A':
          data = record;
          break;
        default:
          data = String(record);
      }

      return {
        type: recordType,
        name,
        data,
        ttl: 300 // Default TTL
      };
    });
  }

  public static async verifyTXTRecord(domain: string, expectedValue: string): Promise<boolean> {
    try {
      const result = await this.resolveTXTRecords(domain);
      
      if (!result.success) {
        return false;
      }

      return result.records.some(record => 
        record.data.includes(expectedValue) || record.data === expectedValue
      );

    } catch (error) {
      return false;
    }
  }

  public static parseSPFRecord(txtRecord: string): SPFRecord | null {
    if (!txtRecord.startsWith('v=spf1')) {
      return null;
    }

    const parts = txtRecord.split(' ').filter(part => part.length > 0);
    const mechanisms: string[] = [];
    let qualifier = 'neutral'; // Default qualifier

    for (const part of parts) {
      if (part === 'v=spf1') continue;
      
      if (part.startsWith('include:') || part.startsWith('a:') || 
          part.startsWith('mx:') || part.startsWith('ip4:') || 
          part.startsWith('ip6:') || part.startsWith('exists:')) {
        mechanisms.push(part);
      } else if (part === '~all' || part === '-all' || part === '+all' || part === '?all') {
        qualifier = this.getSPFQualifier(part);
      }
    }

    return {
      version: 'spf1',
      mechanisms,
      qualifier,
      raw: txtRecord
    };
  }

  private static getSPFQualifier(mechanism: string): string {
    switch (mechanism) {
      case '+all': return 'pass';
      case '-all': return 'fail';
      case '~all': return 'softfail';
      case '?all': return 'neutral';
      default: return 'neutral';
    }
  }

  public static parseDKIMRecord(txtRecord: string): DKIMRecord | null {
    if (!txtRecord.startsWith('v=DKIM1')) {
      return null;
    }

    const pairs = txtRecord.split(';').map(pair => pair.trim());
    let version = '';
    let keyType = '';
    let publicKey = '';
    let serviceTypes: string[] = [];

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (!key || !value) continue;

      switch (key.trim()) {
        case 'v':
          version = value.trim();
          break;
        case 'k':
          keyType = value.trim();
          break;
        case 'p':
          publicKey = value.trim();
          break;
        case 's':
          serviceTypes = value.split(':').map(s => s.trim());
          break;
      }
    }

    if (!version || !publicKey) {
      return null;
    }

    return {
      version,
      keyType: keyType || 'rsa',
      publicKey,
      serviceTypes: serviceTypes.length > 0 ? serviceTypes : ['*'],
      raw: txtRecord
    };
  }

  public static parseDMARCRecord(txtRecord: string): DMARCRecord | null {
    if (!txtRecord.startsWith('v=DMARC1')) {
      return null;
    }

    const pairs = txtRecord.split(';').map(pair => pair.trim());
    let version = '';
    let policy = '';
    let subdomainPolicy: string | undefined;
    let percentage: number | undefined;
    let reportingEmail: string | undefined;

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (!key || !value) continue;

      switch (key.trim()) {
        case 'v':
          version = value.trim();
          break;
        case 'p':
          policy = value.trim();
          break;
        case 'sp':
          subdomainPolicy = value.trim();
          break;
        case 'pct':
          percentage = parseInt(value.trim(), 10);
          break;
        case 'rua':
          reportingEmail = value.trim().replace('mailto:', '');
          break;
      }
    }

    if (!version || !policy) {
      return null;
    }

    return {
      version,
      policy,
      subdomainPolicy,
      percentage,
      reportingEmail,
      raw: txtRecord
    };
  }

  public static async verifyDomainOwnership(
    domain: string, 
    verificationToken: string
  ): Promise<boolean> {
    const verificationDomain = `_ultrazend-verification.${domain}`;
    const expectedValue = `ultrazend-verification=${verificationToken}`;
    
    return this.verifyTXTRecord(verificationDomain, expectedValue);
  }

  public static async verifyDKIMRecord(
    domain: string, 
    selector: string = 'default'
  ): Promise<{ valid: boolean; record?: DKIMRecord; error?: string }> {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    
    try {
      const result = await this.resolveTXTRecords(dkimDomain);
      
      if (!result.success) {
        return { 
          valid: false, 
          error: `Failed to resolve DKIM record: ${result.errors.join(', ')}` 
        };
      }

      for (const record of result.records) {
        const dkimRecord = this.parseDKIMRecord(record.data);
        if (dkimRecord) {
          return { valid: true, record: dkimRecord };
        }
      }

      return { 
        valid: false, 
        error: 'No valid DKIM record found' 
      };

    } catch (error: any) {
      return { 
        valid: false, 
        error: `DKIM verification error: ${error.message}` 
      };
    }
  }

  public static async verifySPFRecord(
    domain: string
  ): Promise<{ valid: boolean; record?: SPFRecord; error?: string }> {
    try {
      const result = await this.resolveTXTRecords(domain);
      
      if (!result.success) {
        return { 
          valid: false, 
          error: `Failed to resolve SPF record: ${result.errors.join(', ')}` 
        };
      }

      for (const record of result.records) {
        const spfRecord = this.parseSPFRecord(record.data);
        if (spfRecord) {
          // Check if SPF includes our domain
          const includesUltrazend = spfRecord.mechanisms.some(mechanism =>
            mechanism.includes('ultrazend.com.br')
          );
          
          return { 
            valid: includesUltrazend, 
            record: spfRecord,
            error: includesUltrazend ? undefined : 'SPF record does not include ultrazend.com.br'
          };
        }
      }

      return { 
        valid: false, 
        error: 'No SPF record found' 
      };

    } catch (error: any) {
      return { 
        valid: false, 
        error: `SPF verification error: ${error.message}` 
      };
    }
  }

  public static async verifyDMARCRecord(
    domain: string
  ): Promise<{ valid: boolean; record?: DMARCRecord; error?: string }> {
    const dmarcDomain = `_dmarc.${domain}`;
    
    try {
      const result = await this.resolveTXTRecords(dmarcDomain);
      
      if (!result.success) {
        return { 
          valid: false, 
          error: `Failed to resolve DMARC record: ${result.errors.join(', ')}` 
        };
      }

      for (const record of result.records) {
        const dmarcRecord = this.parseDMARCRecord(record.data);
        if (dmarcRecord) {
          // DMARC is valid if it has a policy
          const validPolicy = ['none', 'quarantine', 'reject'].includes(dmarcRecord.policy);
          return { 
            valid: validPolicy, 
            record: dmarcRecord,
            error: validPolicy ? undefined : `Invalid DMARC policy: ${dmarcRecord.policy}`
          };
        }
      }

      return { 
        valid: false, 
        error: 'No valid DMARC record found' 
      };

    } catch (error: any) {
      return { 
        valid: false, 
        error: `DMARC verification error: ${error.message}` 
      };
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static sanitizeDomainName(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.+|\.+$/g, '');
  }

  public static validateDomainName(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.([a-zA-Z]{2,}\.)*[a-zA-Z]{2,}$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }
}