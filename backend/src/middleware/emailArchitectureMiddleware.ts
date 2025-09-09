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
    const { from_email } = req.body;
    const userId = req.user!.id;
    
    logger.debug('Applying email architecture middleware', {
      userId,
      originalFrom: from_email,
      endpoint: req.path
    });

    // Criar serviço de email externo para validação
    const externalEmailService = await EmailServiceFactory.createExternalService();
    
    // Testar se o serviço está funcionando
    const serviceHealthy = await externalEmailService.testConnection?.();
    if (!serviceHealthy) {
      logger.error('External email service health check failed', { userId });
      return res.status(500).json({
        error: 'Email service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Usar DomainValidator para validar e potencialmente corrigir o sender
    const domainValidator = (await import('../services/DomainValidator')).DomainValidator;
    const validator = new domainValidator();
    
    const validatedSender = await validator.validateSenderDomain(userId, from_email);
    
    // Aplicar correções se necessário
    if (validatedSender.fallback) {
      logger.info('Email sender corrected by architecture middleware', {
        userId,
        originalFrom: from_email,
        correctedFrom: validatedSender.email,
        reason: validatedSender.reason
      });
      
      // Atualizar o from_email no body da requisição
      req.body.from_email = validatedSender.email;
      
      // Adicionar metadados para auditoria
      req.body._senderCorrected = true;
      req.body._originalFrom = from_email;
      req.body._correctionReason = validatedSender.reason;
    }

    // Adicionar informações do DKIM domain para o processamento posterior
    req.body._dkimDomain = validatedSender.dkimDomain;
    req.body._emailServiceType = EmailServiceType.EXTERNAL;

    // Registrar evento de auditoria
    const auditService = EmailAuditService.getInstance();
    const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await auditService.logEmailEvent({
      userId,
      emailId,
      originalFrom: from_email,
      finalFrom: req.body.from_email,
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

    // Armazenar emailId no request para uso posterior
    req.body._emailId = emailId;
    
    logger.debug('Email architecture middleware completed', {
      userId,
      finalFrom: req.body.from,
      wasCorrected: validatedSender.fallback || false,
      dkimDomain: validatedSender.dkimDomain
    });

    next();
  } catch (error) {
    logger.error('Email architecture middleware error', {
      userId: req.user?.id,
      originalFrom: req.body?.from_email,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Em caso de erro, permitir que o sistema antigo funcione
    // mas com um log de aviso
    logger.warn('Falling back to legacy email processing due to middleware error');
    next();
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