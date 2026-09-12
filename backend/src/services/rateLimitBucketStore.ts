import db from '../config/database';

export interface SharedRateLimitResult {
  allowed: boolean;
  limit: number;
  used: number;
  resetTime: number;
  retryAfter?: number;
}

export async function consumeRateLimitBucket(
  bucketKey: string,
  max: number,
  windowMs: number
): Promise<SharedRateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);

  return db.transaction(async (trx) => {
    let query = trx('rate_limit_buckets').where('bucket_key', bucketKey);
    const client = String((trx as any).client?.config?.client || '').toLowerCase();
    if (client === 'pg' || client === 'postgres' || client === 'postgresql') {
      query = query.forUpdate();
    }

    const bucket = await query.first();
    if (!bucket || new Date(bucket.reset_at).getTime() <= now) {
      await trx('rate_limit_buckets')
        .insert({ bucket_key: bucketKey, count: 1, reset_at: resetAt, updated_at: new Date() })
        .onConflict('bucket_key')
        .merge({ count: 1, reset_at: resetAt, updated_at: new Date() });
      return { allowed: true, limit: max, used: 1, resetTime: resetAt.getTime() };
    }

    const used = Number(bucket.count || 0);
    const existingResetAt = new Date(bucket.reset_at).getTime();
    if (used >= max) {
      return { allowed: false, limit: max, used, resetTime: existingResetAt, retryAfter: Math.max(1, Math.ceil((existingResetAt - now) / 1000)) };
    }

    await trx('rate_limit_buckets').where('bucket_key', bucketKey).update({ count: used + 1, updated_at: new Date() });
    return { allowed: true, limit: max, used: used + 1, resetTime: existingResetAt };
  });
}
