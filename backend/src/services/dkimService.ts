import * as crypto from 'crypto';
import { logger } from '../config/logger.enterprise';
import { Env } from '../utils/env';

interface DKIMOptions {
  selector: string;
  domain: string;
  privateKey: string;
  canonicalization?: string;
  headerCanonical?: string;
  bodyCanonical?: string;
}

interface EmailMessage {
  headers: Record<string, string>;
  body: string;
}

class DKIMService {
  private options: DKIMOptions;

  constructor() {
    // Initialize options first without privateKey
    this.options = {
      selector: Env.get('DKIM_SELECTOR', 'default'),
      domain: Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br'),
      privateKey: '', // Will be set below
      canonicalization: 'relaxed/relaxed',
      headerCanonical: 'relaxed',
      bodyCanonical: 'relaxed'
    };
    
    // Now generate/get the private key
    this.options.privateKey = this.getOrCreatePrivateKey();
  }

  private getOrCreatePrivateKey(): string {
    let privateKey = Env.get('DKIM_PRIVATE_KEY');
    
    if (!privateKey) {
      // Gerar chave privada RSA para DKIM
      const keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 1024, // DKIM usa 1024 bits normalmente
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      privateKey = keyPair.privateKey;
      
      logger.info('Generated new DKIM key pair', {
        selector: this.options.selector,
        domain: this.options.domain,
        publicKey: keyPair.publicKey.replace(/\n/g, '').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, '')
      });

      // Salvar a chave pública para configuração DNS
      logger.info('DKIM DNS TXT Record needed:', {
        record: `${this.options.selector}._domainkey.${this.options.domain}`,
        value: `v=DKIM1; k=rsa; p=${keyPair.publicKey.replace(/\n/g, '').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, '')}`
      });
    }

    return privateKey;
  }

  private relaxedCanonicalizeHeader(header: string): string {
    return header
      .replace(/\s+/g, ' ')
      .replace(/\s+$/, '')
      .toLowerCase();
  }

  private relaxedCanonicalizeBody(body: string): string {
    return body
      .replace(/\s+$/gm, '')
      .replace(/\n\s*\n/g, '\n')
      .replace(/\n$/, '') + '\n';
  }

  private createSignatureData(headers: Record<string, string>, body: string): string {
    const headersToSign = ['from', 'to', 'subject', 'date', 'message-id'];
    const canonicalizedHeaders: string[] = [];

    // Canonicalizar headers necessários
    for (const headerName of headersToSign) {
      const headerValue = headers[headerName.toLowerCase()];
      if (headerValue) {
        const canonical = this.relaxedCanonicalizeHeader(`${headerName}:${headerValue}`);
        canonicalizedHeaders.push(canonical);
      }
    }

    // Canonicalizar body
    const canonicalizedBody = this.relaxedCanonicalizeBody(body);
    const bodyHash = crypto.createHash('sha256').update(canonicalizedBody).digest('base64');

    // Criar DKIM-Signature header (sem a assinatura ainda)
    const dkimHeader = [
      `v=1`,
      `a=rsa-sha256`,
      `c=${this.options.canonicalization}`,
      `d=${this.options.domain}`,
      `s=${this.options.selector}`,
      `t=${Math.floor(Date.now() / 1000)}`,
      `bh=${bodyHash}`,
      `h=${headersToSign.join(':')}`,
      `b=`
    ].join('; ');

    // Adicionar o DKIM-Signature header aos headers canonicalizados
    const dkimCanonical = this.relaxedCanonicalizeHeader(`dkim-signature:${dkimHeader}`);
    canonicalizedHeaders.push(dkimCanonical);

    return canonicalizedHeaders.join('\n');
  }

  public signEmail(message: EmailMessage): string {
    try {
      const signatureData = this.createSignatureData(message.headers, message.body);
      
      // Assinar com RSA-SHA256
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(signatureData);
      const signature = sign.sign(this.options.privateKey, 'base64');

      // Criar DKIM-Signature header completo
      const bodyHash = crypto.createHash('sha256').update(
        this.relaxedCanonicalizeBody(message.body)
      ).digest('base64');

      const dkimSignature = [
        `v=1`,
        `a=rsa-sha256`,
        `c=${this.options.canonicalization}`,
        `d=${this.options.domain}`,
        `s=${this.options.selector}`,
        `t=${Math.floor(Date.now() / 1000)}`,
        `bh=${bodyHash}`,
        `h=from:to:subject:date:message-id`,
        `b=${signature}`
      ].join('; ');

      logger.info('Email signed with DKIM', {
        domain: this.options.domain,
        selector: this.options.selector,
        bodyHash,
        signatureLength: signature.length
      });

      return dkimSignature;

    } catch (error) {
      logger.error('Failed to sign email with DKIM', { error });
      throw error;
    }
  }

  public getDKIMPublicKey(): string {
    try {
      const privateKey = crypto.createPrivateKey(this.options.privateKey);
      const publicKey = crypto.createPublicKey(privateKey);
      
      const publicKeyPem = publicKey.export({
        type: 'spki',
        format: 'pem'
      }) as string;

      return publicKeyPem.replace(/\n/g, '').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, '');
    } catch (error) {
      logger.error('Failed to extract public key', { error });
      throw error;
    }
  }

  public getDNSRecord(): { name: string; value: string } {
    return {
      name: `${this.options.selector}._domainkey.${this.options.domain}`,
      value: `v=DKIM1; k=rsa; p=${this.getDKIMPublicKey()}`
    };
  }
}

export default DKIMService;