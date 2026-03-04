import db from '../config/database';
import { logger } from '../config/logger';

export type EmailWebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.failed';

interface EmailWebhookRow {
  id: number;
  user_id: number;
  from_email: string;
  to_email: string;
  subject: string;
  status: string;
  template_id?: number | null;
  message_id?: string | null;
  tracking_id?: string | null;
  error_message?: string | null;
  metadata?: unknown;
  created_at?: Date | string | null;
  sent_at?: Date | string | null;
  delivered_at?: Date | string | null;
}

interface EmitOverrides {
  link_url?: string | null;
  error_message?: string | null;
  accepted_by_server?: boolean;
  source?: string;
  domain?: string;
  triggered_by?: 'jwt' | 'api_key' | 'system';
}

class EmailWebhookEventService {
  private async getWebhookService() {
    const module = await import('./webhookService');
    return module.webhookService;
  }

  async emitByMessageId(
    event: EmailWebhookEventType,
    messageId: string,
    overrides: EmitOverrides = {}
  ): Promise<void> {
    const email = await db('emails')
      .select(
        'id',
        'user_id',
        'from_email',
        'to_email',
        'subject',
        'status',
        'template_id',
        'message_id',
        'tracking_id',
        'error_message',
        'metadata',
        'created_at',
        'sent_at',
        'delivered_at'
      )
      .where('message_id', messageId)
      .first() as EmailWebhookRow | undefined;

    if (!email) {
      logger.warn('Skipping email webhook event because the email row was not found', {
        event,
        messageId
      });
      return;
    }

    await this.emitForEmail(event, email, overrides);
  }

  async emitForEmail(
    event: EmailWebhookEventType,
    email: EmailWebhookRow,
    overrides: EmitOverrides = {}
  ): Promise<void> {
    try {
      const webhookService = await this.getWebhookService();
      const metadata = typeof email.metadata === 'string'
        ? this.parseJsonField<Record<string, any>>(email.metadata, {})
        : (email.metadata as Record<string, any> | null) || {};

      await webhookService.sendWebhook(
        event,
        {
          email_id: email.id,
          message_id: email.message_id || null,
          tracking_id: email.tracking_id || null,
          from: email.from_email,
          to: email.to_email,
          subject: email.subject,
          status: email.status,
          template_id: email.template_id || null,
          template_data: metadata.template_data || null,
          error_message: overrides.error_message ?? email.error_message ?? null,
          link_url: overrides.link_url ?? null,
          accepted_by_server: overrides.accepted_by_server ?? ['delivered', 'opened', 'clicked'].includes(email.status),
          source: overrides.source || 'email_pipeline',
          domain: overrides.domain || this.extractDomain(email.from_email),
          triggered_by: overrides.triggered_by || 'system',
          occurred_at: new Date().toISOString(),
          created_at: email.created_at || null,
          sent_at: email.sent_at || null,
          delivered_at: email.delivered_at || null
        },
        email.user_id
      );
    } catch (error) {
      logger.error('Failed to dispatch email webhook event', {
        event,
        emailId: email.id,
        userId: email.user_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private parseJsonField<T>(value: unknown, fallback: T): T {
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
  }

  private extractDomain(emailAddress: string): string | null {
    const [, domain] = emailAddress.split('@');
    return domain || null;
  }
}

export const emailWebhookEventService = new EmailWebhookEventService();
