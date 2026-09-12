import { Env } from '../../../utils/env';

describe('environment feature flags', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not enable internal or debug routes in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_INTERNAL_ROUTES = 'true';
    process.env.ENABLE_DEBUG_ROUTES = 'true';

    expect(Env.enableInternalRoutes).toBe(false);
    expect(Env.enableDebugRoutes).toBe(false);
  });

  it('requires explicit flags in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_INTERNAL_ROUTES = 'true';
    process.env.ENABLE_DEBUG_ROUTES = 'true';

    expect(Env.enableInternalRoutes).toBe(true);
    expect(Env.enableDebugRoutes).toBe(true);
  });

  it('rejects reused production secrets', () => {
    const secret = 'a'.repeat(32);
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = secret;
    process.env.JWT_REFRESH_SECRET = secret;
    process.env.APP_ENCRYPTION_KEY = secret;

    expect(() => Env.jwtRefreshSecret).toThrow('deve ser diferente');
    expect(() => Env.appEncryptionKey).toThrow('deve ser diferente');
  });
});
