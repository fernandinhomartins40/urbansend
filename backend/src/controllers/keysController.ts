import { Response } from 'express';
import db from '../config/database';
import { logger } from '../config/logger';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { generateApiKey, hashApiKey } from '../utils/crypto';
import { resolveInsertedId } from '../utils/insertedId';
import { getAccountUserId, getActorUserId } from '../utils/accountContext';
import { applyApiKeyMetadataForWrite, deriveApiKeyType, getApiKeySelectColumns } from '../utils/apiKeyTable';

const formatApiKey = (key: any) => ({
  id: key.id,
  key_name: key.name,
  description: key.description || null,
  key_type: deriveApiKeyType(key),
  permissions: typeof key.permissions === 'string' ? JSON.parse(key.permissions) : key.permissions,
  created_at: key.created_at,
  last_used_at: key.last_used ?? null,
  is_active: Boolean(key.is_active),
  api_key_preview: key.key_preview || `re_${String(key.id).padStart(7, '0')}`
});

export const getApiKeys = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = getAccountUserId(req);
  const selectColumns = await getApiKeySelectColumns();

  const apiKeys = await db('api_keys')
    .select(selectColumns)
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
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
  const keyType = req.body.key_type === 'ai_agent' ? 'ai_agent' : 'standard';
  const { permissions } = req.body;
  const userId = getAccountUserId(req);
  const actorUserId = getActorUserId(req);

  // Check if key name already exists for this user
  const existingKey = await db('api_keys')
    .where('user_id', userId)
    .where('name', name)
    .first();

  if (existingKey) {
    throw createError('API key with this name already exists', 409);
  }

  // Generate API key
  const apiKey = generateApiKey(keyType === 'ai_agent' ? 'uai' : 're');
  const hashedApiKey = await hashApiKey(apiKey);

  // Create API key record
  const insertPayload = await applyApiKeyMetadataForWrite({
    user_id: userId,
    name,
    description,
    key_type: keyType,
    key_hash: hashedApiKey,
    key_preview: apiKey.slice(0, 10),
    permissions: JSON.stringify(permissions),
    created_at: new Date(),
    is_active: true
  });

  const insertResult = await db('api_keys').insert(insertPayload);

  const keyId = resolveInsertedId(insertResult)
    ?? Number(
      (
        await db('api_keys')
          .select('id')
          .where('user_id', userId)
          .where('name', name)
          .orderBy('id', 'desc')
          .first()
      )?.id
    );

  if (!keyId) {
    throw createError('Failed to resolve API key after creation', 500);
  }

  logger.info('API key created successfully', { 
    userId, 
    actorUserId,
    keyId, 
    keyName: name,
    permissions: permissions.length 
  });

  res.status(201).json({
    message: 'API key created successfully',
    api_key: {
      id: keyId,
      key_name: name,
      description,
      key_type: keyType,
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
  
  const userId = getAccountUserId(req);

  const apiKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  const name = req.body.key_name ?? req.body.name ?? apiKey.name;
  const description = typeof req.body.description === 'string'
    ? req.body.description.trim()
    : (apiKey.description ?? null);
  const keyType = req.body.key_type === 'ai_agent' ? 'ai_agent' : (apiKey.key_type || 'standard');
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

  const updatePayload = await applyApiKeyMetadataForWrite({
    name,
    description,
    key_type: keyType,
    permissions: JSON.stringify(permissions)
  });

  await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .update(updatePayload);

  const selectColumns = await getApiKeySelectColumns();

  const updatedKey = await db('api_keys')
    .select(selectColumns)
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
  const userId = getAccountUserId(req);

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
  const userId = getAccountUserId(req);

  const existingKey = await db('api_keys')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!existingKey) {
    throw createError('API key not found', 404);
  }

  // Generate new API key
  const currentKeyType = deriveApiKeyType(existingKey);
  const newApiKey = generateApiKey(currentKeyType === 'ai_agent' ? 'uai' : 're');
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
  const userId = getAccountUserId(req);

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
  const userId = getAccountUserId(req);

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

  const hasApiKeyIdColumn = await db.schema.hasColumn('emails', 'api_key_id');

  if (!hasApiKeyIdColumn) {
    return res.json({
      api_key: {
        id: apiKey.id,
        key_name: apiKey.name,
        last_used_at: apiKey.last_used,
        is_active: apiKey.is_active,
        api_key_preview: apiKey.key_preview || `re_${String(apiKey.id).padStart(7, '0')}`
      },
      usage_stats: {
        period: '30 days',
        total_emails: 0,
        sent_emails: 0,
        delivered_emails: 0,
        opened_emails: 0,
        clicked_emails: 0,
        bounced_emails: 0,
        failed_emails: 0,
        daily_usage: []
      }
    });
  }

  const emailStats = await db('emails')
    .leftJoin('email_analytics', 'email_analytics.email_id', '=', 'emails.id')
    .select(
      db.raw('COUNT(DISTINCT emails.id) as total_emails'),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status IN ('sent', 'delivered', 'opened', 'clicked')
              OR emails.sent_at IS NOT NULL
            THEN emails.id
          END
        ) as sent_emails
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status IN ('delivered', 'opened', 'clicked')
              OR emails.delivered_at IS NOT NULL
            THEN emails.id
          END
        ) as delivered_emails
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status IN ('opened', 'clicked')
              OR email_analytics.event_type IN ('open', 'opened')
            THEN emails.id
          END
        ) as opened_emails
      `),
      db.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status = 'clicked'
              OR email_analytics.event_type IN ('click', 'clicked')
            THEN emails.id
          END
        ) as clicked_emails
      `),
      db.raw("COUNT(DISTINCT CASE WHEN emails.status = 'bounced' THEN emails.id END) as bounced_emails"),
      db.raw("COUNT(DISTINCT CASE WHEN emails.status = 'failed' THEN emails.id END) as failed_emails")
    )
    .where('emails.api_key_id', id)
    .where('emails.created_at', '>=', thirtyDaysAgo)
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
