import { AuthenticatedRequest } from '../middleware/auth';

export const getActorUserId = (req: AuthenticatedRequest): number => req.user!.id;

export const getAccountUserId = (req: AuthenticatedRequest): number =>
  req.user?.account_id
  ?? req.apiKey?.user_id
  ?? req.user!.id;

export const getOrganizationId = (req: AuthenticatedRequest): number | null =>
  req.user?.organization_id ?? null;

export const getOrganizationRole = (req: AuthenticatedRequest): string | null =>
  req.user?.organization_role ?? null;
