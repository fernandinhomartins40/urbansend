import crypto from 'crypto';
import db from '../config/database';
import { sqlExtractDomain } from '../utils/sqlDialect';

interface PaginationOptions {
  page?: number;
  limit?: number;
}

interface AccountFilters extends PaginationOptions {
  search?: string;
  status?: 'active' | 'inactive' | 'suspended';
  plan?: string;
}

interface UserFilters extends PaginationOptions {
  search?: string;
  isActive?: boolean;
  isAdmin?: boolean;
}

class SuperAdminService {
  private tableAvailabilityCache = new Map<string, boolean>();

  private async hasTable(tableName: string): Promise<boolean> {
    if (this.tableAvailabilityCache.has(tableName)) {
      return Boolean(this.tableAvailabilityCache.get(tableName));
    }

    const exists = await db.schema.hasTable(tableName);
    this.tableAvailabilityCache.set(tableName, exists);
    return exists;
  }

  private async ensureTables(tableNames: string[]): Promise<void> {
    const missing: string[] = [];

    for (const tableName of tableNames) {
      if (!(await this.hasTable(tableName))) {
        missing.push(tableName);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Super admin foundation migration pending: missing tables ${missing.join(', ')}`);
    }
  }

  private async assertPlatformAdmin(userId: number): Promise<void> {
    const user = await db('users')
      .select('id', 'is_admin', 'is_active')
      .where('id', userId)
      .first();

    if (!user || user.is_active === false || !user.is_admin) {
      throw new Error('Admin account is not authorized for platform operations');
    }

    const hasProfile = await this.hasTable('platform_admin_profiles');
    if (!hasProfile) {
      return;
    }

    const profile = await db('platform_admin_profiles')
      .select('is_active')
      .where('user_id', userId)
      .first();

    if (profile && profile.is_active === false) {
      throw new Error('Platform admin profile is disabled');
    }
  }

  private async audit(
    adminUserId: number,
    action: string,
    targetType: string,
    targetId: string | number | null,
    options?: {
      reason?: string;
      before?: unknown;
      after?: unknown;
      requestId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    const hasAuditTable = await this.hasTable('platform_admin_audit_logs');
    if (!hasAuditTable) {
      return;
    }

    await db('platform_admin_audit_logs').insert({
      admin_user_id: adminUserId,
      action,
      target_type: targetType,
      target_id: targetId ? String(targetId) : null,
      reason: options?.reason || null,
      before_payload: options?.before ? JSON.stringify(options.before) : null,
      after_payload: options?.after ? JSON.stringify(options.after) : null,
      request_id: options?.requestId || null,
      ip_address: options?.ipAddress || null,
      user_agent: options?.userAgent || null,
      created_at: new Date()
    });
  }

  async getOverview(adminUserId: number) {
    await this.assertPlatformAdmin(adminUserId);

    const [
      accounts,
      activeAccounts,
      users,
      activeUsers,
      domains,
      verifiedDomains,
      emailsLast24h,
      failedEmailsLast24h,
      activeAlerts
    ] = await Promise.all([
      db('users').where('is_admin', false).count('* as total').first(),
      db('users').where('is_admin', false).where('is_active', true).count('* as total').first(),
      db('users').count('* as total').first(),
      db('users').where('is_active', true).count('* as total').first(),
      db('domains').count('* as total').first(),
      db('domains').where('is_verified', true).count('* as total').first(),
      db('emails').where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000)).count('* as total').first(),
      db('emails')
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .whereIn('status', ['failed', 'bounced'])
        .count('* as total')
        .first(),
      db.schema.hasTable('system_alerts')
        .then((hasTable) => hasTable
          ? db('system_alerts').where('status', 'active').count('* as total').first()
          : Promise.resolve({ total: 0 }))
    ]);

    const totalEmails24h = Number((emailsLast24h as any)?.total || 0);
    const totalFailed24h = Number((failedEmailsLast24h as any)?.total || 0);

    return {
      accounts: {
        total: Number((accounts as any)?.total || 0),
        active: Number((activeAccounts as any)?.total || 0)
      },
      users: {
        total: Number((users as any)?.total || 0),
        active: Number((activeUsers as any)?.total || 0)
      },
      deliverability: {
        total_domains: Number((domains as any)?.total || 0),
        verified_domains: Number((verifiedDomains as any)?.total || 0),
        emails_last_24h: totalEmails24h,
        failed_last_24h: totalFailed24h,
        success_rate_24h: totalEmails24h > 0
          ? Math.round(((totalEmails24h - totalFailed24h) / totalEmails24h) * 10000) / 100
          : 100
      },
      alerts: {
        active: Number((activeAlerts as any)?.total || 0)
      },
      generated_at: new Date().toISOString()
    };
  }

  async listAccounts(adminUserId: number, filters: AccountFilters = {}) {
    await this.assertPlatformAdmin(adminUserId);
    await this.ensureTables(['account_subscriptions', 'account_security_flags']);

    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    let query = db('users as u')
      .leftJoin('account_subscriptions as s', 's.account_user_id', 'u.id')
      .leftJoin('account_security_flags as f', 'f.account_user_id', 'u.id')
      .where('u.is_admin', false)
      .select(
        'u.id',
        'u.name',
        'u.email',
        'u.is_active',
        'u.created_at',
        's.plan_name',
        's.status as plan_status',
        's.monthly_email_limit',
        'f.is_suspended',
        'f.email_sending_blocked',
        'f.is_under_review'
      );

    if (filters.search) {
      query = query.where((builder) => {
        builder
          .where('u.email', 'like', `%${filters.search}%`)
          .orWhere('u.name', 'like', `%${filters.search}%`);
      });
    }

    if (filters.plan) {
      query = query.where('s.plan_name', filters.plan);
    }

    if (filters.status === 'active') {
      query = query.where('u.is_active', true).where((builder) => {
        builder.whereNull('f.is_suspended').orWhere('f.is_suspended', false);
      });
    }

    if (filters.status === 'inactive') {
      query = query.where('u.is_active', false);
    }

    if (filters.status === 'suspended') {
      query = query.where('f.is_suspended', true);
    }

    const [rows, total] = await Promise.all([
      query.clone().orderBy('u.created_at', 'desc').limit(limit).offset(offset),
      query.clone().clearSelect().clearOrder().countDistinct('u.id as total').first()
    ]);

    return {
      accounts: rows,
      pagination: {
        page,
        limit,
        total: Number((total as any)?.total || 0),
        total_pages: Math.ceil(Number((total as any)?.total || 0) / limit)
      }
    };
  }

  async getAccountDetails(adminUserId: number, accountUserId: number) {
    await this.assertPlatformAdmin(adminUserId);
    await this.ensureTables(['account_subscriptions', 'account_security_flags']);

    const account = await db('users as u')
      .leftJoin('account_subscriptions as s', 's.account_user_id', 'u.id')
      .leftJoin('account_security_flags as f', 'f.account_user_id', 'u.id')
      .where('u.id', accountUserId)
      .select(
        'u.id',
        'u.name',
        'u.email',
        'u.is_active',
        'u.is_verified',
        'u.created_at',
        'u.updated_at',
        's.plan_name',
        's.status as plan_status',
        's.monthly_email_limit',
        's.api_rate_limit_per_minute',
        's.expires_at as plan_expires_at',
        'f.is_suspended',
        'f.is_under_review',
        'f.email_sending_blocked',
        'f.suspension_reason'
      )
      .first();

    if (!account) {
      throw new Error('Account not found');
    }

    const [domains, apiKeys, webhooks, emails30d, failed30d, workspaceMembers] = await Promise.all([
      db('domains').where('user_id', accountUserId).count('* as total').first(),
      db('api_keys').where('user_id', accountUserId).count('* as total').first(),
      db('webhooks').where('user_id', accountUserId).count('* as total').first(),
      db('emails')
        .where('user_id', accountUserId)
        .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .count('* as total')
        .first(),
      db('emails')
        .where('user_id', accountUserId)
        .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .whereIn('status', ['failed', 'bounced'])
        .count('* as total')
        .first(),
      this.hasTable('organizations')
        .then((hasOrganizations) => {
          if (!hasOrganizations) return Promise.resolve({ total: 0 });
          return db('organizations as o')
            .leftJoin('organization_memberships as m', 'm.organization_id', 'o.id')
            .where('o.owner_user_id', accountUserId)
            .where('m.status', 'active')
            .countDistinct('m.user_id as total')
            .first();
        })
    ]);

    return {
      account,
      stats: {
        domains: Number((domains as any)?.total || 0),
        api_keys: Number((apiKeys as any)?.total || 0),
        webhooks: Number((webhooks as any)?.total || 0),
        emails_last_30d: Number((emails30d as any)?.total || 0),
        failed_last_30d: Number((failed30d as any)?.total || 0),
        workspace_members: Number((workspaceMembers as any)?.total || 0)
      }
    };
  }

  async updateAccountPlan(
    adminUserId: number,
    accountUserId: number,
    payload: {
      plan_name: string;
      status?: string;
      monthly_email_limit?: number;
      api_rate_limit_per_minute?: number;
      expires_at?: string | null;
      reason?: string;
    },
    requestContext?: { requestId?: string; ipAddress?: string; userAgent?: string; }
  ) {
    await this.assertPlatformAdmin(adminUserId);
    await this.ensureTables(['account_subscriptions']);

    const before = await db('account_subscriptions').where('account_user_id', accountUserId).first();
    const nextData = {
      plan_name: payload.plan_name,
      status: payload.status || before?.status || 'active',
      monthly_email_limit: Number(payload.monthly_email_limit || before?.monthly_email_limit || 1000),
      api_rate_limit_per_minute: Number(payload.api_rate_limit_per_minute || before?.api_rate_limit_per_minute || 120),
      expires_at: payload.expires_at ? new Date(payload.expires_at) : (before?.expires_at || null),
      updated_at: new Date()
    };

    if (!before) {
      await db('account_subscriptions').insert({
        account_user_id: accountUserId,
        ...nextData,
        started_at: new Date(),
        created_at: new Date()
      });
    } else {
      await db('account_subscriptions')
        .where('account_user_id', accountUserId)
        .update(nextData);
    }

    const after = await db('account_subscriptions').where('account_user_id', accountUserId).first();
    await this.audit(adminUserId, 'account.plan.update', 'account', accountUserId, {
      reason: payload.reason,
      before,
      after,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent
    });

    return after;
  }

  async updateAccountSecurity(
    adminUserId: number,
    accountUserId: number,
    payload: {
      is_suspended?: boolean;
      is_under_review?: boolean;
      email_sending_blocked?: boolean;
      suspension_reason?: string | null;
      suspension_ends_at?: string | null;
      reason?: string;
    },
    requestContext?: { requestId?: string; ipAddress?: string; userAgent?: string; }
  ) {
    await this.assertPlatformAdmin(adminUserId);
    await this.ensureTables(['account_security_flags']);

    const before = await db('account_security_flags').where('account_user_id', accountUserId).first();
    const nextData = {
      is_suspended: payload.is_suspended ?? before?.is_suspended ?? false,
      is_under_review: payload.is_under_review ?? before?.is_under_review ?? false,
      email_sending_blocked: payload.email_sending_blocked ?? before?.email_sending_blocked ?? false,
      suspension_reason: payload.suspension_reason ?? before?.suspension_reason ?? null,
      suspension_ends_at: payload.suspension_ends_at ? new Date(payload.suspension_ends_at) : (before?.suspension_ends_at ?? null),
      suspended_at: payload.is_suspended === true ? new Date() : (before?.suspended_at ?? null),
      updated_by: adminUserId,
      updated_at: new Date()
    };

    if (!before) {
      await db('account_security_flags').insert({
        account_user_id: accountUserId,
        ...nextData,
        created_at: new Date()
      });
    } else {
      await db('account_security_flags')
        .where('account_user_id', accountUserId)
        .update(nextData);
    }

    if (typeof payload.is_suspended === 'boolean') {
      await db('users')
        .where('id', accountUserId)
        .update({
          is_active: payload.is_suspended ? false : true,
          updated_at: new Date()
        });
    }

    const after = await db('account_security_flags').where('account_user_id', accountUserId).first();
    await this.audit(adminUserId, 'account.security.update', 'account', accountUserId, {
      reason: payload.reason,
      before,
      after,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent
    });

    return after;
  }

  async listUsers(adminUserId: number, filters: UserFilters = {}) {
    await this.assertPlatformAdmin(adminUserId);

    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    let query = db('users as u')
      .select('u.id', 'u.name', 'u.email', 'u.is_active', 'u.is_verified', 'u.is_admin', 'u.created_at');

    if (filters.search) {
      query = query.where((builder) => {
        builder.where('u.email', 'like', `%${filters.search}%`)
          .orWhere('u.name', 'like', `%${filters.search}%`);
      });
    }

    if (typeof filters.isActive === 'boolean') {
      query = query.where('u.is_active', filters.isActive);
    }

    if (typeof filters.isAdmin === 'boolean') {
      query = query.where('u.is_admin', filters.isAdmin);
    }

    const [users, total] = await Promise.all([
      query.clone().orderBy('u.created_at', 'desc').limit(limit).offset(offset),
      query.clone().clearSelect().clearOrder().count('* as total').first()
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total: Number((total as any)?.total || 0),
        total_pages: Math.ceil(Number((total as any)?.total || 0) / limit)
      }
    };
  }

  async updateUserStatus(
    adminUserId: number,
    userId: number,
    payload: { is_active?: boolean; is_admin?: boolean; reason?: string; },
    requestContext?: { requestId?: string; ipAddress?: string; userAgent?: string; }
  ) {
    await this.assertPlatformAdmin(adminUserId);
    if (userId === adminUserId && payload.is_admin === false) {
      throw new Error('You cannot remove your own admin access');
    }

    const before = await db('users').where('id', userId).first();
    if (!before) {
      throw new Error('User not found');
    }

    const updates: any = { updated_at: new Date() };
    if (typeof payload.is_active === 'boolean') updates.is_active = payload.is_active;
    if (typeof payload.is_admin === 'boolean') updates.is_admin = payload.is_admin;

    await db('users').where('id', userId).update(updates);
    const after = await db('users').where('id', userId).first();

    if (typeof payload.is_admin === 'boolean' && payload.is_admin) {
      if (await this.hasTable('platform_admin_profiles')) {
        const hasProfile = await db('platform_admin_profiles').where('user_id', userId).first();
        if (!hasProfile) {
          await db('platform_admin_profiles').insert({
            user_id: userId,
            role: 'super_admin',
            is_active: true,
            mfa_required: true,
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }
    }

    await this.audit(adminUserId, 'user.status.update', 'user', userId, {
      reason: payload.reason,
      before,
      after,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent
    });

    return after;
  }

  async getDeliverabilityOverview(adminUserId: number, days: number = 30) {
    await this.assertPlatformAdmin(adminUserId);

    const fromDate = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const rows = await db('emails as e')
      .select(
        db.raw(`${sqlExtractDomain('e.from_email')} as domain`),
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(CASE WHEN e.status IN ('failed', 'bounced') THEN 1 END) as failed"),
        db.raw("COUNT(CASE WHEN e.status IN ('sent', 'delivered', 'opened', 'clicked') THEN 1 END) as successful")
      )
      .where('e.created_at', '>=', fromDate)
      .groupBy(db.raw(sqlExtractDomain('e.from_email')))
      .orderBy('total', 'desc')
      .limit(200);

    return rows.map((row: any) => {
      const total = Number(row.total || 0);
      const failed = Number(row.failed || 0);
      const successful = Number(row.successful || 0);
      return {
        domain: row.domain || 'unknown',
        total,
        failed,
        successful,
        delivery_rate: total > 0 ? Math.round((successful / total) * 10000) / 100 : 0,
        failure_rate: total > 0 ? Math.round((failed / total) * 10000) / 100 : 0
      };
    });
  }

  async getIntegrationsOverview(adminUserId: number) {
    await this.assertPlatformAdmin(adminUserId);

    const [webhooks, webhookFailures, apiKeys] = await Promise.all([
      db('webhooks').count('* as total').first(),
      this.hasTable('webhook_logs')
        .then((hasTable) => hasTable
          ? db('webhook_logs')
            .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
            .where('success', false)
            .count('* as total')
            .first()
          : Promise.resolve({ total: 0 })),
      db('api_keys').where('is_active', true).count('* as total').first()
    ]);

    return {
      webhooks_total: Number((webhooks as any)?.total || 0),
      webhook_failures_24h: Number((webhookFailures as any)?.total || 0),
      active_api_keys: Number((apiKeys as any)?.total || 0)
    };
  }

  async startImpersonation(
    adminUserId: number,
    accountUserId: number,
    reason: string,
    requestContext?: { requestId?: string; ipAddress?: string; userAgent?: string; },
    ttlMinutes: number = 30
  ) {
    await this.assertPlatformAdmin(adminUserId);
    await this.ensureTables(['platform_impersonation_sessions']);

    if (!reason || reason.trim().length < 10) {
      throw new Error('Impersonation reason must have at least 10 characters');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + Math.max(5, ttlMinutes) * 60 * 1000);

    await db('platform_impersonation_sessions').insert({
      session_token: token,
      admin_user_id: adminUserId,
      account_user_id: accountUserId,
      status: 'active',
      reason: reason.trim(),
      expires_at: expiresAt,
      created_at: new Date()
    });

    await this.audit(adminUserId, 'impersonation.start', 'account', accountUserId, {
      reason,
      after: { expires_at: expiresAt.toISOString() },
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent
    });

    return {
      session_token: token,
      expires_at: expiresAt.toISOString()
    };
  }

  async stopImpersonation(
    adminUserId: number,
    sessionToken: string,
    reason?: string,
    requestContext?: { requestId?: string; ipAddress?: string; userAgent?: string; }
  ) {
    await this.assertPlatformAdmin(adminUserId);
    await this.ensureTables(['platform_impersonation_sessions']);

    const session = await db('platform_impersonation_sessions')
      .where('session_token', sessionToken)
      .first();

    if (!session) {
      throw new Error('Impersonation session not found');
    }

    await db('platform_impersonation_sessions')
      .where('session_token', sessionToken)
      .update({
        status: 'ended',
        ended_at: new Date()
      });

    await this.audit(adminUserId, 'impersonation.stop', 'account', session.account_user_id, {
      reason: reason || 'manual stop',
      before: { status: session.status },
      after: { status: 'ended' },
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent
    });

    return { success: true };
  }

  async listAuditLogs(adminUserId: number, options: PaginationOptions = {}) {
    await this.assertPlatformAdmin(adminUserId);
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const hasAuditTable = await this.hasTable('platform_admin_audit_logs');
    if (!hasAuditTable) {
      return {
        logs: [],
        pagination: { page, limit, total: 0, total_pages: 0 }
      };
    }

    const [logs, total] = await Promise.all([
      db('platform_admin_audit_logs')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('platform_admin_audit_logs').count('* as total').first()
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total: Number((total as any)?.total || 0),
        total_pages: Math.ceil(Number((total as any)?.total || 0) / limit)
      }
    };
  }
}

export const superAdminService = new SuperAdminService();

export default SuperAdminService;
