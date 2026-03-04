import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, createTemplateSchema, idParamSchema, sanitizeEmailHtml, updateTemplateSchema } from '../middleware/validation';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';
import { getAccountUserId } from '../utils/accountContext';

const router = Router();

const parseTemplateVariables = (variables: unknown): string[] => {
  if (Array.isArray(variables)) {
    return variables.filter((value): value is string => typeof value === 'string');
  }

  if (typeof variables === 'string') {
    try {
      const parsed = JSON.parse(variables);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeTemplate = (template: any) => ({
  ...template,
  variables: parseTemplateVariables(template?.variables)
});

// Get templates
router.get('/', 
  authenticateJWT,
  requirePermission('template:read'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const accountUserId = getAccountUserId(req);
    const templates = await db('email_templates')
      .where('user_id', accountUserId)
      .orderBy('created_at', 'desc');
    
    res.json({ templates: templates.map(normalizeTemplate) });
  })
);

// Create template
router.post('/',
  authenticateJWT,
  requirePermission('template:write'),
  validateRequest({ body: createTemplateSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const accountUserId = getAccountUserId(req);
    const templateData = {
      ...req.body,
      user_id: accountUserId,
      variables: JSON.stringify(req.body.variables || []),
      created_at: new Date(),
      updated_at: new Date()
    };

    // Sanitize HTML content if provided
    if (templateData.html_content) {
      templateData.html_content = sanitizeEmailHtml(templateData.html_content);
    }

    const insertResult = await db('email_templates').insert(templateData);
    const templateId = insertResult[0];

    const template = await db('email_templates').where('id', templateId).first();
    res.status(201).json({ template: normalizeTemplate(template) });
  })
);

// Get template by ID
router.get('/:id',
  authenticateJWT,
  requirePermission('template:read'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const accountUserId = getAccountUserId(req);
    const template = await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', accountUserId)
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ template: normalizeTemplate(template) });
  })
);

// Update template
router.put('/:id',
  authenticateJWT,
  requirePermission('template:write'),
  validateRequest({ params: idParamSchema, body: updateTemplateSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const accountUserId = getAccountUserId(req);
    const existingTemplate = await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', accountUserId)
      .first();

    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const updateData = {
      ...req.body,
      variables: JSON.stringify(req.body.variables || []),
      updated_at: new Date()
    };

    // Sanitize HTML content if provided
    if (updateData.html_content) {
      updateData.html_content = sanitizeEmailHtml(updateData.html_content);
    }

    await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', accountUserId)
      .update(updateData);

    const template = await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', accountUserId)
      .first();

    res.json({ template: normalizeTemplate(template) });
  })
);

// Delete template
router.delete('/:id',
  authenticateJWT,
  requirePermission('template:write'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const accountUserId = getAccountUserId(req);
    const deleted = await db('email_templates')
      .where('id', req.params['id'])
      .where('user_id', accountUserId)
      .del();

    if (deleted === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully' });
  })
);

export default router;
