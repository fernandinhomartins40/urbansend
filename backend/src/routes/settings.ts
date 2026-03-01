import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../config/database';

const router = Router();

router.use(authenticateJWT);

const settingsSchema = z.object({
  notification_preferences: z.record(z.boolean()).optional(),
  system_preferences: z.object({
    language: z.string().optional(),
    timezone: z.string().optional(),
    items_per_page: z.number().int().min(5).max(100).optional(),
    auto_refresh: z.boolean().optional(),
    auto_refresh_interval: z.number().int().min(5000).max(300000).optional()
  }).optional(),
  branding_settings: z.object({
    company_name: z.string().max(150).optional(),
    footer_text: z.string().max(200).optional()
  }).optional(),
  analytics_settings: z.object({
    default_time_range: z.enum(['24h', '7d', '30d', '90d']).optional(),
    track_opens: z.boolean().optional(),
    track_clicks: z.boolean().optional()
  }).optional()
});

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

const getDefaultSettings = () => ({
  notification_preferences: {
    email_delivery_reports: true,
    bounce_notifications: true,
    daily_summary: true,
    weekly_reports: false,
    security_alerts: true,
    webhook_failures: true
  },
  system_preferences: {
    theme: 'light',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    date_format: 'DD/MM/YYYY',
    time_format: '24h',
    items_per_page: 20,
    auto_refresh: true,
    auto_refresh_interval: 30000
  },
  branding_settings: {
    company_name: '',
    company_logo_url: '',
    custom_domain: '',
    footer_text: '',
    primary_color: '#3b82f6',
    secondary_color: '#1e40af'
  },
  analytics_settings: {
    default_time_range: '30d',
    track_opens: true,
    track_clicks: true,
    track_downloads: true,
    pixel_tracking: true,
    utm_tracking: true
  }
});

const normalizeSettings = (row: any) => {
  const defaults = getDefaultSettings();

  return {
    notification_preferences: {
      ...defaults.notification_preferences,
      ...parseJsonField(row?.notification_preferences, {})
    },
    system_preferences: {
      ...defaults.system_preferences,
      ...parseJsonField(row?.system_preferences, {})
    },
    branding_settings: {
      ...defaults.branding_settings,
      ...parseJsonField(row?.branding_settings, {})
    },
    analytics_settings: {
      ...defaults.analytics_settings,
      ...parseJsonField(row?.analytics_settings, {})
    }
  };
};

const ensureUserSettings = async (userId: number) => {
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
};

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const settings = await ensureUserSettings(req.user!.id);
  res.json({ settings: normalizeSettings(settings) });
}));

router.put('/',
  validateRequest({ body: settingsSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const current = await ensureUserSettings(req.user!.id);
    const normalized = normalizeSettings(current);

    const updatedSettings = {
      notification_preferences: {
        ...normalized.notification_preferences,
        ...(req.body.notification_preferences || {})
      },
      system_preferences: {
        ...normalized.system_preferences,
        ...(req.body.system_preferences || {})
      },
      branding_settings: {
        ...normalized.branding_settings,
        ...(req.body.branding_settings || {})
      },
      analytics_settings: {
        ...normalized.analytics_settings,
        ...(req.body.analytics_settings || {})
      }
    };

    await db('user_settings')
      .where('user_id', req.user!.id)
      .update({
        notification_preferences: JSON.stringify(updatedSettings.notification_preferences),
        system_preferences: JSON.stringify(updatedSettings.system_preferences),
        branding_settings: JSON.stringify(updatedSettings.branding_settings),
        analytics_settings: JSON.stringify(updatedSettings.analytics_settings),
        updated_at: new Date()
      });

    res.json({ settings: updatedSettings });
  })
);

export default router;
