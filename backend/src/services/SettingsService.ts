import db from '../config/database';
import { WorkspaceContext } from './WorkspaceService';
import { encryptSensitiveValue } from '../utils/crypto';
import { logger } from '../config/logger';

type JsonRecord = Record<string, any>;

export interface EffectiveSettings {
  workspace: {
    organization_id: number | null;
    organization_name: string;
    organization_slug: string;
    role: WorkspaceContext['role'];
    account_user_id: number;
    is_personal: boolean;
  };
  profile: {
    id: number;
    name: string;
    email: string;
    is_verified: boolean;
    is_active: boolean;
  };
  plan: {
    name: string;
    status: string;
    expires_at: string | null;
  };
  personal_preferences: {
    notification_preferences: Record<string, boolean>;
    system_preferences: {
      theme: 'light' | 'dark' | 'system';
      language: string;
      timezone: string;
      date_format: string;
      time_format: '12h' | '24h';
      items_per_page: number;
      auto_refresh: boolean;
      auto_refresh_interval: number;
    };
    security_settings: {
      session_timeout: number;
      require_password_confirmation: boolean;
      ip_whitelist: string[];
      two_factor_enabled: boolean;
      api_rate_limit: number;
    };
  };
  account_preferences: {
    smtp_settings: {
      use_custom: boolean;
      host: string;
      port: number | null;
      username: string;
      password_configured: boolean;
      use_tls: boolean;
    };
    branding_settings: {
      company_name: string;
      company_logo_url: string;
      custom_domain: string;
      footer_text: string;
      primary_color: string;
      secondary_color: string;
    };
    analytics_settings: {
      default_time_range: '24h' | '7d' | '30d' | '90d';
      track_opens: boolean;
      track_clicks: boolean;
      track_downloads: boolean;
      pixel_tracking: boolean;
      utm_tracking: boolean;
    };
    sending_settings: {
      timezone: string;
      default_from_email: string;
      default_from_name: string;
      bounce_handling: boolean;
      open_tracking: boolean;
      click_tracking: boolean;
      unsubscribe_tracking: boolean;
      suppression_list_enabled: boolean;
    };
    webhook_settings: {
      enabled: boolean;
      webhook_url: string;
      webhook_secret_configured: boolean;
      custom_headers: JsonRecord;
    };
  };
}

export interface SettingsUpdatePayload {
  notification_preferences?: Record<string, boolean>;
  system_preferences?: Partial<EffectiveSettings['personal_preferences']['system_preferences']>;
  security_settings?: Partial<EffectiveSettings['personal_preferences']['security_settings']>;
  branding_settings?: Partial<EffectiveSettings['account_preferences']['branding_settings']>;
  analytics_settings?: Partial<EffectiveSettings['account_preferences']['analytics_settings']>;
  smtp_settings?: {
    use_custom?: boolean;
    host?: string;
    port?: number | null;
    username?: string;
    password?: string;
    use_tls?: boolean;
  };
  sending_settings?: Partial<EffectiveSettings['account_preferences']['sending_settings']>;
  webhook_settings?: {
    enabled?: boolean;
    webhook_url?: string;
    webhook_secret?: string;
    custom_headers?: JsonRecord;
  };
}

const parseJsonField = <T>(value: unknown, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value as T;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const DEFAULT_NOTIFICATION_PREFERENCES = {
  email_delivery_reports: true,
  bounce_notifications: true,
  daily_summary: true,
  weekly_reports: false,
  security_alerts: true,
  webhook_failures: true
};

const DEFAULT_SYSTEM_PREFERENCES: EffectiveSettings['personal_preferences']['system_preferences'] = {
  theme: 'light',
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  date_format: 'DD/MM/YYYY',
  time_format: '24h',
  items_per_page: 20,
  auto_refresh: true,
  auto_refresh_interval: 30000
};

const DEFAULT_SECURITY_SETTINGS: EffectiveSettings['personal_preferences']['security_settings'] = {
  two_factor_enabled: false,
  session_timeout: 3600,
  ip_whitelist: [],
  api_rate_limit: 1000,
  require_password_confirmation: false
};

const DEFAULT_BRANDING_SETTINGS: EffectiveSettings['account_preferences']['branding_settings'] = {
  company_name: '',
  company_logo_url: '',
  custom_domain: '',
  footer_text: '',
  primary_color: '#3b82f6',
  secondary_color: '#1e40af'
};

const DEFAULT_ANALYTICS_SETTINGS: EffectiveSettings['account_preferences']['analytics_settings'] = {
  default_time_range: '30d',
  track_opens: true,
  track_clicks: true,
  track_downloads: true,
  pixel_tracking: true,
  utm_tracking: true
};

class SettingsService {
  private userPlansHasStatusColumn: boolean | null = null;

  private async hasUserPlanStatusColumn(): Promise<boolean> {
    if (this.userPlansHasStatusColumn !== null) {
      return this.userPlansHasStatusColumn;
    }

    try {
      this.userPlansHasStatusColumn = await db.schema.hasColumn('user_plans', 'status');
      return this.userPlansHasStatusColumn;
    } catch {
      this.userPlansHasStatusColumn = false;
      return false;
    }
  }

  private async getActivePlan(userId: number): Promise<any | null> {
    try {
      const hasStatusColumn = await this.hasUserPlanStatusColumn();
      const query = db('user_plans')
        .where('user_id', userId)
        .where('is_active', true)
        .orderBy('created_at', 'desc');

      if (hasStatusColumn) {
        query.select('plan_name', 'status', 'expires_at', 'is_active');
      } else {
        query.select('plan_name', 'expires_at', 'is_active');
      }

      return await query.first();
    } catch (error) {
      logger.warn('Failed to load active user plan, using free fallback', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async ensureUserSettings(userId: number): Promise<any> {
    let settings = await db('user_settings').where('user_id', userId).first();

    if (!settings) {
      await db('user_settings').insert({
        user_id: userId,
        created_at: new Date(),
        updated_at: new Date()
      });

      settings = await db('user_settings').where('user_id', userId).first();
    }

    return settings;
  }

  async ensureTenantSettings(userId: number): Promise<any> {
    let settings = await db('tenant_settings').where('user_id', userId).first();

    if (!settings) {
      const user = await db('users').select('email', 'name', 'timezone').where('id', userId).first();
      await db('tenant_settings').insert({
        user_id: userId,
        timezone: user?.timezone || 'America/Sao_Paulo',
        default_from_email: user?.email || '',
        default_from_name: user?.name || 'UltraZend User',
        bounce_handling: true,
        open_tracking: true,
        click_tracking: true,
        unsubscribe_tracking: true,
        suppression_list_enabled: true,
        webhook_enabled: false,
        created_at: new Date(),
        updated_at: new Date()
      });

      settings = await db('tenant_settings').where('user_id', userId).first();
    }

    return settings;
  }

  async getEffectiveSettings(actorUserId: number, workspace: WorkspaceContext): Promise<EffectiveSettings> {
    const [actorUser, actorSettings, accountUser, accountSettings, tenantSettings, activePlan] = await Promise.all([
      db('users')
        .select('id', 'name', 'email', 'is_verified', 'is_active')
        .where('id', actorUserId)
        .first(),
      this.ensureUserSettings(actorUserId),
      db('users')
        .select('id', 'name', 'email', 'timezone')
        .where('id', workspace.accountUserId)
        .first(),
      this.ensureUserSettings(workspace.accountUserId),
      this.ensureTenantSettings(workspace.accountUserId),
      this.getActivePlan(workspace.accountUserId)
    ]);

    const actorSystem = {
      ...DEFAULT_SYSTEM_PREFERENCES,
      ...parseJsonField(actorSettings?.system_preferences, {})
    };

    const actorNotifications = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parseJsonField(actorSettings?.notification_preferences, {})
    };

    const actorSecurity = {
      ...DEFAULT_SECURITY_SETTINGS,
      ...parseJsonField(actorSettings?.security_settings, {})
    };

    const accountBranding = {
      ...DEFAULT_BRANDING_SETTINGS,
      ...parseJsonField(accountSettings?.branding_settings, {})
    };

    const accountAnalytics = {
      ...DEFAULT_ANALYTICS_SETTINGS,
      ...parseJsonField(accountSettings?.analytics_settings, {})
    };

    return {
      workspace: {
        organization_id: workspace.organizationId,
        organization_name: workspace.organizationName,
        organization_slug: workspace.organizationSlug,
        role: workspace.role,
        account_user_id: workspace.accountUserId,
        is_personal: workspace.isPersonal
      },
      profile: {
        id: actorUser.id,
        name: actorUser.name,
        email: actorUser.email,
        is_verified: Boolean(actorUser.is_verified),
        is_active: actorUser.is_active !== false
      },
      plan: {
        name: activePlan?.plan_name || 'free',
        status: activePlan?.status || (activePlan?.is_active === false ? 'inactive' : 'active'),
        expires_at: activePlan?.expires_at ? new Date(activePlan.expires_at).toISOString() : null
      },
      personal_preferences: {
        notification_preferences: actorNotifications,
        system_preferences: actorSystem,
        security_settings: actorSecurity
      },
      account_preferences: {
        smtp_settings: {
          use_custom: Boolean(accountSettings?.smtp_use_custom),
          host: accountSettings?.smtp_host || '',
          port: accountSettings?.smtp_port ? Number(accountSettings.smtp_port) : null,
          username: accountSettings?.smtp_username || '',
          password_configured: Boolean(accountSettings?.smtp_password_encrypted),
          use_tls: accountSettings?.smtp_use_tls !== false
        },
        branding_settings: accountBranding,
        analytics_settings: accountAnalytics,
        sending_settings: {
          timezone: tenantSettings?.timezone || accountUser?.timezone || 'America/Sao_Paulo',
          default_from_email: tenantSettings?.default_from_email || accountUser?.email || '',
          default_from_name: tenantSettings?.default_from_name || accountUser?.name || 'UltraZend User',
          bounce_handling: tenantSettings?.bounce_handling !== false,
          open_tracking: tenantSettings?.open_tracking !== false,
          click_tracking: tenantSettings?.click_tracking !== false,
          unsubscribe_tracking: tenantSettings?.unsubscribe_tracking !== false,
          suppression_list_enabled: tenantSettings?.suppression_list_enabled !== false
        },
        webhook_settings: {
          enabled: Boolean(tenantSettings?.webhook_enabled),
          webhook_url: tenantSettings?.webhook_url || '',
          webhook_secret_configured: Boolean(tenantSettings?.webhook_secret),
          custom_headers: parseJsonField(tenantSettings?.custom_headers, {})
        }
      }
    };
  }

  async updateEffectiveSettings(
    actorUserId: number,
    workspace: WorkspaceContext,
    payload: SettingsUpdatePayload
  ): Promise<EffectiveSettings> {
    const actorSettings = await this.ensureUserSettings(actorUserId);
    const accountSettings = await this.ensureUserSettings(workspace.accountUserId);
    const tenantSettings = await this.ensureTenantSettings(workspace.accountUserId);

    const canManageAccountSettings = ['owner', 'admin'].includes(workspace.role);
    const wantsAccountLevelUpdate = Boolean(
      payload.branding_settings
      || payload.analytics_settings
      || payload.smtp_settings
      || payload.sending_settings
      || payload.webhook_settings
    );

    if (wantsAccountLevelUpdate && !canManageAccountSettings) {
      throw new Error('Insufficient workspace permissions to update account settings');
    }

    const nextActorNotifications = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parseJsonField(actorSettings?.notification_preferences, {}),
      ...(payload.notification_preferences || {})
    };

    const nextActorSystem = {
      ...DEFAULT_SYSTEM_PREFERENCES,
      ...parseJsonField(actorSettings?.system_preferences, {}),
      ...(payload.system_preferences || {})
    };

    const nextActorSecurity = {
      ...DEFAULT_SECURITY_SETTINGS,
      ...parseJsonField(actorSettings?.security_settings, {}),
      ...(payload.security_settings || {})
    };

    await db('user_settings')
      .where('user_id', actorUserId)
      .update({
        notification_preferences: JSON.stringify(nextActorNotifications),
        system_preferences: JSON.stringify(nextActorSystem),
        security_settings: JSON.stringify(nextActorSecurity),
        updated_at: new Date()
      });

    if (wantsAccountLevelUpdate) {
      const nextAccountBranding = {
        ...DEFAULT_BRANDING_SETTINGS,
        ...parseJsonField(accountSettings?.branding_settings, {}),
        ...(payload.branding_settings || {})
      };

      const nextAccountAnalytics = {
        ...DEFAULT_ANALYTICS_SETTINGS,
        ...parseJsonField(accountSettings?.analytics_settings, {}),
        ...(payload.analytics_settings || {})
      };

      const smtpSettingsUpdate = {
        smtp_host: payload.smtp_settings?.host ?? accountSettings?.smtp_host ?? null,
        smtp_port: payload.smtp_settings?.port ?? accountSettings?.smtp_port ?? null,
        smtp_username: payload.smtp_settings?.username ?? accountSettings?.smtp_username ?? null,
        smtp_use_custom: payload.smtp_settings?.use_custom ?? accountSettings?.smtp_use_custom ?? false,
        smtp_use_tls: payload.smtp_settings?.use_tls ?? accountSettings?.smtp_use_tls ?? true
      } as any;

      if (typeof payload.smtp_settings?.password === 'string') {
        smtpSettingsUpdate.smtp_password_encrypted = payload.smtp_settings.password
          ? encryptSensitiveValue(payload.smtp_settings.password)
          : null;
      }

      await db('user_settings')
        .where('user_id', workspace.accountUserId)
        .update({
          ...smtpSettingsUpdate,
          branding_settings: JSON.stringify(nextAccountBranding),
          analytics_settings: JSON.stringify(nextAccountAnalytics),
          updated_at: new Date()
        });

      const nextWebhookSettings = {
        webhook_enabled: payload.webhook_settings?.enabled ?? tenantSettings?.webhook_enabled ?? false,
        webhook_url: payload.webhook_settings?.webhook_url ?? tenantSettings?.webhook_url ?? null,
        webhook_secret: typeof payload.webhook_settings?.webhook_secret === 'string'
          ? (
            payload.webhook_settings.webhook_secret
              ? encryptSensitiveValue(payload.webhook_settings.webhook_secret)
              : null
          )
          : (tenantSettings?.webhook_secret ?? null),
        custom_headers: JSON.stringify(payload.webhook_settings?.custom_headers ?? parseJsonField(tenantSettings?.custom_headers, {}))
      };

      await db('tenant_settings')
        .where('user_id', workspace.accountUserId)
        .update({
          timezone: payload.sending_settings?.timezone ?? tenantSettings?.timezone ?? 'America/Sao_Paulo',
          default_from_email: payload.sending_settings?.default_from_email ?? tenantSettings?.default_from_email ?? null,
          default_from_name: payload.sending_settings?.default_from_name ?? tenantSettings?.default_from_name ?? null,
          bounce_handling: payload.sending_settings?.bounce_handling ?? tenantSettings?.bounce_handling ?? true,
          open_tracking: payload.sending_settings?.open_tracking ?? tenantSettings?.open_tracking ?? true,
          click_tracking: payload.sending_settings?.click_tracking ?? tenantSettings?.click_tracking ?? true,
          unsubscribe_tracking: payload.sending_settings?.unsubscribe_tracking ?? tenantSettings?.unsubscribe_tracking ?? true,
          suppression_list_enabled: payload.sending_settings?.suppression_list_enabled ?? tenantSettings?.suppression_list_enabled ?? true,
          webhook_enabled: nextWebhookSettings.webhook_enabled,
          webhook_url: nextWebhookSettings.webhook_url,
          webhook_secret: nextWebhookSettings.webhook_secret,
          custom_headers: nextWebhookSettings.custom_headers,
          updated_at: new Date()
        });
    }

    return this.getEffectiveSettings(actorUserId, workspace);
  }
}

export const settingsService = new SettingsService();
