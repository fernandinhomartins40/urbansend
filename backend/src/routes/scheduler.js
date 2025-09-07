const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = Router();
router.use(authenticateJWT);

// GET /scheduler/status - Status do scheduler
router.get('/status', 
  asyncHandler(async (req, res) => {
    const campaignScheduler = global.campaignScheduler;
    
    if (!campaignScheduler) {
      return res.status(503).json({
        success: false,
        error: 'Campaign Scheduler não está inicializado'
      });
    }

    const stats = await campaignScheduler.getSchedulerStats();
    
    res.json({
      success: true,
      data: stats
    });
  })
);

// POST /scheduler/campaign/:id/reschedule - Reagendar campanha
router.post('/:id/reschedule',
  asyncHandler(async (req, res) => {
    const campaignScheduler = global.campaignScheduler;
    const { scheduled_at } = req.body;
    const campaignId = parseInt(req.params.id);
    
    if (!campaignScheduler) {
      return res.status(503).json({
        success: false,
        error: 'Campaign Scheduler não está inicializado'
      });
    }

    if (!scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'Data de agendamento é obrigatória'
      });
    }

    const result = await campaignScheduler.rescheduleCampaign(campaignId, scheduled_at);
    
    res.json({
      success: true,
      data: result,
      message: 'Campanha reagendada com sucesso'
    });
  })
);

// POST /scheduler/campaign/:id/cancel - Cancelar agendamento
router.post('/:id/cancel',
  asyncHandler(async (req, res) => {
    const campaignScheduler = global.campaignScheduler;
    const { reason } = req.body;
    const campaignId = parseInt(req.params.id);
    
    if (!campaignScheduler) {
      return res.status(503).json({
        success: false,
        error: 'Campaign Scheduler não está inicializado'
      });
    }

    const result = await campaignScheduler.cancelScheduledCampaign(
      campaignId, 
      reason || 'Cancelado pelo usuário'
    );
    
    res.json({
      success: true,
      data: result,
      message: 'Agendamento cancelado com sucesso'
    });
  })
);

// POST /scheduler/process - Forçar processamento manual
router.post('/process',
  asyncHandler(async (req, res) => {
    const campaignScheduler = global.campaignScheduler;
    
    if (!campaignScheduler) {
      return res.status(503).json({
        success: false,
        error: 'Campaign Scheduler não está inicializado'
      });
    }

    // Processar campanhas agendadas manualmente
    await campaignScheduler.processScheduledCampaigns();
    
    res.json({
      success: true,
      message: 'Processamento manual executado com sucesso'
    });
  })
);

module.exports = router;