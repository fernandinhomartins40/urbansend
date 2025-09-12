/**
 * 🧪 ROTAS DE TESTE - INTEGRAÇÃO DOMÍNIOS ↔ EMAIL
 * TEMPORÁRIO - Apenas para validação da Fase 2
 * Status: Desenvolvimento/Teste
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { SimpleEmailValidator } from '../email/EmailValidator';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import db from '../config/database';

const router = Router();
const emailValidator = new SimpleEmailValidator();

/**
 * GET /test-domain-integration/:userId/:domain
 * Teste isolado da validação de domínio
 */
router.get('/test-domain-integration/:userId/:domain', 
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId, domain } = req.params;
    const userIdNum = parseInt(userId);

    if (isNaN(userIdNum)) {
      return res.status(400).json({
        error: 'Invalid userId parameter',
        code: 'INVALID_USER_ID'
      });
    }

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({
        error: 'Invalid domain parameter',
        code: 'INVALID_DOMAIN'
      });
    }

    logger.info('Test domain integration request', {
      userId: userIdNum,
      domain,
      endpoint: 'test-domain-integration'
    });

    try {
      const result = await emailValidator.checkDomainOwnership(domain, userIdNum);
      
      logger.info('Domain integration test result', {
        userId: userIdNum,
        domain,
        verified: result.verified,
        verifiedAt: result.verifiedAt
      });

      res.json({
        success: true,
        test: 'domain-integration',
        userId: userIdNum,
        domain,
        result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Domain integration test failed', {
        userId: userIdNum,
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Domain integration test failed',
        code: 'INTEGRATION_TEST_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

/**
 * GET /test-user-domains/:userId
 * Lista domínios de um usuário para teste
 */
router.get('/test-user-domains/:userId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const userIdNum = parseInt(userId);

    if (isNaN(userIdNum)) {
      return res.status(400).json({
        error: 'Invalid userId parameter',
        code: 'INVALID_USER_ID'
      });
    }

    try {
      const domains = await db('user_domains')
        .where('user_id', userIdNum)
        .select('*')
        .orderBy('created_at', 'desc');

      res.json({
        success: true,
        test: 'user-domains-list',
        userId: userIdNum,
        domains,
        count: domains.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get user domains for test', {
        userId: userIdNum,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to get user domains',
        code: 'GET_DOMAINS_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

/**
 * POST /test-create-domain
 * Criar domínio de teste (apenas para validação)
 */
router.post('/test-create-domain',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId, domain, verified = true } = req.body;

    if (!userId || !domain) {
      return res.status(400).json({
        error: 'userId and domain are required',
        code: 'MISSING_PARAMETERS'
      });
    }

    try {
      // Verificar se usuário existe
      const user = await db('users').where('id', userId).first();
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Criar ou atualizar domínio
      const existingDomain = await db('user_domains')
        .where('user_id', userId)
        .where('domain', domain.toLowerCase())
        .first();

      if (existingDomain) {
        // Atualizar
        await db('user_domains')
          .where('id', existingDomain.id)
          .update({
            verified,
            verified_at: verified ? new Date() : null,
            verification_method: 'test',
            updated_at: new Date()
          });

        return res.json({
          success: true,
          action: 'updated',
          domain,
          verified,
          message: 'Test domain updated successfully'
        });
      } else {
        // Criar novo
        const [domainId] = await db('user_domains').insert({
          user_id: userId,
          domain: domain.toLowerCase(),
          verified,
          verified_at: verified ? new Date() : null,
          verification_method: 'test',
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.json({
          success: true,
          action: 'created',
          domainId,
          domain,
          verified,
          message: 'Test domain created successfully'
        });
      }

    } catch (error) {
      logger.error('Failed to create test domain', {
        userId,
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Failed to create test domain',
        code: 'CREATE_DOMAIN_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

/**
 * GET /test-system-status
 * Status geral do sistema de integração
 */
router.get('/test-system-status',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Testar conexão com banco
      const dbTest = await db.raw('SELECT 1 as test');
      
      // Contar domínios na base
      const domainsCount = await db('user_domains').count('* as count').first();
      
      // Testar EmailValidator
      const validator = new SimpleEmailValidator();
      const validatorTest = await validator.checkDomainOwnership('test-non-existent.com', 1);

      res.json({
        success: true,
        test: 'system-status',
        status: {
          database: dbTest ? 'connected' : 'error',
          emailValidator: validatorTest.verified === false ? 'working' : 'error',
          totalDomains: domainsCount?.count || 0
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        error: 'System status check failed',
        code: 'SYSTEM_STATUS_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

export default router;