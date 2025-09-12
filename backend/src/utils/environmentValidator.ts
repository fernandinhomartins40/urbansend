import { logger } from '../config/logger';
import fs from 'fs';
import path from 'path';

/**
 * Professional Environment Configuration Validator
 * 
 * Ensures consistent environment configuration across development and production
 * Validates critical environment variables and provides clear error messages
 */

export interface EnvironmentValidationResult {
  isValid: boolean;
  environment: string;
  issues: EnvironmentIssue[];
  recommendations: string[];
  criticalErrors: string[];
}

export interface EnvironmentIssue {
  type: 'MISSING_VAR' | 'INVALID_VALUE' | 'INCONSISTENCY' | 'SECURITY_RISK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  variable: string;
  current?: string;
  expected?: string;
  description: string;
  fix: string;
}

export class EnvironmentValidator {
  private readonly requiredVars = {
    NODE_ENV: {
      required: true,
      validValues: ['development', 'production', 'test'],
      critical: true
    },
    DATABASE_URL: {
      required: true,
      critical: true
    },
    PORT: {
      required: false,
      default: '3001'
    },
    DKIM_ENABLED: {
      required: false,
      default: 'true',
      validValues: ['true', 'false']
    },
    SMTP_ENABLED: {
      required: false,
      default: 'true',
      validValues: ['true', 'false']
    }
  };

  /**
   * Valida a configuração completa do ambiente
   */
  async validateEnvironment(): Promise<EnvironmentValidationResult> {
    const issues: EnvironmentIssue[] = [];
    const criticalErrors: string[] = [];
    const recommendations: string[] = [];

    logger.info('🔍 Starting environment validation...');

    // 1. Verificar NODE_ENV consistency
    await this.checkNodeEnvConsistency(issues, criticalErrors);

    // 2. Validar variáveis obrigatórias
    this.validateRequiredVariables(issues, criticalErrors);

    // 3. Verificar configurações de segurança
    this.validateSecuritySettings(issues, recommendations);

    // 4. Verificar configurações de DKIM
    this.validateDkimConfiguration(issues, recommendations);

    // 5. Verificar arquivo .env
    await this.validateEnvFile(issues, recommendations);

    const isValid = criticalErrors.length === 0 && issues.filter(i => i.severity === 'CRITICAL').length === 0;
    const environment = process.env.NODE_ENV || 'undefined';

    return {
      isValid,
      environment,
      issues,
      recommendations,
      criticalErrors
    };
  }

  /**
   * Verifica consistência do NODE_ENV entre diferentes fontes
   */
  private async checkNodeEnvConsistency(issues: EnvironmentIssue[], criticalErrors: string[]): Promise<void> {
    const processNodeEnv = process.env.NODE_ENV;
    const systemNodeEnv = process.platform === 'win32' 
      ? process.env.NODE_ENV 
      : process.env.NODE_ENV;

    // Verificar se NODE_ENV está definido
    if (!processNodeEnv) {
      issues.push({
        type: 'MISSING_VAR',
        severity: 'CRITICAL',
        variable: 'NODE_ENV',
        description: 'NODE_ENV is not defined',
        fix: 'Set NODE_ENV environment variable to "production" or "development"'
      });
      criticalErrors.push('NODE_ENV is not defined - system cannot determine environment');
      return;
    }

    // Verificar se NODE_ENV tem valor válido
    const validEnvironments = ['development', 'production', 'test'];
    if (!validEnvironments.includes(processNodeEnv)) {
      issues.push({
        type: 'INVALID_VALUE',
        severity: 'CRITICAL',
        variable: 'NODE_ENV',
        current: processNodeEnv,
        expected: validEnvironments.join(' | '),
        description: 'NODE_ENV has invalid value',
        fix: 'Set NODE_ENV to one of: development, production, test'
      });
      criticalErrors.push(`NODE_ENV has invalid value: ${processNodeEnv}`);
    }

    // Verificar consistência baseada na detecção de ambiente
    const isProductionServer = process.cwd().includes('/var/www') || 
                              process.cwd().includes('/opt') ||
                              process.env.PM2_HOME ||
                              process.env.PM2_JSON_PROCESSING;

    if (isProductionServer && processNodeEnv !== 'production') {
      issues.push({
        type: 'INCONSISTENCY',
        severity: 'HIGH',
        variable: 'NODE_ENV',
        current: processNodeEnv,
        expected: 'production',
        description: 'Running on production server but NODE_ENV is not "production"',
        fix: 'Set NODE_ENV=production in .env file and restart PM2 processes'
      });
    }

    logger.debug('NODE_ENV consistency check completed', {
      processNodeEnv,
      isProductionServer,
      issues: issues.length
    });
  }

  /**
   * Valida variáveis obrigatórias
   */
  private validateRequiredVariables(issues: EnvironmentIssue[], criticalErrors: string[]): void {
    for (const [varName, config] of Object.entries(this.requiredVars)) {
      const value = process.env[varName];

      // Verificar se variável obrigatória existe
      if (config.required && !value) {
        const severity = config.critical ? 'CRITICAL' : 'HIGH';
        
        issues.push({
          type: 'MISSING_VAR',
          severity,
          variable: varName,
          description: `Required environment variable ${varName} is missing`,
          fix: `Set ${varName} in .env file${config.default ? ` (default: ${config.default})` : ''}`
        });

        if (config.critical) {
          criticalErrors.push(`Critical environment variable missing: ${varName}`);
        }
        continue;
      }

      // Verificar se valor está na lista de valores válidos
      if (value && config.validValues && !config.validValues.includes(value)) {
        issues.push({
          type: 'INVALID_VALUE',
          severity: 'MEDIUM',
          variable: varName,
          current: value,
          expected: config.validValues.join(' | '),
          description: `${varName} has invalid value`,
          fix: `Set ${varName} to one of: ${config.validValues.join(', ')}`
        });
      }
    }
  }

  /**
   * Valida configurações de segurança
   */
  private validateSecuritySettings(issues: EnvironmentIssue[], recommendations: string[]): void {
    const nodeEnv = process.env.NODE_ENV;

    // Verificar configurações de produção
    if (nodeEnv === 'production') {
      if (!process.env.COOKIE_SECRET || process.env.COOKIE_SECRET === 'fallback-secret') {
        issues.push({
          type: 'SECURITY_RISK',
          severity: 'HIGH',
          variable: 'COOKIE_SECRET',
          description: 'Using default or missing COOKIE_SECRET in production',
          fix: 'Generate a secure random string for COOKIE_SECRET'
        });
      }

      if (process.env.LOG_LEVEL === 'debug') {
        issues.push({
          type: 'SECURITY_RISK',
          severity: 'MEDIUM',
          variable: 'LOG_LEVEL',
          current: 'debug',
          expected: 'info',
          description: 'Debug logging enabled in production',
          fix: 'Set LOG_LEVEL=info in production environment'
        });
      }

      recommendations.push('Consider enabling HTTPS in production with proper SSL certificates');
      recommendations.push('Ensure all sensitive data is properly encrypted at rest');
    }
  }

  /**
   * Valida configurações específicas do DKIM
   */
  private validateDkimConfiguration(issues: EnvironmentIssue[], recommendations: string[]): void {
    const dkimEnabled = process.env.DKIM_ENABLED;
    const dkimDomain = process.env.DKIM_DOMAIN;
    const dkimPrivateKeyPath = process.env.DKIM_PRIVATE_KEY_PATH;

    if (dkimEnabled === 'true') {
      if (!dkimDomain) {
        issues.push({
          type: 'MISSING_VAR',
          severity: 'HIGH',
          variable: 'DKIM_DOMAIN',
          description: 'DKIM is enabled but DKIM_DOMAIN is not set',
          fix: 'Set DKIM_DOMAIN to your primary domain (e.g., ultrazend.com.br)'
        });
      }

      if (!dkimPrivateKeyPath) {
        issues.push({
          type: 'MISSING_VAR',
          severity: 'HIGH',
          variable: 'DKIM_PRIVATE_KEY_PATH',
          description: 'DKIM is enabled but DKIM_PRIVATE_KEY_PATH is not set',
          fix: 'Set DKIM_PRIVATE_KEY_PATH to the path of your DKIM private key file'
        });
      }
    }

    recommendations.push('Ensure DKIM keys are properly backed up and secured');
    recommendations.push('Regularly rotate DKIM keys for enhanced security');
  }

  /**
   * Valida arquivo .env
   */
  private async validateEnvFile(issues: EnvironmentIssue[], recommendations: string[]): Promise<void> {
    const possibleEnvFiles = [
      '.env',
      '.env.production',
      '.env.development',
      '/var/www/ultrazend/backend/.env'
    ];

    let envFileFound = false;
    
    for (const envFile of possibleEnvFiles) {
      const fullPath = path.isAbsolute(envFile) ? envFile : path.resolve(process.cwd(), envFile);
      
      if (fs.existsSync(fullPath)) {
        envFileFound = true;
        logger.debug(`Found env file: ${fullPath}`);
        
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          this.validateEnvFileContent(content, fullPath, issues, recommendations);
        } catch (error) {
          issues.push({
            type: 'INVALID_VALUE',
            severity: 'MEDIUM',
            variable: 'ENV_FILE',
            description: `Cannot read env file ${fullPath}`,
            fix: 'Check file permissions and accessibility'
          });
        }
        break;
      }
    }

    if (!envFileFound) {
      recommendations.push('Consider creating a .env file for environment-specific configuration');
    }
  }

  /**
   * Valida conteúdo do arquivo .env
   */
  private validateEnvFileContent(
    content: string, 
    filePath: string, 
    issues: EnvironmentIssue[], 
    recommendations: string[]
  ): void {
    const lines = content.split('\n');
    const envVars = new Map<string, string>();

    // Parse env file
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars.set(key.trim(), valueParts.join('=').trim());
        }
      }
    }

    // Verificar se NODE_ENV está definido no arquivo .env
    const envNodeEnv = envVars.get('NODE_ENV');
    const processNodeEnv = process.env.NODE_ENV;

    if (envNodeEnv && processNodeEnv && envNodeEnv !== processNodeEnv) {
      issues.push({
        type: 'INCONSISTENCY',
        severity: 'HIGH',
        variable: 'NODE_ENV',
        current: `Process: ${processNodeEnv}, File: ${envNodeEnv}`,
        expected: 'Consistent values',
        description: 'NODE_ENV mismatch between process and .env file',
        fix: 'Ensure NODE_ENV is consistent in .env file and process environment'
      });
    }

    logger.debug('Env file validation completed', {
      filePath,
      varsFound: envVars.size,
      nodeEnvInFile: envNodeEnv
    });
  }

  /**
   * Gera relatório de validação formatado
   */
  generateReport(result: EnvironmentValidationResult): string {
    const lines: string[] = [];
    
    lines.push('🔧 ENVIRONMENT VALIDATION REPORT');
    lines.push('='.repeat(50));
    lines.push(`Environment: ${result.environment}`);
    lines.push(`Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(`Issues Found: ${result.issues.length}`);
    lines.push(`Critical Errors: ${result.criticalErrors.length}`);
    lines.push('');

    if (result.criticalErrors.length > 0) {
      lines.push('🚨 CRITICAL ERRORS:');
      result.criticalErrors.forEach((error, i) => {
        lines.push(`   ${i + 1}. ${error}`);
      });
      lines.push('');
    }

    if (result.issues.length > 0) {
      lines.push('⚠️  ISSUES:');
      result.issues.forEach((issue, i) => {
        lines.push(`   ${i + 1}. [${issue.severity}] ${issue.variable}: ${issue.description}`);
        lines.push(`      Fix: ${issue.fix}`);
        if (issue.current) {
          lines.push(`      Current: ${issue.current}`);
        }
        if (issue.expected) {
          lines.push(`      Expected: ${issue.expected}`);
        }
        lines.push('');
      });
    }

    if (result.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      result.recommendations.forEach((rec, i) => {
        lines.push(`   ${i + 1}. ${rec}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export const environmentValidator = new EnvironmentValidator();