/**
 * 🚀 EMAILS V2 - ROTA HÍBRIDA COM INTEGRAÇÃO DE DOMÍNIOS
 * Fase 3 do PLANO_INTEGRACAO_SEGURA.md
 * 
 * Nova rota que integra EmailValidator com sistema de envio de emails
 * Valida propriedade do domínio antes de enviar
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, sendEmailSchema } from '../middleware/validation';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { emailSendRateLimit } from '../middleware/rateLimiting';
import { queueService } from '../services/queueService';
import { SimpleEmailValidator } from '../email/EmailValidator';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const router = Router();
const emailValidator = new SimpleEmailValidator();

/**
 * Extrair domínio do endereço de email
 */
function extractDomain(email: string): string | null {
  try {
    if (!email || typeof email !== 'string') {
      return null;
    }
    
    const trimmedEmail = email.trim();
    const atIndex = trimmedEmail.lastIndexOf('@');
    
    if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
      return null;
    }
    
    const domain = trimmedEmail.substring(atIndex + 1).toLowerCase();
    
    // Validação básica do domínio
    if (domain.length === 0 || domain.includes(' ') || !domain.includes('.')) {
      return null;
    }
    
    return domain;
  } catch (error) {
    logger.debug('Failed to extract domain', { email, error });
    return null;
  }
}

/**
 * POST /send-v2 - Nova rota de envio com validação de domínio integrada
 * 
 * Fluxo:
 * 1. Validar domínio primeiro usando EmailValidator
 * 2. Se não verificado, retornar erro com redirecionamento
 * 3. Se verificado, processar email normalmente
 */
router.post('/send-v2', 
  authenticateJWT,
  requirePermission('email:send'),
  emailSendRateLimit,
  validateRequest({ body: sendEmailSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { from, to, subject, html, text } = req.body;
    
    logger.info('Email send request v2', {
      userId,
      from,
      to: Array.isArray(to) ? to.length + ' recipients' : to,
      subject,
      phase: '3.1'
    });

    try {
      // 1. Validar domínio primeiro
      const domain = extractDomain(from);
      
      if (!domain) {
        return res.status(400).json({
          error: 'Invalid email format in "from" field',
          code: 'INVALID_EMAIL_FORMAT',
          field: 'from'
        });
      }

      logger.debug('Checking domain ownership', {
        userId,
        domain,
        from
      });

      const domainCheck = await emailValidator.checkDomainOwnership(domain, userId);
      
      if (!domainCheck.verified) {
        logger.warn('Domain not verified, rejecting email', {
          userId,
          domain,
          from
        });

        return res.status(400).json({
          error: `Domain '${domain}' not verified. Please verify at /domains`,
          code: 'DOMAIN_NOT_VERIFIED',
          redirect: '/domains',
          domain,
          verification_required: true
        });
      }

      logger.info('Domain verified, proceeding with email', {
        userId,
        domain,
        verifiedAt: domainCheck.verifiedAt
      });
      
      // 2. Enviar email usando serviço existente
      const emailData = {
        ...req.body,
        userId
      };
      
      const job = await queueService.addEmailJob(emailData);
      
      logger.info('Email queued successfully', {
        userId,
        jobId: job.id,
        domain,
        verified: true
      });

      // 3. Retornar resposta com informações de verificação
      res.json({
        success: true,
        message: 'Email queued for delivery with verified domain',
        message_id: job.id,
        job_id: job.id,
        status: 'queued',
        domain_verified: true,
        domain,
        verified_at: domainCheck.verifiedAt,
        phase: '3.1'
      });
      
    } catch (error) {
      logger.error('Email send v2 failed', {
        userId,
        from,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'EMAIL_SEND_ERROR',
        phase: '3.1'
      });
    }
  })
);

/**
 * POST /send-v2-batch - Envio em lote com validação de domínio
 */
router.post('/send-v2-batch',
  authenticateJWT,
  requirePermission('email:send'),
  emailSendRateLimit,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        error: 'emails array is required and must not be empty',
        code: 'INVALID_BATCH_DATA'
      });
    }

    logger.info('Batch email send request v2', {
      userId,
      count: emails.length,
      phase: '3.1'
    });

    try {
      const results = [];
      const validEmails = [];
      
      // Validar cada email do lote
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const domain = extractDomain(email.from);
        
        if (!domain) {
          results.push({
            index: i,
            error: 'Invalid email format',
            code: 'INVALID_EMAIL_FORMAT',
            from: email.from
          });
          continue;
        }
        
        const domainCheck = await emailValidator.checkDomainOwnership(domain, userId);
        
        if (!domainCheck.verified) {
          results.push({
            index: i,
            error: `Domain '${domain}' not verified`,
            code: 'DOMAIN_NOT_VERIFIED',
            domain,
            from: email.from
          });
          continue;
        }
        
        // Email válido
        validEmails.push({
          ...email,
          userId,
          _index: i,
          _domain: domain,
          _verifiedAt: domainCheck.verifiedAt
        });
        
        results.push({
          index: i,
          status: 'validated',
          domain,
          verified_at: domainCheck.verifiedAt
        });
      }
      
      // Processar emails válidos se houver algum
      let job = null;
      if (validEmails.length > 0) {
        job = await queueService.addBatchEmailJob(validEmails);
        
        logger.info('Batch emails queued', {
          userId,
          totalEmails: emails.length,
          validEmails: validEmails.length,
          jobId: job.id
        });
      }
      
      res.json({
        success: true,
        message: 'Batch processed with domain validation',
        total_emails: emails.length,
        valid_emails: validEmails.length,
        failed_emails: emails.length - validEmails.length,
        job_id: job?.id || null,
        results,
        phase: '3.1'
      });
      
    } catch (error) {
      logger.error('Batch email send v2 failed', {
        userId,
        count: emails.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'BATCH_EMAIL_SEND_ERROR',
        phase: '3.1'
      });
    }
  })
);

/**
 * GET /test-domain/:domain - Endpoint para testar validação de domínio
 */
router.get('/test-domain/:domain',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { domain } = req.params;

    try {
      const domainCheck = await emailValidator.checkDomainOwnership(domain, userId);
      
      res.json({
        success: true,
        domain,
        result: domainCheck,
        phase: '3.1'
      });
      
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'DOMAIN_TEST_ERROR'
      });
    }
  })
);

/**
 * GET /status - Status da rota v2
 */
router.get('/status',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      status: 'active',
      version: '2.0',
      phase: '3.1',
      description: 'Email sending with domain validation integration',
      features: [
        'Domain ownership validation',
        'Automatic domain verification',
        'Clear error responses',
        'Batch processing support'
      ],
      endpoints: [
        'POST /send-v2',
        'POST /send-v2-batch',
        'GET /test-domain/:domain',
        'GET /status'
      ]
    });
  })
);

export default router;