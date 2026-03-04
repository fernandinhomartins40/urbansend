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

const parseTemplateTags = (tags: unknown): string[] => {
  if (Array.isArray(tags)) {
    return tags.filter((value): value is string => typeof value === 'string');
  }

  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeTemplate = (template: any) => ({
  ...template,
  variables: parseTemplateVariables(template?.variables),
  tags: parseTemplateTags(template?.tags)
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
      user_id: accountUserId,
      name: req.body.name,
      subject: req.body.subject,
      html_content: req.body.html_content || null,
      text_content: req.body.text_content || null,
      description: req.body.description || null,
      category: req.body.category || 'general',
      tags: JSON.stringify(req.body.tags || []),
      variables: JSON.stringify(req.body.variables || []),
      template_type: 'user',
      is_public: Boolean(req.body.is_public),
      is_active: true,
      industry: req.body.industry || null,
      difficulty_level: req.body.difficulty_level || 'easy',
      estimated_time_minutes: req.body.estimated_time_minutes || 5,
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
      name: req.body.name,
      subject: req.body.subject,
      html_content: req.body.html_content || null,
      text_content: req.body.text_content || null,
      description: req.body.description || null,
      category: req.body.category || existingTemplate.category || 'general',
      tags: JSON.stringify(req.body.tags || []),
      variables: JSON.stringify(req.body.variables || []),
      is_public: typeof req.body.is_public === 'boolean' ? req.body.is_public : Boolean(existingTemplate.is_public),
      industry: req.body.industry || existingTemplate.industry || null,
      difficulty_level: req.body.difficulty_level || existingTemplate.difficulty_level || 'easy',
      estimated_time_minutes: req.body.estimated_time_minutes || existingTemplate.estimated_time_minutes || 5,
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
