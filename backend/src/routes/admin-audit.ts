import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

/**
 * ENDPOINT ADMINISTRATIVO TEMPORÁRIO
 * Diagnostica e corrige domínios com user_id incorreto
 */
router.post('/fix-domain-ownership', 
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const currentUserId = req.user!.id;
    
    logger.warn('ADMIN AUDIT: Domain ownership fix initiated', { 
      userId: currentUserId,
      userEmail: req.user!.email 
    });

    try {
      // 1. Verificar todos os domínios no banco
      const allDomains = await db('domains')
        .select('id', 'domain_name', 'user_id', 'created_at')
        .orderBy('created_at', 'desc');

      // 2. Verificar todos os usuários
      const allUsers = await db('users')
        .select('id', 'email', 'name');

      // 3. Identificar domínios órfãos (user_id não existe)
      const userIds = new Set(allUsers.map(u => u.id));
      const orphanDomains = allDomains.filter(d => !userIds.has(d.user_id));

      // 4. Agrupar domínios por usuário
      const domainsByUser = allUsers.map(user => ({
        user,
        domains: allDomains.filter(d => d.user_id === user.id)
      }));

      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalDomains: allDomains.length,
          totalUsers: allUsers.length,
          orphanDomains: orphanDomains.length,
          currentUser: {
            id: currentUserId,
            email: req.user!.email,
            domainCount: allDomains.filter(d => d.user_id === currentUserId).length
          }
        },
        orphanDomains: orphanDomains.map(d => ({
          id: d.id,
          domain_name: d.domain_name,
          invalid_user_id: d.user_id,
          created_at: d.created_at
        })),
        domainsByUser: domainsByUser.filter(item => item.domains.length > 0)
      };

      logger.warn('ADMIN AUDIT: Domain ownership report', report);

      res.json({
        success: true,
        message: 'Domain ownership audit completed',
        data: report
      });

    } catch (error) {
      logger.error('ADMIN AUDIT: Failed to audit domain ownership', {
        error: error instanceof Error ? error.message : String(error),
        userId: currentUserId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to audit domain ownership'
      });
    }
  })
);

/**
 * Remove domínios órfãos (user_id inválido)
 */
router.delete('/remove-orphan-domains',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const currentUserId = req.user!.id;
    
    logger.warn('ADMIN AUDIT: Orphan domain removal initiated', { 
      userId: currentUserId,
      userEmail: req.user!.email 
    });

    try {
      // Encontrar usuários válidos
      const validUserIds = await db('users').pluck('id');
      
      // Encontrar domínios órfãos
      const orphanDomains = await db('domains')
        .select('id', 'domain_name', 'user_id')
        .whereNotIn('user_id', validUserIds);

      if (orphanDomains.length === 0) {
        return res.json({
          success: true,
          message: 'No orphan domains found',
          data: { removedCount: 0 }
        });
      }

      const orphanIds = orphanDomains.map(d => d.id);

      // Remover em transação
      const removedCount = await db.transaction(async (trx) => {
        // Remover chaves DKIM associadas
        await trx('dkim_keys').whereIn('domain_id', orphanIds).del();
        
        // Remover registros de verificação DNS
        await trx('dns_verification_records').whereIn('domain_id', orphanIds).del();
        
        // Remover histórico de verificação
        await trx('domain_verification_history').whereIn('domain_id', orphanIds).del();
        
        // Remover os domínios órfãos
        const deleted = await trx('domains').whereIn('id', orphanIds).del();
        
        return deleted;
      });

      logger.warn('ADMIN AUDIT: Orphan domains removed', {
        removedCount,
        orphanDomains: orphanDomains.map(d => ({
          id: d.id,
          domain_name: d.domain_name,
          invalid_user_id: d.user_id
        })),
        userId: currentUserId
      });

      res.json({
        success: true,
        message: `Removed ${removedCount} orphan domains`,
        data: { 
          removedCount,
          removedDomains: orphanDomains
        }
      });

    } catch (error) {
      logger.error('ADMIN AUDIT: Failed to remove orphan domains', {
        error: error instanceof Error ? error.message : String(error),
        userId: currentUserId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to remove orphan domains'
      });
    }
  })
);

export default router;