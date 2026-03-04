import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, authenticateJWT, requirePermission } from '../middleware/auth';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { workspaceService } from '../services/WorkspaceService';

const router = Router();

router.use(authenticateJWT);

router.get('/context', requirePermission('workspace:read'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const workspace = await workspaceService.getContext(req.user!.id, req.user?.organization_id);
  const [members, pendingInvitations, receivedInvitations] = await Promise.all([
    workspaceService.listMembers(req.user!.id, workspace.organizationId),
    workspaceService.listPendingInvitations(req.user!.id, workspace.organizationId),
    workspaceService.listReceivedInvitations(req.user!.id)
  ]);

  res.json({
    workspace,
    members,
    pending_invitations: pendingInvitations,
    received_invitations: receivedInvitations
  });
}));

router.post('/switch',
  requirePermission('workspace:read'),
  validateRequest({
    body: z.object({
      organization_id: z.number().int().positive()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const workspace = await workspaceService.switchOrganization(req.user!.id, req.body.organization_id);
    res.json({ workspace });
  })
);

router.put('/current',
  requirePermission('workspace:write'),
  validateRequest({
    body: z.object({
      name: z.string().min(2).max(120)
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const workspace = await workspaceService.getContext(req.user!.id, req.user?.organization_id);
    if (!workspace.organizationId) {
      throw createError('Workspace support is not available', 400);
    }

    try {
      await workspaceService.updateOrganizationName(req.user!.id, workspace.organizationId, req.body.name);
      const updatedWorkspace = await workspaceService.getContext(req.user!.id, workspace.organizationId);
      res.json({ workspace: updatedWorkspace });
    } catch (error) {
      throw createError(error instanceof Error ? error.message : 'Failed to update workspace', 403);
    }
  })
);

router.post('/invitations',
  requirePermission('workspace:write'),
  validateRequest({
    body: z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'member'])
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const invitation = await workspaceService.createInvitation(
        req.user!.id,
        req.body.email,
        req.body.role,
        req.user?.organization_id
      );

      res.status(201).json({ invitation });
    } catch (error) {
      throw createError(error instanceof Error ? error.message : 'Failed to create invitation', 400);
    }
  })
);

router.post('/invitations/:token/accept',
  requirePermission('workspace:read'),
  validateRequest({
    params: z.object({
      token: z.string().min(8)
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspace = await workspaceService.acceptInvitation(req.user!.id, req.params.token);
      res.json({ workspace });
    } catch (error) {
      throw createError(error instanceof Error ? error.message : 'Failed to accept invitation', 400);
    }
  })
);

router.post('/invitations/:token/decline',
  requirePermission('workspace:read'),
  validateRequest({
    params: z.object({
      token: z.string().min(8)
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await workspaceService.declineInvitation(req.user!.id, req.params.token);
      res.json({ success: true });
    } catch (error) {
      throw createError(error instanceof Error ? error.message : 'Failed to decline invitation', 400);
    }
  })
);

router.delete('/members/:membershipId',
  requirePermission('workspace:write'),
  validateRequest({
    params: z.object({
      membershipId: z.coerce.number().int().positive()
    })
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await workspaceService.removeMember(req.user!.id, Number(req.params.membershipId), req.user?.organization_id);
      res.json({ success: true });
    } catch (error) {
      throw createError(error instanceof Error ? error.message : 'Failed to remove member', 400);
    }
  })
);

export default router;
