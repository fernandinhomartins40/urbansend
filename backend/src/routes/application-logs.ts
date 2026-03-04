import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest, authenticateJWT, optionalAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { applicationErrorLogService } from '../services/ApplicationErrorLogService';
import { Logger, logger } from '../config/logger';

const router = Router();

const frontendErrorSchema = z.object({
  type: z.enum(['react_error', 'window_error', 'unhandled_rejection', 'api_error']),
  message: z.string().min(1).max(5000),
  name: z.string().max(255).optional(),
  stack: z.string().max(50000).optional(),
  componentStack: z.string().max(50000).optional(),
  url: z.string().max(2000).optional(),
  route: z.string().max(500).optional(),
  userAgent: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
  correlationId: z.string().max(100).optional(),
  sessionId: z.string().max(150).optional(),
  statusCode: z.number().int().optional(),
  component: z.string().max(255).optional(),
  metadata: z.record(z.any()).optional()
});

const applicationLogFiltersSchema = z.object({
  limit: z.string().optional().transform((value) => value ? parseInt(value, 10) : undefined),
  offset: z.string().optional().transform((value) => value ? parseInt(value, 10) : undefined),
  source: z.enum(['backend', 'frontend']).optional(),
  level: z.string().max(16).optional(),
  requestId: z.string().max(100).optional(),
  correlationId: z.string().max(100).optional(),
  search: z.string().max(200).optional()
});

const canViewAllLogs = (req: AuthenticatedRequest): boolean => {
  return Boolean(req.user?.permissions?.includes('admin'));
};

router.post(
  '/frontend-error',
  optionalAuth,
  validateRequest({ body: frontendErrorSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await applicationErrorLogService.captureFrontendError(req.body, req);

    Logger.business('application_logs', 'frontend_error_ingested', {
      userId: req.user?.id?.toString(),
      requestId: req.requestId,
      metadata: {
        type: req.body.type,
        route: req.body.route,
        statusCode: req.body.statusCode
      }
    });

    res.status(202).json({
      success: true,
      message: 'Frontend error accepted for processing'
    });
  })
);

router.get(
  '/errors',
  authenticateJWT,
  validateRequest({ query: applicationLogFiltersSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const filters = req.query as z.infer<typeof applicationLogFiltersSchema>;
    const logs = await applicationErrorLogService.listLogs({
      ...filters,
      userId: canViewAllLogs(req) ? undefined : req.user.id
    });

    logger.info('Application logs requested', {
      requestId: req.requestId,
      userId: req.user.id,
      filters,
      count: logs.length
    });

    res.json({
      success: true,
      data: {
        logs,
        count: logs.length
      }
    });
  })
);

export default router;
