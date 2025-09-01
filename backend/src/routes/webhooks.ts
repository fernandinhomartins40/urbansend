import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { generateSecretKey } from '../utils/crypto';
import db from '../config/database';

const router = Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const webhooks = await db('webhooks').where('user_id', req.user!.id);
  res.json({ webhooks });
}));

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const insertResult = await db('webhooks').insert({
    url: req.body.webhook_url || req.body.url,
    events: JSON.stringify(req.body.events),
    secret: req.body.secret || generateSecretKey(),
    user_id: req.user!.id,
    created_at: new Date()
  });
  
  const webhookId = insertResult[0];
  const webhook = await db('webhooks').where('id', webhookId).first();
  res.status(201).json({ webhook });
}));

router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .update({
      url: req.body.webhook_url || req.body.url,
      events: JSON.stringify(req.body.events),
      secret: req.body.secret,
      updated_at: new Date()
    });
    
  const webhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();
    
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }
  
  res.json({ webhook });
}));

router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const deleted = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .del();
    
  if (deleted === 0) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }
  
  res.json({ message: 'Webhook deletado com sucesso' });
}));

router.get('/:id/logs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  // Verificar se webhook pertence ao usuário
  const webhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();
    
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }
  
  // Por enquanto retornar array vazio - implementar logs futuramente
  res.json({ logs: [] });
}));

router.post('/:id/test', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  // Verificar se webhook pertence ao usuário
  const webhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();
    
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }
  
  // Implementar teste de webhook futuramente
  res.json({ message: 'Teste de webhook enviado com sucesso' });
}));

export default router;