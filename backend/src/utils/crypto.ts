import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export const generateApiKey = (): string => {
  const randomBytes = crypto.randomBytes(32);
  const apiKey = 're_' + randomBytes.toString('hex');
  return apiKey;
};

export const generateSecretKey = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const generateTrackingId = (): string => {
  return uuidv4();
};

/**
 * Hash API key using bcrypt for secure storage
 */
export const hashApiKey = async (apiKey: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(apiKey, saltRounds);
};

/**
 * Verify API key against hash
 */
export const verifyApiKey = async (apiKey: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(apiKey, hash);
};

/**
 * Legacy hash function for migration purposes (DO NOT USE for new API keys)
 * @deprecated Use hashApiKey instead
 */
export const legacyHashApiKey = (apiKey: string): string => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

export const createWebhookSignature = (payload: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

export const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const expectedSignature = createWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

export const generateDKIMKeys = (): { privateKey: string; publicKey: string } => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return { privateKey, publicKey };
};