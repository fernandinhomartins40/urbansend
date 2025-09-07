const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');
const { z } = require('zod');
const { CampaignService } = require('../services/CampaignService');

const router = Router();
router.use(authenticateJWT);

// Schemas de validação
const createCampaignSchema = z.object({
  name: z.string().min(1, 'Nome da campanha é obrigatório').max(255),
  description: z.string().optional(),
  type: z.enum(['one_time', 'recurring', 'trigger', 'a_b_test']).default('one_time'),
  template_id: z.number().int().positive().optional(),
  subject_line: z.string().max(255).optional(),
  from_email: z.string().email().optional(),
  from_name: z.string().max(100).optional(),
  reply_to: z.string().email().optional(),
  scheduled_at: z.string().datetime().optional(),
  segment_criteria: z.object({}).optional(),
  recipient_list: z.array(z.object({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    custom_fields: z.object({}).optional()
  })).optional(),
  use_segmentation: z.boolean().default(false),
  send_settings: z.object({}).optional(),
  tracking_settings: z.object({}).optional(),
  metadata: z.object({}).optional()
});

const updateCampaignSchema = createCampaignSchema.partial();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc')
});

const scheduleCampaignSchema = z.object({
  scheduled_at: z.string().datetime()
});

// GET /campaigns - Listar campanhas
router.get('/', 
  validateRequest({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const result = await campaignService.getCampaigns(req.user.id, req.query);
    
    res.json({
      success: true,
      data: result
    });
  })
);

// POST /campaigns - Criar campanha
router.post('/',
  validateRequest({ body: createCampaignSchema }),
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.createCampaign(req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      data: campaign,
      message: 'Campanha criada com sucesso'
    });
  })
);

// GET /campaigns/:id - Obter campanha por ID
router.get('/:id',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.getCampaignById(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: campaign
    });
  })
);

// PUT /campaigns/:id - Atualizar campanha
router.put('/:id',
  validateRequest({ body: updateCampaignSchema }),
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.updateCampaign(req.user.id, parseInt(req.params.id), req.body);
    
    res.json({
      success: true,
      data: campaign,
      message: 'Campanha atualizada com sucesso'
    });
  })
);

// DELETE /campaigns/:id - Excluir campanha
router.delete('/:id',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    await campaignService.deleteCampaign(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      message: 'Campanha excluída com sucesso'
    });
  })
);

// POST /campaigns/:id/duplicate - Duplicar campanha
router.post('/:id/duplicate',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.duplicateCampaign(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: campaign,
      message: 'Campanha duplicada com sucesso'
    });
  })
);

// GET /campaigns/:id/recipients - Obter destinatários da campanha
router.get('/:id/recipients',
  validateRequest({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const result = await campaignService.getCampaignRecipients(req.user.id, parseInt(req.params.id), req.query);
    
    res.json({
      success: true,
      data: result
    });
  })
);

// POST /campaigns/:id/recipients - Adicionar destinatários à campanha
router.post('/:id/recipients',
  validateRequest({ 
    body: z.object({
      recipients: z.array(z.object({
        email: z.string().email(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        custom_fields: z.object({}).optional()
      }))
    })
  }),
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    await campaignService.addRecipientsToCampaign(parseInt(req.params.id), req.body.recipients);
    
    res.json({
      success: true,
      message: 'Destinatários adicionados com sucesso'
    });
  })
);

// POST /campaigns/:id/schedule - Agendar campanha
router.post('/:id/schedule',
  validateRequest({ body: scheduleCampaignSchema }),
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.scheduleCampaign(req.user.id, parseInt(req.params.id), req.body.scheduled_at);
    
    res.json({
      success: true,
      data: campaign,
      message: 'Campanha agendada com sucesso'
    });
  })
);

// POST /campaigns/:id/send - Enviar campanha
router.post('/:id/send',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.sendCampaign(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: campaign,
      message: 'Campanha enviada com sucesso'
    });
  })
);

// POST /campaigns/:id/pause - Pausar campanha
router.post('/:id/pause',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.pauseCampaign(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: campaign,
      message: 'Campanha pausada com sucesso'
    });
  })
);

// POST /campaigns/:id/resume - Retomar campanha
router.post('/:id/resume',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaign = await campaignService.resumeCampaign(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: campaign,
      message: 'Campanha retomada com sucesso'
    });
  })
);

// GET /campaigns/:id/stats - Obter estatísticas da campanha
router.get('/:id/stats',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const stats = await campaignService.getCampaignStats(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: stats
    });
  })
);

// GET /campaigns/:id/executions - Obter histórico de execuções
router.get('/:id/executions',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const executions = await campaignService.getCampaignExecutions(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      data: executions
    });
  })
);

// GET /campaigns/stats/overview - Estatísticas gerais das campanhas
router.get('/stats/overview',
  asyncHandler(async (req, res) => {
    const campaignService = new CampaignService();
    const campaigns = await campaignService.getCampaigns(req.user.id, { limit: 1000 });
    
    // Calcular estatísticas gerais
    const stats = {
      total_campaigns: campaigns.campaigns.length,
      draft_campaigns: campaigns.campaigns.filter(c => c.status === 'draft').length,
      scheduled_campaigns: campaigns.campaigns.filter(c => c.status === 'scheduled').length,
      sent_campaigns: campaigns.campaigns.filter(c => c.status === 'sent').length,
      active_campaigns: campaigns.campaigns.filter(c => ['sending', 'scheduled'].includes(c.status)).length,
      
      total_emails_sent: campaigns.campaigns.reduce((sum, c) => sum + (c.emails_sent || 0), 0),
      total_recipients: campaigns.campaigns.reduce((sum, c) => sum + (c.total_recipients || 0), 0),
      
      avg_delivery_rate: campaigns.campaigns.length > 0 ? 
        campaigns.campaigns.reduce((sum, c) => sum + (c.delivery_rate || 0), 0) / campaigns.campaigns.length : 0,
      avg_open_rate: campaigns.campaigns.length > 0 ?
        campaigns.campaigns.reduce((sum, c) => sum + (c.open_rate || 0), 0) / campaigns.campaigns.length : 0,
      avg_click_rate: campaigns.campaigns.length > 0 ?
        campaigns.campaigns.reduce((sum, c) => sum + (c.click_rate || 0), 0) / campaigns.campaigns.length : 0
    };
    
    res.json({
      success: true,
      data: stats
    });
  })
);

module.exports = router;