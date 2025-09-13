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

export default router;