import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import SharedTemplateService from '../services/SharedTemplateService';

const router = Router();

/**
 * GET /api/shared-templates/categories
 * Obter todas as categorias de templates
 */
router.get('/categories',
  asyncHandler(async (req, res: Response) => {
    const categories = await SharedTemplateService.getCategories();
    res.json({ categories });
  })
);

/**
 * GET /api/shared-templates/public
 * Obter templates públicos (sistema + compartilhados)
 * Query params: category, industry, difficulty, search, sort_by, sort_order, page, limit
 */
router.get('/public',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const filters = {
      category: req.query.category as string,
      industry: req.query.industry as string,
      difficulty: req.query.difficulty as 'easy' | 'medium' | 'advanced',
      template_type: req.query.template_type as 'user' | 'system' | 'shared',
      search: req.query.search as string,
      min_rating: req.query.min_rating ? parseFloat(req.query.min_rating as string) : undefined,
      sort_by: req.query.sort_by as 'rating' | 'usage' | 'date' | 'name',
      sort_order: req.query.sort_order as 'asc' | 'desc',
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof typeof filters] === undefined) {
        delete filters[key as keyof typeof filters];
      }
    });

    const userId = req.user?.id;
    const result = await SharedTemplateService.getPublicTemplates(filters, userId);
    res.json(result);
  })
);

/**
 * POST /api/shared-templates/:id/clone
 * Clonar um template público para o usuário
 */
router.post('/:id/clone',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    const customizations = req.body;

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'ID do template inválido' });
    }

    const clonedTemplate = await SharedTemplateService.cloneTemplate(
      templateId,
      userId,
      customizations
    );

    res.status(201).json({
      message: 'Template clonado com sucesso!',
      template: clonedTemplate
    });
  })
);

/**
 * POST /api/shared-templates/:id/favorite
 * Adicionar/remover template dos favoritos
 */
router.post('/:id/favorite',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.user!.id;

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'ID do template inválido' });
    }

    const result = await SharedTemplateService.toggleFavorite(templateId, userId);
    res.json(result);
  })
);

/**
 * GET /api/shared-templates/favorites
 * Obter templates favoritos do usuário
 */
router.get('/favorites',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await SharedTemplateService.getUserFavorites(userId, page, limit);
    res.json(result);
  })
);

/**
 * GET /api/shared-templates/system
 * Obter templates do sistema
 */
router.get('/system',
  asyncHandler(async (req, res: Response) => {
    const category = req.query.category as string;
    const templates = await SharedTemplateService.getSystemTemplates(category);
    res.json({ templates });
  })
);

/**
 * GET /api/shared-templates/:id/stats
 * Obter estatísticas de um template
 */
router.get('/:id/stats',
  asyncHandler(async (req, res: Response) => {
    const templateId = parseInt(req.params.id, 10);

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'ID do template inválido' });
    }

    const stats = await SharedTemplateService.getTemplateStats(templateId);
    res.json(stats);
  })
);

/**
 * POST /api/shared-templates/:id/record-usage
 * Registrar uso de template (para analytics)
 */
router.post('/:id/record-usage',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.user!.id;

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'ID do template inválido' });
    }

    await SharedTemplateService.recordUsage(templateId, userId);
    res.json({ message: 'Uso registrado com sucesso' });
  })
);

/**
 * POST /api/shared-templates/:id/rate
 * Avaliar um template (rating + review)
 */
router.post('/:id/rate',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    const { rating, review } = req.body;

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'ID do template inválido' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
    }

    const result = await SharedTemplateService.rateTemplate({
      template_id: templateId,
      user_id: userId,
      rating,
      review: review || null
    });
    res.json({ message: 'Avaliação registrada com sucesso', result });
  })
);

/**
 * GET /api/shared-templates/:id/reviews
 * Obter reviews de um template
 */
router.get('/:id/reviews',
  asyncHandler(async (req, res: Response) => {
    const templateId = parseInt(req.params.id, 10);
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'ID do template inválido' });
    }

    const reviews = await SharedTemplateService.getTemplateReviews(templateId, page, limit);
    res.json(reviews);
  })
);

/**
 * GET /api/shared-templates/collections
 * Obter coleções de templates
 */
router.get('/collections',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const isPublic = req.query.public === 'true';
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const collections = await SharedTemplateService.getCollections(userId, isPublic, page, limit);
    res.json(collections);
  })
);

/**
 * POST /api/shared-templates/collections
 * Criar nova coleção
 */
router.post('/collections',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { name, description, is_public } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome da coleção é obrigatório' });
    }

    const collection = await SharedTemplateService.createCollection(userId, {
      name: name.trim(),
      description: description?.trim(),
      is_public: Boolean(is_public)
    });

    res.status(201).json({ collection });
  })
);

/**
 * GET /api/shared-templates/collections/:id
 * Obter uma coleção específica
 */
router.get('/collections/:id',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const collectionId = parseInt(req.params.id, 10);
    const userId = req.user?.id;

    if (isNaN(collectionId)) {
      return res.status(400).json({ error: 'ID da coleção inválido' });
    }

    const collection = await SharedTemplateService.getCollection(collectionId, userId);

    if (!collection) {
      return res.status(404).json({ error: 'Coleção não encontrada' });
    }

    res.json({ collection });
  })
);

/**
 * POST /api/shared-templates/collections/:id/add-template
 * Adicionar template à coleção
 */
router.post('/collections/:id/add-template',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const collectionId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    const { template_id } = req.body;

    if (isNaN(collectionId) || !template_id) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }

    const result = await SharedTemplateService.addTemplateToCollection(collectionId, template_id, userId);
    res.json({ message: 'Template adicionado à coleção', result });
  })
);

/**
 * DELETE /api/shared-templates/collections/:id/remove-template/:templateId
 * Remover template da coleção
 */
router.delete('/collections/:id/remove-template/:templateId',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const collectionId = parseInt(req.params.id, 10);
    const templateId = parseInt(req.params.templateId, 10);
    const userId = req.user!.id;

    if (isNaN(collectionId) || isNaN(templateId)) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }

    await SharedTemplateService.removeTemplateFromCollection(collectionId, templateId, userId);
    res.json({ message: 'Template removido da coleção' });
  })
);

/**
 * GET /api/shared-templates/trending
 * Obter templates em tendência
 */
router.get('/trending',
  asyncHandler(async (req, res: Response) => {
    const period = req.query.period as 'day' | 'week' | 'month' || 'week';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const trending = await SharedTemplateService.getTrendingTemplates(period, limit);
    res.json({ templates: trending, period, limit });
  })
);

/**
 * GET /api/shared-templates/analytics
 * Obter analytics avançadas
 */
router.get('/analytics',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const templateId = req.query.template_id ? parseInt(req.query.template_id as string, 10) : undefined;
    const userId = req.user!.id;

    const analytics = await SharedTemplateService.getAdvancedAnalytics(templateId, userId);
    res.json(analytics);
  })
);

/**
 * POST /api/shared-templates/export
 * Export de templates em bulk
 */
router.post('/export',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { template_ids } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(template_ids) || template_ids.length === 0) {
      return res.status(400).json({ error: 'IDs de templates são obrigatórios' });
    }

    const exportData = await SharedTemplateService.exportTemplates(template_ids, userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="templates-export.json"');
    res.json(exportData);
  })
);

/**
 * POST /api/shared-templates/import
 * Import de templates em bulk
 */
router.post('/import',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { templates } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(templates) || templates.length === 0) {
      return res.status(400).json({ error: 'Templates para importar são obrigatórios' });
    }

    const result = await SharedTemplateService.importTemplates(templates, userId);
    res.json(result);
  })
);

export default router;