import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { logger } from '../config/logger';
import { EmailServiceFactory, EmailServiceType } from '../services/EmailServiceFactory';
import { asyncHandler } from './errorHandler';
import { EmailAuditService, emailAuditService } from '../services/EmailAuditService';
import { DomainValidator } from '../services/DomainValidator';
import {
  validateEmailData,
  checkServiceHealth,
  sendErrorResponse,
  sendServiceUnavailableResponse,
  generateEmailId,
  logMiddlewareEvent
} from './emailMiddlewareHelpers';

/**
 * Middleware para aplicar a nova arquitetura de emails da Fase 2
 * Substitui o validateSenderMiddleware antigo
 */
export const emailArchitectureMiddleware = asyncHandler(async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    // 🔒 VALIDAÇÃO OTIMIZADA: Usar helper para validação rápida
    const validation = validateEmailData(req);
    const { from } = req.body;
    
    if (!validation.isValid) {
      if (validation.errors.some(e => e.field === 'userId')) {
        logMiddlewareEvent('error', 'Invalid user ID in email architecture middleware', {
          userId: req.user?.id,
          path: req.path
        });
        return sendErrorResponse(res, 401, 'User authentication required', 'AUTH_REQUIRED');
      }
      
      logMiddlewareEvent('warn', 'Email validation failed in architecture middleware', {
        userId: validation.userId,
        errors: validation.errors,
        path: req.path
      });
      
      return sendErrorResponse(res, 400, 'Invalid email data', 'VALIDATION_ERROR', validation.errors);
    }
    
    logMiddlewareEvent('debug', 'Email architecture middleware validation passed', {
      userId: validation.userId,
      from,
      endpoint: req.path
    });

    // 🔒 VALIDAÇÃO DE SERVIÇO OTIMIZADA: Usar cache para health check
    const serviceHealthy = await checkServiceHealth('external');
    
    if (!serviceHealthy) {
      logMiddlewareEvent('error', 'External email service unavailable', {
        userId: validation.userId,
        path: req.path
      });
      return sendServiceUnavailableResponse(res);
    }

    // 🔒 VALIDAÇÃO DE DOMÍNIO OTIMIZADA
    let validatedSender;
    try {
      const validator = new DomainValidator();
      validatedSender = await validator.validateSenderDomain(validation.userId, from);
      
      if (!validatedSender) {
        throw new Error('Domain validation returned null result');
      }
    } catch (error) {
      logMiddlewareEvent('error', 'Domain validation failed', {
        userId: validation.userId,
        from,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return sendErrorResponse(res, 400, 'Invalid sender domain', 'DOMAIN_VALIDATION_ERROR');
    }
    
    // Aplicar correções se necessário
    if (validatedSender.fallback) {
      logMiddlewareEvent('info', 'Email sender corrected by architecture middleware', {
        userId: validation.userId,
        originalFrom: from,
        correctedFrom: validatedSender.email,
        reason: validatedSender.reason
      });
      
      // Atualizar dados da requisição
      Object.assign(req.body, {
        from: validatedSender.email,
        _senderCorrected: true,
        _originalFrom: from,
        _correctionReason: validatedSender.reason
      });
    }

    // Adicionar metadados otimizados
    const emailId = generateEmailId();
    Object.assign(req.body, {
      _dkimDomain: validatedSender.dkimDomain,
      _emailServiceType: EmailServiceType.EXTERNAL,
      _emailId: emailId
    });

    // 🔒 AUDITORIA ASSÍNCRONA (não bloqueante)
    emailAuditService.logEmailEvent({
      userId: validation.userId,
      emailId,
      originalFrom: from,
      finalFrom: req.body.from,
      wasModified: validatedSender.fallback || false,
      modificationReason: validatedSender.reason,
      dkimDomain: validatedSender.dkimDomain,
      deliveryStatus: 'queued',
      metadata: {
        endpoint: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        correctionApplied: validatedSender.fallback || false,
        serviceType: EmailServiceType.EXTERNAL
      }
    }).catch(error => {
      logMiddlewareEvent('warn', 'Email audit logging failed', {
        userId: validation.userId,
        emailId,
        error: error instanceof Error ? error.message : 'Unknown audit error'
      });
    });
    
    logMiddlewareEvent('debug', 'Email architecture middleware completed', {
      userId: validation.userId,
      finalFrom: req.body.from,
      wasCorrected: validatedSender.fallback || false,
      dkimDomain: validatedSender.dkimDomain
    });

    // ✅ SUCESSO: Continuar com processamento
    next();
    
  } catch (error) {
    // 🚨 ERRO CRÍTICO OTIMIZADO
    logMiddlewareEvent('error', 'Critical error in email architecture middleware', {
      userId: req.user?.id,
      from: req.body?.from,
      path: req.path,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return sendErrorResponse(
      res, 
      500, 
      'Internal server error during email processing',
      'EMAIL_MIDDLEWARE_ERROR'
    );
  }
});

/**
 * Middleware para validação em lote (batch emails)
 */
export const emailArchitectureBatchMiddleware = asyncHandler(async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const { emails } = req.body;
    const userId = req.user?.id;
    
    // Validação otimizada para batch
    if (!userId || typeof userId !== 'number') {
      return sendErrorResponse(res, 401, 'User authentication required', 'AUTH_REQUIRED');
    }
    
    if (!Array.isArray(emails)) {
      return sendErrorResponse(res, 400, 'Emails field must be an array', 'INVALID_BATCH_FORMAT');
    }

    logMiddlewareEvent('debug', 'Applying email architecture batch middleware', {
      userId,
      emailCount: emails.length
    });

    // Health check otimizado com cache
    const serviceHealthy = await checkServiceHealth('external');
    if (!serviceHealthy) {
      logMiddlewareEvent('error', 'External email service health check failed for batch', { userId });
      return sendServiceUnavailableResponse(res);
    }

    // Usar DomainValidator para processar todos os emails
    const validator = new DomainValidator();
    const processedEmails = [];
    const corrections = [];
    const auditLogs = [];

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      if (!email.from) {
        logger.warn('Email in batch missing from field', { userId, index: i });
        continue;
      }

      try {
        const validatedSender = await validator.validateSenderDomain(userId, email.from);
        const emailId = generateEmailId('email_batch');
        
        const processedEmail = { ...email };
        
        // Aplicar correções se necessário
        if (validatedSender.fallback) {
          corrections.push({
            index: i,
            originalFrom: email.from,
            correctedFrom: validatedSender.email,
            reason: validatedSender.reason
          });
          
          Object.assign(processedEmail, {
            from: validatedSender.email,
            _senderCorrected: true,
            _originalFrom: email.from,
            _correctionReason: validatedSender.reason
          });
        }
        
        // Metadados otimizados
        Object.assign(processedEmail, {
          _dkimDomain: validatedSender.dkimDomain,
          _emailServiceType: EmailServiceType.EXTERNAL,
          _emailId: emailId
        });

        // Auditoria assíncrona (não bloqueante)
        auditLogs.push(emailAuditService.logEmailEvent({
          userId,
          emailId,
          originalFrom: email.from,
          finalFrom: processedEmail.from,
          wasModified: validatedSender.fallback || false,
          modificationReason: validatedSender.reason,
          dkimDomain: validatedSender.dkimDomain,
          deliveryStatus: 'queued',
          metadata: {
            endpoint: req.path,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            batchIndex: i,
            batchSize: emails.length,
            correctionApplied: validatedSender.fallback || false,
            serviceType: EmailServiceType.EXTERNAL
          }
        }));
        
        processedEmails.push(processedEmail);
      } catch (error) {
        logMiddlewareEvent('error', 'Error processing email in batch', {
          userId,
          index: i,
          originalFrom: email.from,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Email original com metadados padrão
        processedEmails.push({
          ...email,
          _dkimDomain: 'ultrazend.com.br',
          _emailServiceType: EmailServiceType.EXTERNAL,
          _emailId: generateEmailId('email_batch_error')
        });
      }
    }

    // Atualizar o body com emails processados
    req.body.emails = processedEmails;

    // Processar logs de auditoria de forma assíncrona (não bloqueia a resposta)
    if (auditLogs.length > 0) {
      Promise.all(auditLogs).then(() => {
        logMiddlewareEvent('debug', 'All batch audit logs processed successfully', {
          userId,
          auditLogCount: auditLogs.length
        });
      }).catch(error => {
        logMiddlewareEvent('error', 'Error processing batch audit logs', {
          userId,
          error: error instanceof Error ? error.message : String(error),
          auditLogCount: auditLogs.length
        });
      });
    }

    if (corrections.length > 0) {
      logMiddlewareEvent('info', 'Batch email senders corrected by architecture middleware', {
        userId,
        totalEmails: emails.length,
        correctedCount: corrections.length,
        corrections: corrections.slice(0, 5)
      });
    }

    logMiddlewareEvent('debug', 'Email architecture batch middleware completed', {
      userId,
      originalCount: emails.length,
      processedCount: processedEmails.length,
      correctedCount: corrections.length
    });

    next();
  } catch (error) {
    logMiddlewareEvent('error', 'Email architecture batch middleware error', {
      userId: req.user?.id,
      emailCount: req.body?.emails?.length,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Fallback gracioso para sistema legado
    logMiddlewareEvent('warn', 'Falling back to legacy batch email processing', {});
    next();
  }
});

/**
 * Middleware para emails internos (sistema)
 * Usado em rotas de verificação, reset de senha, etc.
 */
export const internalEmailMiddleware = asyncHandler(async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    logger.debug('Applying internal email middleware', {
      userId: req.user?.id,
      endpoint: req.path
    });

    // Criar serviço de email interno
    const internalEmailService = await EmailServiceFactory.createInternalService();
    
    // Testar se o serviço está funcionando
    const serviceHealthy = await internalEmailService.testConnection?.();
    if (!serviceHealthy) {
      logger.error('Internal email service health check failed', { userId: req.user?.id });
      return res.status(500).json({
        error: 'Email service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Marcar como email interno para o processamento posterior
    req.body._emailServiceType = EmailServiceType.INTERNAL;
    req.body._dkimDomain = 'ultrazend.com.br';
    
    const originalFrom = req.body.from;
    let wasModified = false;
    
    // Garantir que emails internos sempre usem o domínio correto
    if (req.body.from && !req.body.from.includes('@ultrazend.com.br')) {
      req.body.from = 'noreply@ultrazend.com.br';
      wasModified = true;
      logger.debug('Internal email from corrected to UltraZend domain');
    }

    // Registrar evento de auditoria para email interno
    const auditService = EmailAuditService.getInstance();
    const emailId = `email_internal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await auditService.logEmailEvent({
      userId: req.user?.id || 0,
      emailId,
      originalFrom: originalFrom || 'noreply@ultrazend.com.br',
      finalFrom: req.body.from || 'noreply@ultrazend.com.br',
      wasModified,
      modificationReason: wasModified ? 'Internal email corrected to UltraZend domain' : undefined,
      dkimDomain: 'ultrazend.com.br',
      deliveryStatus: 'queued',
      metadata: {
        endpoint: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        serviceType: EmailServiceType.INTERNAL,
        isSystemEmail: true
      }
    });

    // Armazenar emailId no request para uso posterior
    req.body._emailId = emailId;

    logger.debug('Internal email middleware completed', {
      userId: req.user?.id,
      from: req.body.from
    });

    next();
  } catch (error) {
    logger.error('Internal email middleware error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Para emails internos, não fazer fallback - é crítico que funcione
    return res.status(500).json({
      error: 'Internal email service error',
      code: 'INTERNAL_EMAIL_SERVICE_ERROR'
    });
  }
});

/**
 * Middleware para adicionar estatísticas da nova arquitetura
 */
export const emailStatsMiddleware = asyncHandler(async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    
    // Criar serviço de email externo para acessar estatísticas
    const externalEmailService = await EmailServiceFactory.createExternalService();
    
    if (externalEmailService.getEmailStats) {
      // Obter estatísticas dos últimos 30 dias
      const newArchStats = await externalEmailService.getEmailStats(userId, 30);
      
      // Adicionar estatísticas ao contexto da requisição para uso posterior
      req.emailStats = newArchStats;
      
      logger.debug('Email stats added to request context', {
        userId,
        stats: newArchStats
      });
    }

    next();
  } catch (error) {
    logger.error('Email stats middleware error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Continuar sem as estatísticas em caso de erro
    next();
  }
});

// Extensão do tipo Request para incluir estatísticas de email
declare global {
  namespace Express {
    interface Request {
      emailStats?: {
        totalEmails: number;
        sentEmails: number;
        failedEmails: number;
        modifiedEmails: number;
        deliveryRate: number;
        modificationRate: number;
      };
    }
  }
}