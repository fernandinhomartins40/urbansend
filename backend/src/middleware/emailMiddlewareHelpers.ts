import { Response } from 'express';
import { AuthenticatedRequest } from './auth';
import { logger } from '../config/optimizedLogger';
import { EmailServiceFactory } from '../services/EmailServiceFactory';

/**
 * Helper functions para otimizar email middleware
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface EmailValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  userId: number;
}

/**
 * Cache para health checks de serviços
 */
const serviceHealthCache = new Map<string, { healthy: boolean; timestamp: number }>();
const HEALTH_CACHE_TTL = 30000; // 30 segundos

/**
 * Validação rápida e otimizada dos dados de entrada
 */
export function validateEmailData(req: AuthenticatedRequest): EmailValidationResult {
  const { from, to, subject } = req.body;
  const userId = req.user?.id;
  const errors: ValidationError[] = [];

  // Validar user ID
  if (!userId || typeof userId !== 'number') {
    errors.push({ field: 'userId', message: 'User authentication required' });
  }

  // Validar campos obrigatórios usando array para melhor performance
  const requiredFields: Array<{ key: keyof typeof req.body; name: string }> = [
    { key: 'from', name: 'from' },
    { key: 'to', name: 'to' },
    { key: 'subject', name: 'subject' }
  ];

  for (const { key, name } of requiredFields) {
    const value = req.body[key];
    if (!value || typeof value !== 'string' || value.trim() === '') {
      errors.push({ field: name, message: `${name}: must be a valid non-empty string` });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    userId: userId || 0
  };
}

/**
 * Health check otimizado com cache
 */
export async function checkServiceHealth(serviceType: 'external' | 'internal'): Promise<boolean> {
  const cacheKey = `service_${serviceType}`;
  const cached = serviceHealthCache.get(cacheKey);
  
  // Usar cache se disponível e válido
  if (cached && Date.now() - cached.timestamp < HEALTH_CACHE_TTL) {
    return cached.healthy;
  }

  try {
    const service = serviceType === 'external' 
      ? await EmailServiceFactory.createExternalService()
      : await EmailServiceFactory.createInternalService();
    
    const healthy = await service.testConnection?.() ?? false;
    
    // Atualizar cache
    serviceHealthCache.set(cacheKey, { healthy, timestamp: Date.now() });
    
    return healthy;
  } catch (error) {
    logger.error(`${serviceType} email service health check failed`, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Cache resultado negativo por menos tempo
    serviceHealthCache.set(cacheKey, { healthy: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * Resposta de erro padronizada e otimizada
 */
export function sendErrorResponse(
  res: Response, 
  status: number, 
  error: string, 
  code: string, 
  details?: any
): void {
  const response: any = { error, code };
  if (details) response.details = details;
  
  res.status(status).json(response);
}

/**
 * Resposta de erro de serviço indisponível
 */
export function sendServiceUnavailableResponse(res: Response): void {
  sendErrorResponse(
    res, 
    503, 
    'Email service temporarily unavailable',
    'SERVICE_UNAVAILABLE',
    'The email delivery service is currently unavailable. Please try again later.'
  );
}

/**
 * Gerar ID único para emails de forma otimizada
 */
export function generateEmailId(prefix: string = 'email'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log estruturado e otimizado para middleware
 */
export function logMiddlewareEvent(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data: Record<string, any>
): void {
  // Filtrar dados sensíveis automaticamente
  const sanitizedData = Object.fromEntries(
    Object.entries(data).filter(([key]) => 
      !['password', 'token', 'secret', 'key'].some(sensitive => 
        key.toLowerCase().includes(sensitive)
      )
    )
  );

  logger[level](message, sanitizedData);
}

/**
 * Cache cleanup periódico
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of serviceHealthCache.entries()) {
    if (now - value.timestamp > HEALTH_CACHE_TTL * 2) {
      serviceHealthCache.delete(key);
    }
  }
}, HEALTH_CACHE_TTL);