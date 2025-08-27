import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, createTemplateSchema, idParamSchema } from '../middleware/validation';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();

// Get templates
router.get('/', 
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const templates = await db('email_templates')
      .where('user_id', req.user!.id)
      .orderBy('created_at', 'desc');
    
    res.json({ templates });
  })
);

// Create template
router.post('/',
  authenticateJWT,
  validateRequest({ body: createTemplateSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [templateId] = await db('email_templates').insert({
      ...req.body,
      user_id: req.user!.id,
      variables: JSON.stringify(req.body.variables || []),
      created_at: new Date(),
      updated_at: new Date()
    });

    const template = await db('email_templates').where('id', templateId).first();
    res.status(201).json({ template });
  })
);

// Get template by ID
router.get('/:id',
  authenticateJWT,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const template = await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', req.user!.id)
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ template });
  })
);

// Update template
router.put('/:id',
  authenticateJWT,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', req.user!.id)
      .update({
        ...req.body,
        variables: JSON.stringify(req.body.variables || []),
        updated_at: new Date()
      });

    const template = await db('email_templates')
      .where('id', req.params['id'])
      .first();

    res.json({ template });
  })
);

// Delete template
router.delete('/:id',
  authenticateJWT,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', req.user!.id)
      .del();

    res.json({ message: 'Template deleted successfully' });
  })
);

export default router;