import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domains = await db('domains').where('user_id', req.user!.id);
  res.json({ domains });
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
  
  // DNS verification logic would go here
  await db('domains').where('id', id).update({
    verification_status: 'verified',
    verified_at: new Date()
  });
  
  res.json({ message: 'Domínio verificado com sucesso' });
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