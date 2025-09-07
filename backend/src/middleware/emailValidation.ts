import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { asyncHandler } from './errorHandler';
import { logger } from '../config/logger';
import db from '../config/database';

/**
 * Middleware de validação de remetente de email
 * 
 * Garante que apenas usuários com domínios verificados possam enviar emails
 * de seus próprios domínios. Caso contrário, força o uso do domínio principal
 * da UltraZend com identificação do usuário.
 */
export const validateSenderMiddleware = asyncHandler(async (
  req: AuthenticatedRequest, 
  _res: Response, 
  next: NextFunction
) => {
  const { from } = req.body;
  const userId = req.user!.id;
  
  if (!from) {
    logger.error('Missing from field in email request', { userId });
    throw new Error('Campo "from" é obrigatório');
  }

  try {
    // Extrair domínio do email
    const domain = extractDomainFromEmail(from);
    
    if (!domain) {
      logger.warn('Invalid email format in from field', { from, userId });
      throw new Error('Formato de email inválido no campo "from"');
    }

    // Verificar se é domínio interno (da aplicação)
    if (isInternalDomain(domain)) {
      logger.debug('Internal domain detected, allowing as-is', { domain, userId });
      return next();
    }

    // Verificar se o usuário possui o domínio verificado
    const ownsDomain = await checkDomainOwnership(userId, domain);
    
    if (ownsDomain) {
      logger.debug('User owns verified domain, allowing original sender', { 
        domain, 
        userId,
        from 
      });
      return next();
    }

    // Domínio não pertence ao usuário - aplicar correção
    const originalFrom = from;
    const correctedFrom = `noreply+user${userId}@ultrazend.com.br`;
    
    req.body.from = correctedFrom;
    
    // Log detalhado para auditoria
    logger.warn('Email sender corrected to safe domain', { 
      userId,
      originalFrom, 
      correctedFrom,
      domain,
      reason: ownsDomain === null ? 'Domain not owned' : 'Domain not verified'
    });

    // Adicionar metadados sobre a correção para possível auditoria futura
    req.body._senderCorrected = {
      original: originalFrom,
      corrected: correctedFrom,
      reason: ownsDomain === null ? 'Domain not owned' : 'Domain not verified',
      timestamp: new Date()
    };

    next();

  } catch (error) {
    logger.error('Error in sender validation middleware', { 
      error: (error as Error).message,
      userId, 
      from 
    });
    throw error;
  }
});

/**
 * Extrai o domínio de um endereço de email
 */
function extractDomainFromEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/**
 * Verifica se o domínio é interno (da aplicação UltraZend)
 */
function isInternalDomain(domain: string): boolean {
  const internalDomains = [
    'ultrazend.com.br',
    'mail.ultrazend.com.br',
    'www.ultrazend.com.br'
  ];
  
  return internalDomains.includes(domain.toLowerCase());
}

/**
 * Verifica se o usuário possui o domínio e se está verificado
 * 
 * @param userId - ID do usuário
 * @param domain - Domínio a ser verificado
 * @returns true se possuir e estiver verificado, false se não verificado, null se não possuir
 */
async function checkDomainOwnership(userId: number, domain: string): Promise<boolean | null> {
  try {
    const domainRecord = await db('domains')
      .where('user_id', userId)
      .where('domain_name', domain)
      .first();
      
    if (!domainRecord) {
      return null; // Usuário não possui o domínio
    }
    
    return domainRecord.is_verified === true; // true se verificado, false se não verificado
    
  } catch (error) {
    logger.error('Database error checking domain ownership', { 
      error: (error as Error).message,
      userId,
      domain 
    });
    
    // Em caso de erro no banco, assumir que não possui por segurança
    return null;
  }
}

/**
 * Middleware para logging de correções de sender (opcional - para auditoria futura)
 */
/**
 * Middleware de validação de remetente para batch de emails
 * 
 * Aplica a mesma validação do validateSenderMiddleware para cada email no batch
 */
export const validateBatchSenderMiddleware = asyncHandler(async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  const { emails } = req.body;
  const userId = req.user!.id;

  if (!emails || !Array.isArray(emails)) {
    logger.error('Missing or invalid emails array in batch request', { userId });
    throw new Error('Campo "emails" deve ser um array válido');
  }

  let correctionCount = 0;
  const correctedEmails = [];

  for (let i = 0; i < emails.length; i++) {
    const emailData = emails[i];
    const { from } = emailData;

    if (!from) {
      logger.error('Missing from field in batch email', { userId, emailIndex: i });
      throw new Error(`Campo "from" é obrigatório no email ${i + 1} do batch`);
    }

    try {
      // Extrair domínio do email
      const domain = extractDomainFromEmail(from);
      
      if (!domain) {
        logger.warn('Invalid email format in batch email', { from, userId, emailIndex: i });
        throw new Error(`Formato de email inválido no email ${i + 1} do batch`);
      }

      // Verificar se é domínio interno (da aplicação)
      if (isInternalDomain(domain)) {
        correctedEmails.push(emailData);
        continue;
      }

      // Verificar se o usuário possui o domínio verificado
      const ownsDomain = await checkDomainOwnership(userId, domain);
      
      if (ownsDomain) {
        correctedEmails.push(emailData);
        continue;
      }

      // Domínio não pertence ao usuário - aplicar correção
      const originalFrom = from;
      const correctedFrom = `noreply+user${userId}@ultrazend.com.br`;
      
      const correctedEmail = {
        ...emailData,
        from: correctedFrom,
        _senderCorrected: {
          original: originalFrom,
          corrected: correctedFrom,
          reason: ownsDomain === null ? 'Domain not owned' : 'Domain not verified',
          timestamp: new Date()
        }
      };

      correctedEmails.push(correctedEmail);
      correctionCount++;

      // Log da correção
      logger.warn('Batch email sender corrected', { 
        userId,
        emailIndex: i,
        originalFrom, 
        correctedFrom,
        domain,
        reason: ownsDomain === null ? 'Domain not owned' : 'Domain not verified'
      });

    } catch (error) {
      logger.error('Error validating batch email sender', { 
        error: (error as Error).message,
        userId,
        emailIndex: i,
        from 
      });
      throw new Error(`Erro no email ${i + 1} do batch: ${(error as Error).message}`);
    }
  }

  // Atualizar o batch com os emails corrigidos
  req.body.emails = correctedEmails;

  // Log do resultado do batch
  if (correctionCount > 0) {
    logger.info('Batch sender validation completed', {
      userId,
      totalEmails: emails.length,
      correctedCount: correctionCount,
      correctionRate: ((correctionCount / emails.length) * 100).toFixed(2) + '%'
    });
  }

  next();
});

export const logSenderCorrections = asyncHandler(async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  // Este middleware pode ser usado após o processamento do email
  // para registrar estatísticas ou criar logs de auditoria detalhados
  
  if (req.body._senderCorrected) {
    const correction = req.body._senderCorrected;
    
    // Aqui poderia salvar em uma tabela de auditoria no futuro
    logger.info('Sender correction audit log', {
      userId: req.user!.id,
      correction: {
        original: correction.original,
        corrected: correction.corrected,
        reason: correction.reason,
        timestamp: correction.timestamp
      }
    });
    
    // Remover metadados antes de continuar
    delete req.body._senderCorrected;
  }
  
  next();
});