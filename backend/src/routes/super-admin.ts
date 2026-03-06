import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, authenticateJWT, requireSuperAdmin } from '../middleware/auth';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { superAdminService } from '../services/SuperAdminService';

const router = Router();

router.use(authenticateJWT);
router.use(requireSuperAdmin());

const paginationSchema = z.object({
  page: z.string().optional().transform((value) => value ? Number(value) : undefined),
  limit: z.string().optional().transform((value) => value ? Number(value) : undefined)
});

const accountIdParamSchema = z.object({
  accountId: z.coerce.number().int().positive()
});

const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

router.get('/profile', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await superAdminService.getAdminProfile(req.user!.id);
  res.json({ success: true, data });
}));

router.put('/profile',
  validateRequest({
    body: z.object({
      name: z.string().trim().min(2).max(100).optional(),
      email: z.string().trim().email().max(255).optional()
    }).refine((data) => data.name !== undefined || data.email !== undefined, {
      message: 'Informe ao menos nome ou email para atualizar.',
      path: ['name']
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.updateAdminProfile(
      req.user!.id,
      req.body,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || undefined
      }
    );

    res.json({ success: true, data });
  })
);

router.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await superAdminService.getOverview(req.user!.id);
  res.json({ success: true, data });
}));

router.get('/accounts',
  validateRequest({
    query: paginationSchema.extend({
      search: z.string().optional(),
      status: z.enum(['active', 'inactive', 'suspended']).optional(),
      plan: z.string().optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.listAccounts(req.user!.id, req.query as any);
    res.json({ success: true, data });
  })
);

router.get('/accounts/:accountId',
  validateRequest({ params: accountIdParamSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.getAccountDetails(req.user!.id, Number(req.params.accountId));
    res.json({ success: true, data });
  })
);

router.patch('/accounts/:accountId/plan',
  validateRequest({
    params: accountIdParamSchema,
    body: z.object({
      plan_name: z.string().min(2).max(80),
      status: z.string().max(40).optional(),
      monthly_email_limit: z.number().int().positive().optional(),
      api_rate_limit_per_minute: z.number().int().positive().optional(),
      expires_at: z.string().datetime().nullable().optional(),
      reason: z.string().max(500).optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.updateAccountPlan(
      req.user!.id,
      Number(req.params.accountId),
      req.body,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || undefined
      }
    );
    res.json({ success: true, data });
  })
);

router.patch('/accounts/:accountId/security',
  validateRequest({
    params: accountIdParamSchema,
    body: z.object({
      is_suspended: z.boolean().optional(),
      is_under_review: z.boolean().optional(),
      email_sending_blocked: z.boolean().optional(),
      suspension_reason: z.string().max(1000).nullable().optional(),
      suspension_ends_at: z.string().datetime().nullable().optional(),
      reason: z.string().max(500).optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.updateAccountSecurity(
      req.user!.id,
      Number(req.params.accountId),
      req.body,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || undefined
      }
    );
    res.json({ success: true, data });
  })
);

router.get('/users',
  validateRequest({
    query: paginationSchema.extend({
      search: z.string().optional(),
      isActive: z.union([z.literal('true'), z.literal('false')]).optional(),
      isAdmin: z.union([z.literal('true'), z.literal('false')]).optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const filters = {
      ...req.query,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      isAdmin: req.query.isAdmin === 'true' ? true : req.query.isAdmin === 'false' ? false : undefined
    };
    const data = await superAdminService.listUsers(req.user!.id, filters as any);
    res.json({ success: true, data });
  })
);

router.patch('/users/:userId/status',
  validateRequest({
    params: userIdParamSchema,
    body: z.object({
      is_active: z.boolean().optional(),
      is_admin: z.boolean().optional(),
      reason: z.string().max(500).optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.updateUserStatus(
      req.user!.id,
      Number(req.params.userId),
      req.body,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || undefined
      }
    );
    res.json({ success: true, data });
  })
);

router.get('/deliverability',
  validateRequest({
    query: z.object({
      days: z.string().optional().transform((value) => value ? Number(value) : undefined)
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const days = Math.max(1, Number(req.query.days) || 30);
    const data = await superAdminService.getDeliverabilityOverview(req.user!.id, days);
    res.json({ success: true, data });
  })
);

router.get('/integrations', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await superAdminService.getIntegrationsOverview(req.user!.id);
  res.json({ success: true, data });
}));

router.post('/impersonation/start',
  validateRequest({
    body: z.object({
      account_user_id: z.number().int().positive(),
      reason: z.string().min(10).max(1000),
      ttl_minutes: z.number().int().min(5).max(120).optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.startImpersonation(
      req.user!.id,
      req.body.account_user_id,
      req.body.reason,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || undefined
      },
      req.body.ttl_minutes
    );
    res.status(201).json({ success: true, data });
  })
);

router.post('/impersonation/stop',
  validateRequest({
    body: z.object({
      session_token: z.string().min(20),
      reason: z.string().max(500).optional()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.stopImpersonation(
      req.user!.id,
      req.body.session_token,
      req.body.reason,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || undefined
      }
    );
    res.json({ success: true, data });
  })
);

router.get('/audit',
  validateRequest({ query: paginationSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = await superAdminService.listAuditLogs(req.user!.id, req.query as any);
    res.json({ success: true, data });
  })
);

router.use((_req, _res) => {
  throw createError('Super admin route not found', 404);
});

export default router;
