const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');
const { z } = require('zod');
const { SegmentationService } = require('../services/SegmentationService');
const db = require('../config/database');

const router = Router();
router.use(authenticateJWT);

// Schema de validação para regras de segmentação
const segmentRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.string(),
  type: z.enum(['demographic', 'behavior', 'engagement', 'custom']).optional()
});

const segmentCriteriaSchema = z.object({
  rules: z.array(segmentRuleSchema),
  operator: z.enum(['AND', 'OR']).default('AND')
});

const createSegmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  criteria: segmentCriteriaSchema,
  auto_update: z.boolean().default(true),
  update_frequency_minutes: z.number().int().min(5).max(1440).default(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  settings: z.object({}).optional()
});

// POST /segmentation/preview - Calcular preview de audiência
router.post('/preview',
  validateRequest({ body: segmentCriteriaSchema }),
  asyncHandler(async (req, res) => {
    const segmentationService = new SegmentationService();
    const preview = await segmentationService.calculateAudiencePreview(req.user.id, req.body);
    
    res.json({
      success: true,
      data: preview
    });
  })
);

// POST /segmentation/process - Processar segmentação e retornar contatos
router.post('/process',
  validateRequest({ body: segmentCriteriaSchema }),
  asyncHandler(async (req, res) => {
    const segmentationService = new SegmentationService();
    const contacts = await segmentationService.processSegmentation(req.user.id, req.body);
    
    res.json({
      success: true,
      data: {
        contacts: contacts,
        total: contacts.length,
        criteria: req.body
      }
    });
  })
);

// POST /segmentation/segments - Criar novo segmento dinâmico
router.post('/segments',
  validateRequest({ body: createSegmentSchema }),
  asyncHandler(async (req, res) => {
    const segmentationService = new SegmentationService();
    const segmentId = await segmentationService.saveSegment(req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      data: { segmentId },
      message: 'Segmento criado com sucesso'
    });
  })
);

// GET /segmentation/segments - Listar segmentos do usuário
router.get('/segments',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, type, active = 'true' } = req.query;
    const offset = (page - 1) * limit;

    let query = db('contact_segments')
      .where('user_id', req.user.id);

    if (type && type !== 'all') {
      query = query.where('type', type);
    }

    if (active !== 'all') {
      query = query.where('is_active', active === 'true');
    }

    const segments = await query
      .clone()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select([
        'id', 'name', 'description', 'type', 'is_active',
        'contact_count', 'last_calculated_at', 'auto_update',
        'update_frequency_minutes', 'color', 'created_at', 'updated_at'
      ]);

    const total = await query.clone().count('* as count').first();

    // Parse critérios para segmentos dinâmicos
    const parsedSegments = await Promise.all(segments.map(async segment => {
      let criteria = null;
      let criteria_description = null;
      
      if (segment.type === 'dynamic') {
        const fullSegment = await db('contact_segments')
          .where('id', segment.id)
          .select('criteria', 'criteria_description')
          .first();
        
        criteria = fullSegment.criteria ? JSON.parse(fullSegment.criteria) : null;
        criteria_description = fullSegment.criteria_description;
      }

      return {
        ...segment,
        criteria,
        criteria_description
      };
    }));

    res.json({
      success: true,
      data: {
        segments: parsedSegments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total.count || 0,
          pages: Math.ceil((total.count || 0) / limit)
        }
      }
    });
  })
);

// GET /segmentation/segments/:id - Obter segmento específico
router.get('/segments/:id',
  asyncHandler(async (req, res) => {
    const segment = await db('contact_segments')
      .where('id', parseInt(req.params.id))
      .where('user_id', req.user.id)
      .first();

    if (!segment) {
      return res.status(404).json({
        success: false,
        message: 'Segmento não encontrado'
      });
    }

    // Parse JSON fields
    segment.criteria = segment.criteria ? JSON.parse(segment.criteria) : null;
    segment.settings = segment.settings ? JSON.parse(segment.settings) : null;

    res.json({
      success: true,
      data: segment
    });
  })
);

// PUT /segmentation/segments/:id - Atualizar segmento
router.put('/segments/:id',
  validateRequest({ body: createSegmentSchema.partial() }),
  asyncHandler(async (req, res) => {
    const segmentId = parseInt(req.params.id);
    
    // Verificar se o segmento existe e pertence ao usuário
    const existingSegment = await db('contact_segments')
      .where('id', segmentId)
      .where('user_id', req.user.id)
      .first();

    if (!existingSegment) {
      return res.status(404).json({
        success: false,
        message: 'Segmento não encontrado'
      });
    }

    const updates = { ...req.body };
    
    // Serializar campos JSON
    if (updates.criteria) {
      updates.criteria = JSON.stringify(updates.criteria);
      
      // Atualizar descrição dos critérios se fornecida
      const segmentationService = new SegmentationService();
      updates.criteria_description = segmentationService.buildCriteriaDescription(req.body.criteria);
    }
    
    if (updates.settings) {
      updates.settings = JSON.stringify(updates.settings);
    }

    updates.updated_at = new Date();

    await db('contact_segments')
      .where('id', segmentId)
      .update(updates);

    // Se os critérios mudaram, recalcular membros
    if (req.body.criteria) {
      const segmentationService = new SegmentationService();
      await segmentationService.updateSegmentMembers(segmentId);
    }

    res.json({
      success: true,
      message: 'Segmento atualizado com sucesso'
    });
  })
);

// DELETE /segmentation/segments/:id - Excluir segmento
router.delete('/segments/:id',
  asyncHandler(async (req, res) => {
    const segmentId = parseInt(req.params.id);
    
    const deleted = await db('contact_segments')
      .where('id', segmentId)
      .where('user_id', req.user.id)
      .del();

    if (deleted === 0) {
      return res.status(404).json({
        success: false,
        message: 'Segmento não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Segmento excluído com sucesso'
    });
  })
);

// POST /segmentation/segments/:id/recalculate - Recalcular membros do segmento
router.post('/segments/:id/recalculate',
  asyncHandler(async (req, res) => {
    const segmentId = parseInt(req.params.id);
    
    // Verificar se o segmento existe e pertence ao usuário
    const segment = await db('contact_segments')
      .where('id', segmentId)
      .where('user_id', req.user.id)
      .first();

    if (!segment) {
      return res.status(404).json({
        success: false,
        message: 'Segmento não encontrado'
      });
    }

    const segmentationService = new SegmentationService();
    const memberCount = await segmentationService.updateSegmentMembers(segmentId);

    res.json({
      success: true,
      data: { memberCount },
      message: 'Segmento recalculado com sucesso'
    });
  })
);

// GET /segmentation/segments/:id/members - Obter membros do segmento
router.get('/segments/:id/members',
  asyncHandler(async (req, res) => {
    const segmentId = parseInt(req.params.id);
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verificar se o segmento existe e pertence ao usuário
    const segment = await db('contact_segments')
      .where('id', segmentId)
      .where('user_id', req.user.id)
      .first();

    if (!segment) {
      return res.status(404).json({
        success: false,
        message: 'Segmento não encontrado'
      });
    }

    const members = await db('contact_segment_members')
      .join('contacts', 'contact_segment_members.contact_id', 'contacts.id')
      .where('contact_segment_members.segment_id', segmentId)
      .orderBy('contact_segment_members.added_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select([
        'contacts.id',
        'contacts.email',
        'contacts.first_name',
        'contacts.last_name',
        'contacts.full_name',
        'contacts.phone',
        'contacts.company',
        'contacts.engagement_score',
        'contacts.last_activity_at',
        'contacts.subscription_status',
        'contact_segment_members.added_at',
        'contact_segment_members.added_by'
      ]);

    const total = await db('contact_segment_members')
      .where('segment_id', segmentId)
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        members,
        segment: {
          id: segment.id,
          name: segment.name,
          contact_count: segment.contact_count
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total.count || 0,
          pages: Math.ceil((total.count || 0) / limit)
        }
      }
    });
  })
);

// GET /segmentation/stats - Estatísticas de segmentação do usuário
router.get('/stats',
  asyncHandler(async (req, res) => {
    const segmentationService = new SegmentationService();
    const stats = await segmentationService.getSegmentationStats(req.user.id);

    res.json({
      success: true,
      data: stats
    });
  })
);

// GET /segmentation/fields - Obter campos disponíveis para segmentação
router.get('/fields',
  asyncHandler(async (req, res) => {
    const fields = {
      demographic: [
        { value: 'email', label: 'Email', type: 'text' },
        { value: 'first_name', label: 'Nome', type: 'text' },
        { value: 'last_name', label: 'Sobrenome', type: 'text' },
        { value: 'phone', label: 'Telefone', type: 'text' },
        { value: 'company', label: 'Empresa', type: 'text' },
        { value: 'job_title', label: 'Cargo', type: 'text' },
        { value: 'country', label: 'País', type: 'text' },
        { value: 'city', label: 'Cidade', type: 'text' },
        { value: 'state', label: 'Estado', type: 'text' },
        { value: 'language', label: 'Idioma', type: 'text' },
        { value: 'created_at', label: 'Data de Cadastro', type: 'date' },
        { value: 'subscribed_at', label: 'Data de Inscrição', type: 'date' }
      ],
      behavior: [
        { value: 'last_activity_at', label: 'Última Atividade', type: 'date' },
        { value: 'subscription_status', label: 'Status da Inscrição', type: 'text' },
        { value: 'status', label: 'Status do Contato', type: 'text' }
      ],
      engagement: [
        { value: 'total_emails_sent', label: 'Total de Emails Enviados', type: 'number' },
        { value: 'total_emails_opened', label: 'Total de Emails Abertos', type: 'number' },
        { value: 'total_emails_clicked', label: 'Total de Emails Clicados', type: 'number' },
        { value: 'total_emails_bounced', label: 'Total de Emails Rejeitados', type: 'number' },
        { value: 'engagement_score', label: 'Score de Engajamento', type: 'number' },
        { value: 'last_opened_at', label: 'Último Email Aberto', type: 'date' },
        { value: 'last_clicked_at', label: 'Último Email Clicado', type: 'date' }
      ],
      custom: [
        { value: 'custom_fields', label: 'Campos Personalizados', type: 'text' },
        { value: 'tags', label: 'Tags', type: 'text' }
      ]
    };

    const operators = {
      text: [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' },
        { value: 'contains', label: 'Contém' },
        { value: 'starts_with', label: 'Começa com' },
        { value: 'ends_with', label: 'Termina com' },
        { value: 'is_empty', label: 'Está vazio' },
        { value: 'is_not_empty', label: 'Não está vazio' }
      ],
      number: [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' },
        { value: 'greater_than', label: 'Maior que' },
        { value: 'less_than', label: 'Menor que' },
        { value: 'greater_equal', label: 'Maior ou igual a' },
        { value: 'less_equal', label: 'Menor ou igual a' },
        { value: 'between', label: 'Entre' }
      ],
      date: [
        { value: 'equals', label: 'Igual a' },
        { value: 'before', label: 'Antes de' },
        { value: 'after', label: 'Depois de' },
        { value: 'between', label: 'Entre' },
        { value: 'last_days', label: 'Últimos X dias' },
        { value: 'next_days', label: 'Próximos X dias' }
      ]
    };

    res.json({
      success: true,
      data: { fields, operators }
    });
  })
);

module.exports = router;