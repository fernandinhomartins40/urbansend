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
}