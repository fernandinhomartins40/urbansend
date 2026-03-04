import crypto from 'crypto';
import db from '../config/database';
import { logger } from '../config/logger';

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface WorkspaceMembershipSummary {
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
  isPersonal: boolean;
  ownerUserId: number;
}

export interface WorkspaceContext {
  organizationId: number | null;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
  accountUserId: number;
  memberships: WorkspaceMembershipSummary[];
  isPersonal: boolean;
}

export interface WorkspaceMember {
  membershipId: number;
  userId: number;
  email: string;
  name: string;
  role: OrganizationRole;
  joinedAt: Date | string;
}

export interface WorkspaceInvitation {
  id: number;
  email: string;
  role: OrganizationRole;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  token: string;
  organizationId: number;
  organizationName: string;
  invitedBy: number | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
}

type MembershipRow = {
  membership_id: number;
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  is_personal: boolean;
  owner_user_id: number;
  role: OrganizationRole;
};

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

class WorkspaceService {
  private tableAvailability: boolean | null = null;

  private async hasWorkspaceTables(): Promise<boolean> {
    if (this.tableAvailability !== null) {
      return this.tableAvailability;
    }

    try {
      const [hasOrganizations, hasMemberships, hasInvitations] = await Promise.all([
        db.schema.hasTable('organizations'),
        db.schema.hasTable('organization_memberships'),
        db.schema.hasTable('organization_invitations')
      ]);

      this.tableAvailability = hasOrganizations && hasMemberships && hasInvitations;
      return this.tableAvailability;
    } catch (error) {
      logger.warn('Workspace tables check failed, falling back to legacy account mode', {
        error: error instanceof Error ? error.message : String(error)
      });
      this.tableAvailability = false;
      return false;
    }
  }

  private async hasUsersActiveOrganizationColumn(): Promise<boolean> {
    try {
      return await db.schema.hasColumn('users', 'active_organization_id');
    } catch {
      return false;
    }
  }

  private async buildFallbackContext(userId: number): Promise<WorkspaceContext> {
    const user = await db('users').select('id', 'name').where('id', userId).first();

    return {
      organizationId: null,
      organizationName: user?.name ? `${user.name} Workspace` : 'Personal Workspace',
      organizationSlug: `user-${userId}`,
      role: 'owner',
      accountUserId: userId,
      memberships: [],
      isPersonal: true
    };
  }

  private async generateUniqueSlug(baseName: string, trx: any = db): Promise<string> {
    const baseSlug = slugify(baseName) || `workspace-${Date.now()}`;
    let slug = baseSlug;
    let attempt = 1;

    while (await trx('organizations').where('slug', slug).first()) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    return slug;
  }

  async ensurePersonalWorkspace(userId: number): Promise<void> {
    if (!(await this.hasWorkspaceTables())) {
      return;
    }

    const existingMembership = await db('organization_memberships')
      .where('user_id', userId)
      .where('status', 'active')
      .first();

    if (existingMembership) {
      return;
    }

    await db.transaction(async (trx) => {
      const user = await trx('users')
        .select('id', 'name', 'organization')
        .where('id', userId)
        .first();

      if (!user) {
        throw new Error(`User ${userId} not found while creating personal workspace`);
      }

      const organizationName = user.organization || `${user.name} Workspace`;
      const organizationSlug = await this.generateUniqueSlug(organizationName, trx);

      const insertResult = await trx('organizations').insert({
        owner_user_id: userId,
        name: organizationName,
        slug: organizationSlug,
        is_personal: true,
        created_at: new Date(),
        updated_at: new Date()
      });

      const organizationId = Array.isArray(insertResult)
        ? Number((insertResult[0] as any)?.id ?? insertResult[0])
        : Number(insertResult);

      const resolvedOrganizationId = organizationId
        || Number((await trx('organizations').select('id').where('slug', organizationSlug).first())?.id);

      await trx('organization_memberships').insert({
        organization_id: resolvedOrganizationId,
        user_id: userId,
        role: 'owner',
        status: 'active',
        invited_by: userId,
        created_at: new Date(),
        updated_at: new Date()
      });

      if (await this.hasUsersActiveOrganizationColumn()) {
        await trx('users')
          .where('id', userId)
          .update({
            active_organization_id: resolvedOrganizationId,
            updated_at: new Date()
          });
      }
    });
  }

  private async getMembershipRows(userId: number): Promise<MembershipRow[]> {
    return db('organization_memberships as memberships')
      .join('organizations', 'memberships.organization_id', 'organizations.id')
      .select(
        'memberships.id as membership_id',
        'memberships.role',
        'organizations.id as organization_id',
        'organizations.name as organization_name',
        'organizations.slug as organization_slug',
        'organizations.is_personal',
        'organizations.owner_user_id'
      )
      .where('memberships.user_id', userId)
      .where('memberships.status', 'active')
      .orderBy('organizations.created_at', 'asc') as Promise<MembershipRow[]>;
  }

  async getContext(userId: number, requestedOrganizationId?: number | null): Promise<WorkspaceContext> {
    if (!(await this.hasWorkspaceTables())) {
      return this.buildFallbackContext(userId);
    }

    await this.ensurePersonalWorkspace(userId);

    const memberships = await this.getMembershipRows(userId);

    if (memberships.length === 0) {
      return this.buildFallbackContext(userId);
    }

    const user = await db('users')
      .select('active_organization_id')
      .where('id', userId)
      .first();

    const preferredOrganizationId = requestedOrganizationId
      || Number(user?.active_organization_id || 0)
      || memberships[0].organization_id;

    const activeMembership = memberships.find((membership) => membership.organization_id === preferredOrganizationId)
      || memberships[0];

    if (activeMembership.organization_id !== Number(user?.active_organization_id || 0) && await this.hasUsersActiveOrganizationColumn()) {
      await db('users')
        .where('id', userId)
        .update({
          active_organization_id: activeMembership.organization_id,
          updated_at: new Date()
        });
    }

    return {
      organizationId: activeMembership.organization_id,
      organizationName: activeMembership.organization_name,
      organizationSlug: activeMembership.organization_slug,
      role: activeMembership.role,
      accountUserId: activeMembership.owner_user_id,
      memberships: memberships.map((membership) => ({
        organizationId: membership.organization_id,
        organizationName: membership.organization_name,
        organizationSlug: membership.organization_slug,
        role: membership.role,
        isPersonal: Boolean(membership.is_personal),
        ownerUserId: membership.owner_user_id
      })),
      isPersonal: Boolean(activeMembership.is_personal)
    };
  }

  async switchOrganization(userId: number, organizationId: number): Promise<WorkspaceContext> {
    const context = await this.getContext(userId, organizationId);

    if (context.organizationId !== organizationId) {
      throw new Error('Organization not found for current user');
    }

    return context;
  }

  async updateOrganizationName(userId: number, organizationId: number, name: string): Promise<void> {
    if (!(await this.hasWorkspaceTables())) {
      throw new Error('Workspace support is not available');
    }

    const context = await this.getContext(userId, organizationId);
    if (!['owner', 'admin'].includes(context.role)) {
      throw new Error('Insufficient workspace permissions');
    }

    await db('organizations')
      .where('id', organizationId)
      .update({
        name: name.trim(),
        updated_at: new Date()
      });
  }

  async listMembers(userId: number, organizationId?: number | null): Promise<WorkspaceMember[]> {
    if (!(await this.hasWorkspaceTables())) {
      const user = await db('users').select('id', 'email', 'name').where('id', userId).first();
      return user ? [{
        membershipId: user.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: 'owner',
        joinedAt: new Date()
      }] : [];
    }

    const context = await this.getContext(userId, organizationId);

    return db('organization_memberships as memberships')
      .join('users', 'memberships.user_id', 'users.id')
      .select(
        'memberships.id as membershipId',
        'users.id as userId',
        'users.email',
        'users.name',
        'memberships.role',
        'memberships.created_at as joinedAt'
      )
      .where('memberships.organization_id', context.organizationId!)
      .where('memberships.status', 'active')
      .orderBy([
        { column: 'memberships.role', order: 'asc' },
        { column: 'users.name', order: 'asc' }
      ]) as Promise<WorkspaceMember[]>;
  }

  async listPendingInvitations(userId: number, organizationId?: number | null): Promise<WorkspaceInvitation[]> {
    if (!(await this.hasWorkspaceTables())) {
      return [];
    }

    const context = await this.getContext(userId, organizationId);
    if (!['owner', 'admin'].includes(context.role)) {
      return [];
    }

    const now = new Date();
    const rows = await db('organization_invitations as invitations')
      .join('organizations', 'invitations.organization_id', 'organizations.id')
      .select(
        'invitations.id',
        'invitations.email',
        'invitations.role',
        'invitations.status',
        'invitations.token',
        'invitations.organization_id as organizationId',
        'organizations.name as organizationName',
        'invitations.invited_by as invitedBy',
        'invitations.expires_at as expiresAt',
        'invitations.created_at as createdAt'
      )
      .where('invitations.organization_id', context.organizationId!)
      .whereNull('invitations.accepted_at')
      .orderBy('invitations.created_at', 'desc');

    return rows.map((row: any) => ({
      ...row,
      status: row.expiresAt && new Date(row.expiresAt) < now ? 'expired' : row.status
    }));
  }

  async listReceivedInvitations(userId: number): Promise<WorkspaceInvitation[]> {
    if (!(await this.hasWorkspaceTables())) {
      return [];
    }

    const user = await db('users').select('email').where('id', userId).first();
    if (!user?.email) {
      return [];
    }

    const now = new Date();
    const rows = await db('organization_invitations as invitations')
      .join('organizations', 'invitations.organization_id', 'organizations.id')
      .select(
        'invitations.id',
        'invitations.email',
        'invitations.role',
        'invitations.status',
        'invitations.token',
        'invitations.organization_id as organizationId',
        'organizations.name as organizationName',
        'invitations.invited_by as invitedBy',
        'invitations.expires_at as expiresAt',
        'invitations.created_at as createdAt'
      )
      .whereRaw('LOWER(invitations.email) = ?', [normalizeEmail(user.email)])
      .whereNull('invitations.accepted_at')
      .orderBy('invitations.created_at', 'desc');

    return rows.map((row: any) => ({
      ...row,
      status: row.expiresAt && new Date(row.expiresAt) < now ? 'expired' : row.status
    }));
  }

  async createInvitation(
    userId: number,
    email: string,
    role: OrganizationRole,
    organizationId?: number | null
  ): Promise<WorkspaceInvitation> {
    if (!(await this.hasWorkspaceTables())) {
      throw new Error('Workspace support is not available');
    }

    const context = await this.getContext(userId, organizationId);
    if (!['owner', 'admin'].includes(context.role)) {
      throw new Error('Insufficient workspace permissions');
    }

    const normalizedEmail = normalizeEmail(email);
    const existingMember = await db('organization_memberships as memberships')
      .join('users', 'memberships.user_id', 'users.id')
      .where('memberships.organization_id', context.organizationId!)
      .where('memberships.status', 'active')
      .whereRaw('LOWER(users.email) = ?', [normalizedEmail])
      .first();

    if (existingMember) {
      throw new Error('User is already a member of this workspace');
    }

    const existingPendingInvitation = await db('organization_invitations')
      .where('organization_id', context.organizationId!)
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .whereNull('accepted_at')
      .where('status', 'pending')
      .first();

    if (existingPendingInvitation) {
      throw new Error('There is already a pending invitation for this email');
    }

    const token = crypto.randomBytes(24).toString('hex');
    await db('organization_invitations').insert({
      organization_id: context.organizationId!,
      email: normalizedEmail,
      role,
      token,
      invited_by: userId,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
      updated_at: new Date()
    });

    const invitation = await db('organization_invitations as invitations')
      .join('organizations', 'invitations.organization_id', 'organizations.id')
      .select(
        'invitations.id',
        'invitations.email',
        'invitations.role',
        'invitations.status',
        'invitations.token',
        'invitations.organization_id as organizationId',
        'organizations.name as organizationName',
        'invitations.invited_by as invitedBy',
        'invitations.expires_at as expiresAt',
        'invitations.created_at as createdAt'
      )
      .where('invitations.token', token)
      .first();

    return invitation as WorkspaceInvitation;
  }

  async acceptInvitation(userId: number, token: string): Promise<WorkspaceContext> {
    if (!(await this.hasWorkspaceTables())) {
      throw new Error('Workspace support is not available');
    }

    const user = await db('users').select('email').where('id', userId).first();
    const invitation = await db('organization_invitations')
      .where('token', token)
      .first();

    if (!user?.email || !invitation) {
      throw new Error('Invitation not found');
    }

    if (normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
      throw new Error('Invitation email does not match the current account');
    }

    if (invitation.accepted_at || invitation.status !== 'pending') {
      throw new Error('Invitation is no longer available');
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      await db('organization_invitations')
        .where('id', invitation.id)
        .update({ status: 'expired', updated_at: new Date() });
      throw new Error('Invitation has expired');
    }

    await db.transaction(async (trx) => {
      const existingMembership = await trx('organization_memberships')
        .where('organization_id', invitation.organization_id)
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!existingMembership) {
        await trx('organization_memberships').insert({
          organization_id: invitation.organization_id,
          user_id: userId,
          role: invitation.role,
          status: 'active',
          invited_by: invitation.invited_by,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      await trx('organization_invitations')
        .where('id', invitation.id)
        .update({
          status: 'accepted',
          accepted_at: new Date(),
          updated_at: new Date()
        });

      if (await this.hasUsersActiveOrganizationColumn()) {
        await trx('users')
          .where('id', userId)
          .update({
            active_organization_id: invitation.organization_id,
            updated_at: new Date()
          });
      }
    });

    return this.getContext(userId, invitation.organization_id);
  }

  async declineInvitation(userId: number, token: string): Promise<void> {
    if (!(await this.hasWorkspaceTables())) {
      return;
    }

    const user = await db('users').select('email').where('id', userId).first();
    const invitation = await db('organization_invitations')
      .where('token', token)
      .first();

    if (!user?.email || !invitation) {
      throw new Error('Invitation not found');
    }

    if (normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
      throw new Error('Invitation email does not match the current account');
    }

    await db('organization_invitations')
      .where('id', invitation.id)
      .update({
        status: 'declined',
        updated_at: new Date()
      });
  }

  async removeMember(
    actorUserId: number,
    membershipId: number,
    organizationId?: number | null
  ): Promise<void> {
    if (!(await this.hasWorkspaceTables())) {
      throw new Error('Workspace support is not available');
    }

    const context = await this.getContext(actorUserId, organizationId);
    if (!['owner', 'admin'].includes(context.role)) {
      throw new Error('Insufficient workspace permissions');
    }

    const membership = await db('organization_memberships')
      .where('id', membershipId)
      .where('organization_id', context.organizationId!)
      .first();

    if (!membership) {
      throw new Error('Workspace member not found');
    }

    if (membership.role === 'owner') {
      throw new Error('The workspace owner cannot be removed');
    }

    await db('organization_memberships')
      .where('id', membershipId)
      .update({
        status: 'removed',
        updated_at: new Date()
      });
  }
}

export const workspaceService = new WorkspaceService();
