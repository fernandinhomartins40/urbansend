import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { verified_only, sort = 'created_at', order = 'desc' } = req.query;
  
  let query = db('domains').where('user_id', req.user!.id);
  
  // Filtrar apenas domínios verificados se solicitado
  if (verified_only === 'true') {
    query = query.where('is_verified', true);
  }
  
  // Aplicar ordenação
  const domains = await query.orderBy(sort as string, order as string);
  
  // Calcular estatísticas para cada domínio e adicionar verification_status baseado em is_verified
  const domainsWithStats = domains.map(domain => ({
    ...domain,
    verification_status: domain.is_verified ? 'verified' : 'pending', // 🔧 FIX: Calcular status baseado em is_verified
    configuration_score: [
      domain.dkim_enabled,
      domain.spf_enabled, 
      domain.dmarc_enabled
    ].filter(Boolean).length
  }));
  
  // Contar totais por status
  const stats = {
    total: domains.length,
    verified: domains.filter(d => d.is_verified).length,
    pending: domains.filter(d => !d.is_verified).length,
    failed: 0 // Não temos campo específico para failed, consideramos 0
  };
  
  res.json({ 
    data: {
      domains: domainsWithStats,
      stats
    },
    success: true
  });
}));

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const insertResult = await db('domains').insert({
    ...req.body,
    user_id: req.user!.id,
    created_at: new Date()
  });
  
  const domainId = insertResult[0];
  const domain = await db('domains').where('id', domainId).first();
  res.status(201).json({ domain });
}));

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const domain = await db('domains')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();
    
  if (!domain) {
    return res.status(404).json({ error: 'Domínio não encontrado' });
  }
  
  res.json({ domain });
}));

router.post('/:id/verify', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  // Verificar se domínio pertence ao usuário
  const domain = await db('domains')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();
    
  if (!domain) {
    return res.status(404).json({ error: 'Domínio não encontrado' });
  }
  
  // 🔧 CORREÇÃO CRÍTICA: Implementar verificação DNS REAL
  const { DomainVerificationService } = await import('../services/DomainVerificationService');
  const verificationService = new DomainVerificationService();
  
  try {
    const verificationResult = await verificationService.verifyAndUpdateDomain(parseInt(id));
    
    if (verificationResult.success) {
      res.json({ 
        message: 'Domínio verificado com sucesso',
        verification: {
          spf: verificationResult.spf.verified,
          dkim: verificationResult.dkim.verified, 
          dmarc: verificationResult.dmarc.verified,
          timestamp: verificationResult.timestamp
        }
      });
    } else {
      res.status(400).json({ 
        error: 'Falha na verificação DNS',
        details: {
          spf: {
            verified: verificationResult.spf.verified,
            error: verificationResult.spf.error
          },
          dkim: {
            verified: verificationResult.dkim.verified,
            error: verificationResult.dkim.error
          },
          dmarc: {
            verified: verificationResult.dmarc.verified,
            error: verificationResult.dmarc.error
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro interno na verificação DNS',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}));

router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const deleted = await db('domains')
    .where('id', id)
    .where('user_id', req.user!.id)
    .del();
    
  if (deleted === 0) {
    return res.status(404).json({ error: 'Domínio não encontrado' });
  }
  
  res.json({ message: 'Domínio deletado com sucesso' });
}));

export default router;