import { decryptSensitiveValue, encryptSensitiveValue } from '../../../utils/crypto';

describe('sensitive value encryption', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalAppEncryptionKey = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.JWT_SECRET = '12345678901234567890123456789012';
    process.env.APP_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.APP_ENCRYPTION_KEY = originalAppEncryptionKey;
  });

  it('encrypts and decrypts secrets symmetrically', () => {
    const encrypted = encryptSensitiveValue('smtp-secret-password');

    expect(encrypted).not.toBe('smtp-secret-password');
    expect(decryptSensitiveValue(encrypted)).toBe('smtp-secret-password');
  });

  it('keeps legacy plain values readable during migration', () => {
    expect(decryptSensitiveValue('legacy-plain-text')).toBe('legacy-plain-text');
  });
});
