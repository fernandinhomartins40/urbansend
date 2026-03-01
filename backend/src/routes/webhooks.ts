import axios from 'axios';
import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { generateSecretKey, createWebhookSignature } from '../utils/crypto';
import db from '../config/database';

const router = Router();

router.use(authenticateJWT);

const parseEvents = (events: unknown): string[] => {
  if (Array.isArray(events)) {
    return events.filter((event): event is string => typeof event === 'string');
  }

  if (typeof events === 'string') {
    try {
      const parsed = JSON.parse(events);
      return Array.isArray(parsed)
        ? parsed.filter((event): event is string => typeof event === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [];
};

const buildWebhookName = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Webhook';
  }
};

const normalizeWebhook = (
  webhook: any,
  stats?: { total_attempts: number; successful_attempts: number; last_delivery_at?: string | null }
) => {
  const totalAttempts = Number(stats?.total_attempts || 0);
  const successfulAttempts = Number(stats?.successful_attempts || 0);

  return {
    id: webhook.id,
    name: webhook.name || buildWebhookName(webhook.url),
    webhook_url: webhook.url,
    events: parseEvents(webhook.events),
    secret: webhook.secret,
    is_active: Boolean(webhook.is_active),
    created_at: webhook.created_at,
    updated_at: webhook.updated_at,
    last_delivery_at: stats?.last_delivery_at || null,
    delivery_success_rate: totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0
  };
};

const normalizeLog = (log: any) => ({
  id: log.id,
  webhook_id: log.webhook_id,
  event_type: log.event,
  status: log.success ? 'success' : 'failed',
  http_status: log.status_code ?? null,
  request_body: log.payload || '',
  response_body: log.response_body || '',
  response_time_ms: log.response_time_ms ?? null,
  attempts: log.attempt,
  next_retry_at: null,
  created_at: log.created_at,
  error_message: log.error_message || null
});

const getWebhookStatsMap = async (webhookIds: number[]) => {
  if (webhookIds.length === 0) {
    return new Map<number, { total_attempts: number; successful_attempts: number; last_delivery_at?: string | null }>();
  }

  const stats = await db('webhook_logs')
    .select(
      'webhook_id',
      db.raw('COUNT(*) as total_attempts'),
      db.raw('SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_attempts'),
      db.raw('MAX(created_at) as last_delivery_at')
    )
    .whereIn('webhook_id', webhookIds)
    .groupBy('webhook_id');

  return new Map(
    stats.map((row: any) => [
      Number(row.webhook_id),
      {
        total_attempts: Number(row.total_attempts || 0),
        successful_attempts: Number(row.successful_attempts || 0),
        last_delivery_at: row.last_delivery_at || null
      }
    ])
  );
};

const logWebhookDelivery = async (params: {
  webhookId: number;
  event: string;
  payload: unknown;
  success: boolean;
  statusCode?: number | null;
  responseBody?: string | null;
  errorMessage?: string | null;
  responseTimeMs?: number | null;
}) => {
  await db('webhook_logs').insert({
    webhook_id: params.webhookId,
    event: params.event,
    payload: JSON.stringify(params.payload).substring(0, 10000),
    success: params.success,
    status_code: params.statusCode ?? null,
    response_body: params.responseBody ?? null,
    attempt: 1,
    error_message: params.errorMessage ?? null,
    response_time_ms: params.responseTimeMs ?? null,
    created_at: new Date()
  });
};

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const webhooks = await db('webhooks')
    .where('user_id', req.user!.id)
    .orderBy('created_at', 'desc');

  const statsMap = await getWebhookStatsMap(webhooks.map((webhook: any) => Number(webhook.id)));

  res.json({
    webhooks: webhooks.map((webhook: any) => normalizeWebhook(webhook, statsMap.get(Number(webhook.id))))
  });
}));

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const webhookUrl = req.body.webhook_url || req.body.url;
  const events = parseEvents(req.body.events);
  const name = req.body.name || buildWebhookName(webhookUrl);
  const secret = req.body.secret || generateSecretKey();

  const insertResult = await db('webhooks').insert({
    url: webhookUrl,
    name,
    events: JSON.stringify(events),
    secret,
    is_active: true,
    user_id: req.user!.id,
    created_at: new Date(),
    updated_at: new Date()
  });

  const webhookId = insertResult[0];
  const webhook = await db('webhooks').where('id', webhookId).first();

  res.status(201).json({ webhook: normalizeWebhook(webhook) });
}));

router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const currentWebhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();

  if (!currentWebhook) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }

  const webhookUrl = req.body.webhook_url || req.body.url || currentWebhook.url;
  const events = req.body.events ? parseEvents(req.body.events) : parseEvents(currentWebhook.events);

  await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .update({
      url: webhookUrl,
      name: req.body.name || currentWebhook.name || buildWebhookName(webhookUrl),
      events: JSON.stringify(events),
      secret: req.body.secret ?? currentWebhook.secret,
      is_active: typeof req.body.is_active === 'boolean' ? req.body.is_active : currentWebhook.is_active,
      updated_at: new Date()
    });

  const webhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();

  const statsMap = await getWebhookStatsMap([Number(id)]);
  res.json({ webhook: normalizeWebhook(webhook, statsMap.get(Number(id))) });
}));

router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const deleted = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .del();

  if (deleted === 0) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }

  res.json({ message: 'Webhook deletado com sucesso' });
}));

router.get('/:id/logs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status = 'all', event_type = 'all' } = req.query;

  const webhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }

  let query = db('webhook_logs')
    .where('webhook_id', id)
    .orderBy('created_at', 'desc')
    .limit(100);

  if (status === 'success') {
    query = query.where('success', true);
  } else if (status === 'failed') {
    query = query.where('success', false);
  }

  if (typeof event_type === 'string' && event_type !== 'all') {
    query = query.where('event', event_type);
  }

  const logs = await query;
  res.json({ logs: logs.map(normalizeLog) });
}));

router.post('/:id/test', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const webhook = await db('webhooks')
    .where('id', id)
    .where('user_id', req.user!.id)
    .first();

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook não encontrado' });
  }

  const payload = {
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'Teste de webhook do UltraZend',
      webhook_id: webhook.id,
      user_id: req.user!.id
    }
  };

  const payloadString = JSON.stringify(payload);
  const signature = createWebhookSignature(payloadString, webhook.secret || '');
  const startedAt = Date.now();

  try {
    const response = await axios.post(webhook.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': 'webhook.test',
        'X-Webhook-ID': String(webhook.id),
        'User-Agent': 'UltraZend-Webhook/1.0'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    const success = response.status >= 200 && response.status < 300;

    await logWebhookDelivery({
      webhookId: webhook.id,
      event: 'webhook.test',
      payload,
      success,
      statusCode: response.status,
      responseBody: response.data ? JSON.stringify(response.data).substring(0, 1000) : null,
      errorMessage: success ? null : `Endpoint respondeu com status ${response.status}`,
      responseTimeMs: Date.now() - startedAt
    });

    if (!success) {
      return res.status(502).json({
        success: false,
        message: 'O endpoint respondeu com erro ao webhook de teste',
        status_code: response.status
      });
    }

    return res.json({
      success: true,
      message: 'Webhook de teste enviado com sucesso',
      status_code: response.status
    });
  } catch (error: any) {
    const statusCode = error.response?.status ?? null;
    const responseBody = error.response?.data ? JSON.stringify(error.response.data).substring(0, 1000) : null;

    await logWebhookDelivery({
      webhookId: webhook.id,
      event: 'webhook.test',
      payload,
      success: false,
      statusCode,
      responseBody,
      errorMessage: error.message || 'Falha ao enviar webhook de teste',
      responseTimeMs: Date.now() - startedAt
    });

    return res.status(502).json({
      success: false,
      message: error.message || 'Falha ao enviar webhook de teste',
      status_code: statusCode
    });
  }
}));

export default router;
