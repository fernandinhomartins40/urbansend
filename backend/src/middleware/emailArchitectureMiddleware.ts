import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { logger } from '../config/logger';
import { EmailServiceFactory, EmailServiceType } from '../services/EmailServiceFactory';
import { asyncHandler } from './errorHandler';
import { EmailAuditService } from '../services/EmailAuditService';

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
    // 🔒 VALIDAÇÃO ROBUSTA: Verificar dados de entrada obrigatórios
    const { from, to, subject } = req.body;
    const userId = req.user?.id;

    // Validar user ID
    if (!userId || typeof userId !== 'number') {
      logger.error('Invalid user ID in email architecture middleware', { userId, path: req.path });
      return res.status(401).json({
        error: 'User authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Validar campos obrigatórios do email
    const validationErrors: string[] = [];
    
    if (!from || typeof from !== 'string') {
      validationErrors.push('from: must be a valid string');
    }
    
    if (!to || typeof to !== 'string') {
      validationErrors.push('to: must be a valid string');
    }
    
    if (!subject || typeof subject !== 'string') {
      validationErrors.push('subject: must be a valid string');
    }

    if (validationErrors.length > 0) {
      logger.warn('Email validation failed in architecture middleware', {
        userId,
        validationErrors,
        receivedData: { from: typeof from, to: typeof to, subject: typeof subject },
        path: req.path
      });
      
      return res.status(400).json({
        error: 'Invalid email data',
        code: 'VALIDATION_ERROR',
        details: validationErrors
      });
    }
    
    logger.debug('Email architecture middleware validation passed', {
      userId,
      from,
      to,
      subject,
      endpoint: req.path
    });

    // Criar serviço de email externo para validação
    const externalEmailService = await EmailServiceFactory.createExternalService();
    
    // 🔒 VALIDAÇÃO DE SERVIÇO: Verificar saúde do serviço externo
    let serviceHealthy = false;
    try {
      serviceHealthy = await externalEmailService.testConnection?.() ?? false;
    } catch (error) {
      logger.error('External email service connection test failed', { 
        userId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    
    if (!serviceHealthy) {
      logger.error('External email service unavailable', { userId, path: req.path });
      return res.status(503).json({
        error: 'Email service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
        message: 'The email delivery service is currently unavailable. Please try again later.'
      });
    }

    // 🔒 VALIDAÇÃO DE DOMÍNIO: Usar DomainValidator com tratamento robusto de erros
    let validatedSender;
    try {
      const { DomainValidator } = await import('../services/DomainValidator');
      const validator = new DomainValidator();
      
      validatedSender = await validator.validateSenderDomain(userId, from);
      
      if (!validatedSender) {
        throw new Error('Domain validation returned null result');
      }
    } catch (error) {
      logger.error('Domain validation failed', {
        userId,
        from,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return res.status(400).json({
        error: 'Invalid sender domain',
        code: 'DOMAIN_VALIDATION_ERROR',
        message: 'The sender email domain could not be validated'
      });
    }
    
    // Aplicar correções se necessário
    if (validatedSender.fallback) {
      logger.info('Email sender corrected by architecture middleware', {
        userId,
        originalFrom: from,
        correctedFrom: validatedSender.email,
        reason: validatedSender.reason
      });
      
      // Atualizar o from no body da requisição
      req.body.from = validatedSender.email;
      
      // Adicionar metadados para auditoria
      req.body._senderCorrected = true;
      req.body._originalFrom = from;
      req.body._correctionReason = validatedSender.reason;
    }

    // Adicionar informações do DKIM domain para o processamento posterior
    req.body._dkimDomain = validatedSender.dkimDomain;
    req.body._emailServiceType = EmailServiceType.EXTERNAL;

    // 🔒 AUDITORIA: Registrar evento com tratamento robusto de erros
    const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const auditService = EmailAuditService.getInstance();
      await auditService.logEmailEvent({
        userId,
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
      });
    } catch (auditError) {
      // Log audit error but don't fail the email - audit is non-critical
      logger.warn('Email audit logging failed', {
        userId,
        emailId,
        error: auditError instanceof Error ? auditError.message : 'Unknown audit error'
      });
    }

    // 🔒 METADADOS: Armazenar dados processados no request
    req.body._emailId = emailId;
    
    logger.debug('Email architecture middleware completed', {
      userId,
      finalFrom: req.body.from,
      wasCorrected: validatedSender.fallback || false,
      dkimDomain: validatedSender.dkimDomain
    });

    // ✅ SUCESSO: Middleware completado, continuar com o processamento
    next();
    
  } catch (error) {
    // 🚨 ERRO CRÍTICO: Falha não tratada no middleware
    logger.error('Critical error in email architecture middleware', {
      userId: req.user?.id,
      from: req.body?.from,
      to: req.body?.to,
      path: req.path,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Retornar erro HTTP apropriado - não fazer fallback inseguro
    return res.status(500).json({
      error: 'Internal server error during email processing',
      code: 'EMAIL_MIDDLEWARE_ERROR',
      message: 'An unexpected error occurred while preparing your email for delivery. Please try again.'
    });
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
    const userId = req.user!.id;
    
    if (!Array.isArray(emails)) {
      return res.status(400).json({
        error: 'Emails field must be an array',
        code: 'INVALID_BATCH_FORMAT'
      });
    }

    logger.debug('Applying email architecture batch middleware', {
      userId,
      emailCount: emails.length
    });

    // Criar serviço de email externo para validação
    const externalEmailService = await EmailServiceFactory.createExternalService();
    
    // Testar se o serviço está funcionando
    const serviceHealthy = await externalEmailService.testConnection?.();
    if (!serviceHealthy) {
      logger.error('External email service health check failed for batch', { userId });
      return res.status(500).json({
        error: 'Email service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Usar DomainValidator para processar todos os emails
    const domainValidator = (await import('../services/DomainValidator')).DomainValidator;
    const validator = new domainValidator();
    
    const auditService = EmailAuditService.getInstance();
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
        const emailId = `email_batch_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
        
        const processedEmail = { ...email };
        
        if (validatedSender.fallback) {
          corrections.push({
            index: i,
            originalFrom: email.from,
            correctedFrom: validatedSender.email,
            reason: validatedSender.reason
          });
          
          processedEmail.from = validatedSender.email;
          processedEmail._senderCorrected = true;
          processedEmail._originalFrom = email.from;
          processedEmail._correctionReason = validatedSender.reason;
        }
        
        processedEmail._dkimDomain = validatedSender.dkimDomain;
        processedEmail._emailServiceType = EmailServiceType.EXTERNAL;
        processedEmail._emailId = emailId;

        // Registrar evento de auditoria para cada email do batch
        auditLogs.push(auditService.logEmailEvent({
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
        logger.error('Error processing email in batch', {
          userId,
          index: i,
          originalFrom: email.from,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Incluir email original em caso de erro
        processedEmails.push({
          ...email,
          _dkimDomain: 'ultrazend.com.br',
          _emailServiceType: EmailServiceType.EXTERNAL
        });
      }
    }

    // Atualizar o body com emails processados
    req.body.emails = processedEmails;

    // Aguardar todos os logs de auditoria serem processados
    if (auditLogs.length > 0) {
      try {
        await Promise.all(auditLogs);
        logger.debug('All batch audit logs processed successfully', {
          userId,
          auditLogCount: auditLogs.length
        });
      } catch (error) {
        logger.error('Error processing batch audit logs', {
          userId,
          error: error instanceof Error ? error.message : String(error),
          auditLogCount: auditLogs.length
        });
      }
    }

    if (corrections.length > 0) {
      logger.info('Batch email senders corrected by architecture middleware', {
        userId,
        totalEmails: emails.length,
        correctedCount: corrections.length,
        corrections: corrections.slice(0, 5) // Log apenas os primeiros 5
      });
    }

    logger.debug('Email architecture batch middleware completed', {
      userId,
      originalCount: emails.length,
      processedCount: processedEmails.length,
      correctedCount: corrections.length
    });

    next();
  } catch (error) {
    logger.error('Email architecture batch middleware error', {
      userId: req.user?.id,
      emailCount: req.body?.emails?.length,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Em caso de erro, permitir que o sistema antigo funcione
    logger.warn('Falling back to legacy batch email processing due to middleware error');
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