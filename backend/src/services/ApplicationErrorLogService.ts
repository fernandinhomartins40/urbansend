import { Request } from 'express';
import db from '../config/database';
import { Env } from '../utils/env';

type LogSource = 'backend' | 'frontend';

interface PersistedApplicationErrorLog {
  id: number;
  source: LogSource;
  level: string;
  environment: string;
  service: string;
  message: string;
  error_name?: string | null;
  stack?: string | null;
  error_code?: string | null;
  request_id?: string | null;
  correlation_id?: string | null;
  user_id?: number | null;
  session_id?: string | null;
  method?: string | null;
  path?: string | null;
  url?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  status_code?: number | null;
  component?: string | null;
  metadata?: string | Record<string, unknown> | null;
  created_at: Date | string;
}

export interface ApplicationErrorLog {
  id: number;
  source: LogSource;
  level: string;
  environment: string;
  service: string;
  message: string;
  errorName?: string;
  stack?: string;
  errorCode?: string;
  requestId?: string;
  correlationId?: string;
  userId?: number;
  sessionId?: string;
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  statusCode?: number;
  component?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface FrontendErrorPayload {
  type: 'react_error' | 'window_error' | 'unhandled_rejection' | 'api_error';
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  route?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  sessionId?: string;
  statusCode?: number;
  component?: string;
  metadata?: Record<string, unknown>;
}

export interface ApplicationErrorLogFilters {
  limit?: number;
  offset?: number;
  source?: LogSource;
  level?: string;
  requestId?: string;
  correlationId?: string;
  search?: string;
  userId?: number;
}

export class ApplicationErrorLogService {
  private static instance: ApplicationErrorLogService;
  private readonly tableName = 'application_error_logs';

  public static getInstance(): ApplicationErrorLogService {
    if (!ApplicationErrorLogService.instance) {
      ApplicationErrorLogService.instance = new ApplicationErrorLogService();
    }

    return ApplicationErrorLogService.instance;
  }

  private safeString(value: unknown, maxLength: number): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
      return null;
    }

    return stringValue.length > maxLength
      ? stringValue.slice(0, maxLength)
      : stringValue;
  }

  private serializeMetadata(metadata?: Record<string, unknown>): string | null {
    if (!metadata || Object.keys(metadata).length === 0) {
      return null;
    }

    try {
      return JSON.stringify(metadata);
    } catch {
      return JSON.stringify({ serializationError: true });
    }
  }

  private parseMetadata(metadata: PersistedApplicationErrorLog['metadata']): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }

    if (typeof metadata === 'object') {
      return metadata as Record<string, unknown>;
    }

    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return { raw: metadata };
    }
  }

  private mapRow(row: PersistedApplicationErrorLog): ApplicationErrorLog {
    return {
      id: row.id,
      source: row.source,
      level: row.level,
      environment: row.environment,
      service: row.service,
      message: row.message,
      errorName: row.error_name || undefined,
      stack: row.stack || undefined,
      errorCode: row.error_code || undefined,
      requestId: row.request_id || undefined,
      correlationId: row.correlation_id || undefined,
      userId: row.user_id || undefined,
      sessionId: row.session_id || undefined,
      method: row.method || undefined,
      path: row.path || undefined,
      url: row.url || undefined,
      ip: row.ip || undefined,
      userAgent: row.user_agent || undefined,
      statusCode: row.status_code || undefined,
      component: row.component || undefined,
      metadata: this.parseMetadata(row.metadata),
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  private async persist(entry: Record<string, unknown>): Promise<void> {
    try {
      await db(this.tableName).insert(entry);
    } catch (error) {
      console.error('Failed to persist application error log', error);
    }
  }

  public async captureBackendError(options: {
    error: Error;
    req?: Request;
    statusCode?: number;
    context?: Record<string, unknown>;
    level?: string;
  }): Promise<void> {
    const { error, req, statusCode, context, level = 'error' } = options;

    await this.persist({
      source: 'backend',
      level,
      environment: Env.get('NODE_ENV', 'development'),
      service: 'ultrazend-backend',
      message: this.safeString(error.message, 5000),
      error_name: this.safeString(error.name, 255),
      stack: this.safeString(error.stack, 50000),
      error_code: this.safeString((error as Error & { code?: unknown }).code, 100),
      request_id: this.safeString(req?.requestId, 100),
      correlation_id: this.safeString(req?.correlationId, 100),
      user_id: req?.user?.id || null,
      session_id: null,
      method: this.safeString(req?.method, 16),
      path: this.safeString(req?.path, 500),
      url: this.safeString(req?.originalUrl || req?.url, 2000),
      ip: this.safeString(req?.ip, 100),
      user_agent: this.safeString(req?.get('User-Agent'), 1000),
      status_code: statusCode || null,
      component: null,
      metadata: this.serializeMetadata(context),
      created_at: new Date()
    });
  }

  public async captureFrontendError(payload: FrontendErrorPayload, req?: Request): Promise<void> {
    const metadata = {
      type: payload.type,
      componentStack: payload.componentStack,
      ...(payload.metadata || {})
    };

    await this.persist({
      source: 'frontend',
      level: 'error',
      environment: Env.get('NODE_ENV', 'development'),
      service: 'ultrazend-frontend',
      message: this.safeString(payload.message, 5000),
      error_name: this.safeString(payload.name, 255),
      stack: this.safeString(payload.stack, 50000),
      error_code: null,
      request_id: this.safeString(payload.requestId || req?.requestId, 100),
      correlation_id: this.safeString(payload.correlationId || req?.correlationId, 100),
      user_id: req?.user?.id || null,
      session_id: this.safeString(payload.sessionId, 150),
      method: req ? this.safeString(req.method, 16) : null,
      path: this.safeString(payload.route || req?.path, 500),
      url: this.safeString(payload.url || req?.originalUrl || req?.url, 2000),
      ip: this.safeString(req?.ip, 100),
      user_agent: this.safeString(payload.userAgent || req?.get('User-Agent'), 1000),
      status_code: payload.statusCode || null,
      component: this.safeString(payload.component, 255),
      metadata: this.serializeMetadata(metadata),
      created_at: new Date()
    });
  }

  public async listLogs(filters: ApplicationErrorLogFilters = {}): Promise<ApplicationErrorLog[]> {
    const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
    const offset = Math.max(filters.offset || 0, 0);
    let query = db(this.tableName)
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (filters.source) {
      query = query.where('source', filters.source);
    }

    if (filters.level) {
      query = query.where('level', filters.level);
    }

    if (filters.requestId) {
      query = query.where('request_id', filters.requestId);
    }

    if (filters.correlationId) {
      query = query.where('correlation_id', filters.correlationId);
    }

    if (typeof filters.userId === 'number') {
      query = query.where('user_id', filters.userId);
    }

    if (filters.search) {
      query = query.where((builder) => {
        builder
          .whereILike('message', `%${filters.search}%`)
          .orWhereILike('error_name', `%${filters.search}%`)
          .orWhereILike('path', `%${filters.search}%`)
          .orWhereILike('component', `%${filters.search}%`);
      });
    }

    const rows = await query as PersistedApplicationErrorLog[];
    return rows.map((row) => this.mapRow(row));
  }
}

export const applicationErrorLogService = ApplicationErrorLogService.getInstance();
