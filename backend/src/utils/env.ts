/**
 * Safe environment variable access utility
 */
export class Env {
  /**
   * Get environment variable with default fallback
   */
  static get(key: keyof NodeJS.ProcessEnv, defaultValue: string = ''): string {
    return process.env[key] ?? defaultValue;
  }

  /**
   * Get required environment variable (throws if not found)
   */
  static required(key: keyof NodeJS.ProcessEnv): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Get environment variable as number
   */
  static getNumber(key: keyof NodeJS.ProcessEnv, defaultValue: number = 0): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get environment variable as boolean
   */
  static getBoolean(key: keyof NodeJS.ProcessEnv, defaultValue: boolean = false): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Check if we're in development mode
   */
  static get isDevelopment(): boolean {
    return Env.get('NODE_ENV', 'development') === 'development';
  }

  /**
   * Check if we're in production mode
   */
  static get isProduction(): boolean {
    return Env.get('NODE_ENV') === 'production';
  }

  /**
   * Check if we're in test mode
   */
  static get isTest(): boolean {
    return Env.get('NODE_ENV') === 'test';
  }

  /**
   * Internal routes are reserved for diagnostics, migration tooling and admin-only
   * surfaces that should not be exposed in the default application runtime.
   */
  static get enableInternalRoutes(): boolean {
    return Env.getBoolean('ENABLE_INTERNAL_ROUTES', false);
  }

  /**
   * Legacy routes stay opt-in so the product can run against a single public contract.
   */
  static get enableLegacyDomainRoutes(): boolean {
    return Env.getBoolean('ENABLE_LEGACY_DOMAIN_ROUTES', false);
  }

  /**
   * Debug endpoints that expose sensitive operational data must be explicitly enabled.
   */
  static get enableDebugRoutes(): boolean {
    return Env.getBoolean('ENABLE_DEBUG_ROUTES', false);
  }

  /**
   * CSRF token validation for cookie-based auth writes.
   * Enabled by default in production, optional elsewhere.
   */
  static get enableCsrfProtection(): boolean {
    const defaultValue = Env.isProduction;
    return Env.getBoolean('ENABLE_CSRF_PROTECTION', defaultValue);
  }

  /**
   * Get JWT Secret (required for security)
   */
  static get jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET é obrigatório e deve ter pelo menos 32 caracteres para segurança adequada');
    }
    return secret;
  }

  /**
   * Get JWT Refresh Secret (required for security)
   */
  static get jwtRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_REFRESH_SECRET (ou JWT_SECRET) é obrigatório e deve ter pelo menos 32 caracteres');
    }
    return secret;
  }
  /**
   * Shared encryption key for sensitive application settings.
   */
  static get appEncryptionKey(): string {
    const secret = process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('APP_ENCRYPTION_KEY (ou JWT_SECRET) e obrigatorio e deve ter pelo menos 32 caracteres');
    }
    return secret;
  }
}
