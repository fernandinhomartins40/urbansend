import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from './logger';

/**
 * Enterprise-grade Environment Configuration System
 * 
 * Features:
 * - Type-safe configuration with Zod validation
 * - Environment-specific loading strategies
 * - Comprehensive validation with helpful error messages
 * - Secure defaults and fallbacks
 * - Runtime configuration validation
 */

// Environment schema with strict validation
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  
  // Server Configuration
  PORT: z.coerce.number().min(1000).max(65535).default(3001),
  HTTPS_PORT: z.coerce.number().min(1000).max(65535).default(443),
  HOST: z.string().default('0.0.0.0'),
  
  // Database Configuration
  DATABASE_URL: z.string().min(1),
  
  // Security Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT refresh secret must be at least 32 characters').optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  COOKIE_SECRET: z.string().min(32, 'Cookie secret must be at least 32 characters'),
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1000).default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().min(1).default(100),
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false),
  
  // CORS Configuration
  ALLOWED_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().url().optional(),
  API_BASE_URL: z.string().url().optional(),
  
  // SMTP Configuration
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().min(1).max(65535).default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('UltraZend'),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_HOSTNAME: z.string().optional(),
  SMTP_SERVER_PORT: z.coerce.number().min(1).max(65535).default(25),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().optional(),
  LOG_MAX_SIZE: z.string().default('20m'),
  LOG_MAX_FILES: z.coerce.number().default(5),
  
  // Security Headers
  HSTS_MAX_AGE: z.coerce.number().default(31536000), // 1 year
  CSP_REPORT_ONLY: z.coerce.boolean().default(false),
  
  // Performance Configuration
  BCRYPT_SALT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  
  // Feature Flags
  ENABLE_SWAGGER: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(true),
  
  // External Services
  REDIS_URL: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  
  // SSL Configuration
  SSL_KEY_PATH: z.string().optional(),
  SSL_CERT_PATH: z.string().optional(),
  
  // Trust Proxy Configuration
  TRUST_PROXY: z.union([
    z.boolean(),
    z.coerce.number(),
    z.string()
  ]).default(1),
  
  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT: z.coerce.number().default(5000),
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000)
});

export type Environment = z.infer<typeof environmentSchema>;

class EnvironmentManager {
  private _config: Environment | null = null;
  private _isInitialized = false;
  
  /**
   * Initialize environment configuration
   * Loads and validates configuration based on NODE_ENV
   */
  public initialize(): Environment {
    if (this._isInitialized && this._config) {
      return this._config;
    }
    
    try {
      // Load environment files based on NODE_ENV
      this.loadEnvironmentFiles();
      
      // Validate and parse environment variables
      const rawConfig = process.env;
      const result = environmentSchema.safeParse(rawConfig);
      
      if (!result.success) {
        const errors = result.error.issues.map(issue => 
          `${issue.path.join('.')}: ${issue.message}`
        ).join('\n');
        
        throw new Error(`Environment validation failed:\n${errors}`);
      }
      
      this._config = result.data;
      this._isInitialized = true;
      
      // Log successful initialization
      logger.info('Environment configuration initialized successfully', {
        environment: this._config.NODE_ENV,
        port: this._config.PORT,
        httpsPort: this._config.HTTPS_PORT,
        logLevel: this._config.LOG_LEVEL,
        databaseConfigured: !!this._config.DATABASE_URL,
        smtpConfigured: !!this._config.SMTP_HOST,
        jwtConfigured: !!this._config.JWT_SECRET,
        redisConfigured: !!this._config.REDIS_URL
      });
      
      return this._config;
      
    } catch (error) {
      logger.error('Failed to initialize environment configuration', { error });
      throw error;
    }
  }
  
  /**
   * Load environment files based on NODE_ENV and available configs
   */
  private loadEnvironmentFiles(): void {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const rootDir = process.cwd();
    
    // Environment-specific loading strategy
    const envFiles = [
      path.join(rootDir, '.env.local'), // Local overrides (never commit)
      path.join(rootDir, `.env.${nodeEnv}.local`), // Environment-specific local
      path.join(rootDir, `.env.${nodeEnv}`), // Environment-specific
      path.join(rootDir, '.env'), // Default fallback
      path.join(rootDir, 'configs', `.env.${nodeEnv}`), // Legacy configs directory
      path.join(rootDir, 'backend', `.env.${nodeEnv}`), // Backend-specific
      path.join(rootDir, 'backend', '.env') // Backend fallback
    ];
    
    const loadedFiles: string[] = [];
    
    // Load files in reverse priority order (later files override earlier ones)
    for (const envFile of envFiles.reverse()) {
      try {
        const result = dotenv.config({ path: envFile, override: false });
        if (!result.error) {
          loadedFiles.push(envFile);
        }
      } catch {
        // Ignore missing files
      }
    }
    
    if (loadedFiles.length > 0) {
      logger.info('Environment files loaded', { files: loadedFiles });
    } else {
      logger.warn('No environment files found, using system environment only');
    }
  }
  
  /**
   * Get current configuration (must be initialized first)
   */
  public get config(): Environment {
    if (!this._isInitialized || !this._config) {
      throw new Error('Environment not initialized. Call initialize() first.');
    }
    return this._config;
  }
  
  /**
   * Check if running in production environment
   */
  public get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }
  
  /**
   * Check if running in development environment
   */
  public get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }
  
  /**
   * Check if running in staging environment
   */
  public get isStaging(): boolean {
    return this.config.NODE_ENV === 'staging';
  }
  
  /**
   * Get environment-specific rate limiting configuration
   */
  public getRateLimitConfig() {
    const config = this.config;
    
    return {
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      trustProxy: true,
      skipSuccessfulRequests: config.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS,
      // Skip rate limiting in development and staging for easier testing
      skip: (this.isDevelopment || this.isStaging) ? () => true : undefined
    };
  }
  
  /**
   * Get CORS configuration
   */
  public getCorsConfig() {
    const config = this.config;
    
    // Default allowed origins based on environment
    const defaultOrigins = [
      ...(this.isDevelopment ? [
        'http://localhost:3000',
        'http://localhost:3001', 
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
      ] : []),
      ...(config.FRONTEND_URL ? [config.FRONTEND_URL] : []),
      'https://ultrazend.com.br',
      'https://www.ultrazend.com.br'
    ];
    
    // Parse custom origins from environment
    const customOrigins = config.ALLOWED_ORIGINS ? 
      config.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : [];
    
    const allowedOrigins = [...new Set([...defaultOrigins, ...customOrigins])];
    
    return {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-API-Key', 
        'X-Requested-With',
        'X-Correlation-ID'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit', 
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Correlation-ID'
      ],
      optionsSuccessStatus: 200,
      preflightContinue: false
    };
  }
  
  /**
   * Get trust proxy configuration
   */
  public getTrustProxyConfig() {
    const trustProxy = this.config.TRUST_PROXY;
    
    // Convert string representations to appropriate types
    if (typeof trustProxy === 'string') {
      if (trustProxy.toLowerCase() === 'true') return true;
      if (trustProxy.toLowerCase() === 'false') return false;
      if (/^\d+$/.test(trustProxy)) return parseInt(trustProxy, 10);
      return trustProxy; // Return as subnet or custom function name
    }
    
    return trustProxy;
  }
  
  /**
   * Validate critical configuration at startup
   */
  public validateCriticalConfig(): void {
    const config = this.config;
    const issues: string[] = [];
    
    // Production-specific validations
    if (this.isProduction) {
      if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
        issues.push('JWT_SECRET must be at least 32 characters in production');
      }
      
      if (!config.COOKIE_SECRET || config.COOKIE_SECRET.length < 32) {
        issues.push('COOKIE_SECRET must be at least 32 characters in production');
      }
      
      if (!config.DATABASE_URL) {
        issues.push('DATABASE_URL is required in production');
      }
      
      if (config.LOG_LEVEL === 'debug') {
        logger.warn('Debug logging enabled in production - consider using info or warn level');
      }
    }
    
    // General validations
    if (config.BCRYPT_SALT_ROUNDS < 10) {
      issues.push('BCRYPT_SALT_ROUNDS should be at least 10 for security');
    }
    
    if (issues.length > 0) {
      throw new Error(`Critical configuration issues:\n${issues.join('\n')}`);
    }
    
    logger.info('Critical configuration validation passed');
  }
}

// Export singleton instance
export const env = new EnvironmentManager();

// Export the configuration type for use in other modules
export type { Environment as Config };

/**
 * Legacy compatibility layer - gradually migrate from Env to env
 * @deprecated Use env.config instead
 */
export const Env = {
  get isProduction() { return env.isProduction; },
  get isDevelopment() { return env.isDevelopment; },
  get isStaging() { return env.isStaging; },
  get jwtSecret() { return env.config.JWT_SECRET; },
  get jwtRefreshSecret() { return env.config.JWT_REFRESH_SECRET || env.config.JWT_SECRET; },
  getNumber: (key: string, defaultValue: number) => {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  },
  get: (key: string, defaultValue: string) => {
    return process.env[key] || defaultValue;
  }
};