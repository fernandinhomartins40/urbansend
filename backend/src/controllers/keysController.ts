import { Response } from 'express';
import db from '../config/database';
import { logger } from '../config/logger';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { generateApiKey, hashApiKey } from '../utils/crypto';

const formatApiKey = (key: any) => ({
  id: key.id,
  key_name: key.name,
  permissions: typeof key.permissions === 'string' ? JSON.parse(key.permissions) : key.permissions,
  created_at: key.created_at,
  last_used_at: key.last_used ?? null,
  is_active: Boolean(key.is_active),
  api_key_preview: key.key_preview || `re_${String(key.id).padStart(7, '0')}`
});

export const getApiKeys = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  const apiKeys = await db('api_keys')
    .select('id', 'name', 'permissions', 'created_at', 'last_used', 'is_active', 'key_preview')
    .where('user_id', userId)
    .orderBy('created_at', 'desc');

  const formattedKeys = apiKeys.map(formatApiKey);

  res.json({
    api_keys: formattedKeys,
    total: apiKeys.length
  });
});

export const createApiKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const name = req.body.key_name || req.body.name;
  const { permissions } = req.body;
  const userId = req.user!.id;

  // Check if key name already exists for this user
  const existingKey = await db('api_keys')
    .where('user_id', userId)
    .where('name', name)
    .first();

  if (existingKey) {
    throw createError('API key with this name already exists', 409);
  }

  // Generate API key
  const apiKey = generateApiKey();
  const hashedApiKey = await hashApiKey(apiKey);

  // Create API key record
  const insertResult = await db('api_keys').insert({
    user_id: userId,
    name,
    key_hash: hashedApiKey,
    key_preview: apiKey.slice(0, 10),
    permissions: JSON.stringify(permissions),
    created_at: new Date(),
    is_active: true
  });
  
  const keyId = insertResult[0];

  logger.info('API key created successfully', { 
    userId, 
    keyId, 
    keyName: name,
    permissions: permissions.length 
  });

  res.status(201).json({
    message: 'API key created successfully',
    api_key: {
      id: keyId,
      key_name: name,
      permissions,
      created_at: new Date().toISOString(),
      is_active: true,
      api_key_preview: apiKey.slice(0, 10)
    },
    // Return the actual API key only once during creation
    key: apiKey,
    warning: 'Please save this API key securely. It will not be shown again.'
  });
});

export const updateApiKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!id) {
    throw createError('API key ID is required', 400);
  }
  
  const userId = req.user!.id;

  const apiKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  const name = req.body.key_name ?? req.body.name ?? apiKey.name;
  const permissions = req.body.permissions ?? (typeof apiKey.permissions === 'string' ? JSON.parse(apiKey.permissions) : apiKey.permissions);

  // Check if new key name conflicts with existing keys (excluding current key)
  if (name !== apiKey.name) {
    const existingKey = await db('api_keys')
      .where('user_id', userId)
      .where('name', name)
      .where('id', '!=', parseInt(id, 10))
      .first();

    if (existingKey) {
      throw createError('API key with this name already exists', 409);
    }
  }

  await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .update({
      name,
      permissions: JSON.stringify(permissions)
    });

  const updatedKey = await db('api_keys')
    .select('id', 'name', 'permissions', 'created_at', 'last_used', 'is_active', 'key_preview')
    .where('id', id)
    .first();

  logger.info('API key updated successfully', { userId, keyId: id });

  res.json({
    message: 'API key updated successfully',
    api_key: formatApiKey(updatedKey)
  });
});

export const deleteApiKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const apiKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .del();

  logger.info('API key deleted successfully', { userId, keyId: id });

  res.json({
    message: 'API key deleted successfully'
  });
});

export const regenerateApiKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const existingKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!existingKey) {
    throw createError('API key not found', 404);
  }

  // Generate new API key
  const newApiKey = generateApiKey();
  const hashedApiKey = await hashApiKey(newApiKey);

  // Update the API key
  await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .update({
      key_hash: hashedApiKey,
      key_preview: newApiKey.slice(0, 10),
      last_used: null // Reset last used timestamp
    });

  logger.info('API key regenerated successfully', { userId, keyId: id });

  res.json({
    message: 'API key regenerated successfully',
    key: newApiKey,
    warning: 'Please save this new API key securely. It will not be shown again.'
  });
});

export const toggleApiKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const apiKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  const newStatus = !apiKey.is_active;

  await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .update({
      is_active: newStatus
    });

  logger.info(`API key ${newStatus ? 'activated' : 'deactivated'}`, { userId, keyId: id });

  res.json({
    message: `API key ${newStatus ? 'activated' : 'deactivated'} successfully`,
    is_active: newStatus
  });
});

export const getApiKeyUsage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const apiKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  // Get usage statistics for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const emailStats = await db('emails')
    .select(
      db.raw('COUNT(*) as total_emails'),
      db.raw(`
        COUNT(
          CASE
            WHEN status IN ('sent', 'delivered', 'opened', 'clicked')
              OR sent_at IS NOT NULL
            THEN 1
          END
        ) as sent_emails
      `),
      db.raw(`
        COUNT(
          CASE
            WHEN status IN ('sent', 'delivered', 'opened', 'clicked')
              OR delivered_at IS NOT NULL
            THEN 1
          END
        ) as delivered_emails
      `),
      db.raw(`
        COUNT(
          CASE
            WHEN status IN ('opened', 'clicked')
              OR opened_at IS NOT NULL
            THEN 1
          END
        ) as opened_emails
      `),
      db.raw(`
        COUNT(
          CASE
            WHEN status = 'clicked'
              OR clicked_at IS NOT NULL
            THEN 1
          END
        ) as clicked_emails
      `),
      db.raw("COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced_emails"),
      db.raw("COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_emails")
    )
    .where('api_key_id', id)
    .where('created_at', '>=', thirtyDaysAgo)
    .first();

  // Get daily usage for the last 30 days
  const dailyUsage = await db('emails')
    .select(
      db.raw('DATE(created_at) as date'),
      db.raw('COUNT(*) as count')
    )
    .where('api_key_id', id)
    .where('created_at', '>=', thirtyDaysAgo)
    .groupBy(db.raw('DATE(created_at)'))
    .orderBy('date', 'asc');

  res.json({
    api_key: {
      id: apiKey.id,
      key_name: apiKey.name,
      last_used_at: apiKey.last_used,
      is_active: apiKey.is_active,
      api_key_preview: apiKey.key_preview || `re_${String(apiKey.id).padStart(7, '0')}`
    },
    usage_stats: {
      period: '30 days',
      ...emailStats,
      daily_usage: dailyUsage
    }
  });
});
