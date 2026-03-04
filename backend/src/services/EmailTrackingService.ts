import db from '../config/database';
import { logger } from '../config/logger';
import { emailWebhookEventService } from './EmailWebhookEventService';

interface TrackingContext {
  userAgent?: string;
  ipAddress?: string | null;
}

interface TrackingEventPayload {
  userId: number;
  emailId: number;
  eventType: 'open' | 'click' | 'delivered';
  recipientEmail: string;
  trackingId?: string | null;
  linkUrl?: string | null;
  userAgent?: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

interface EmailRow {
  id: number;
  user_id: number;
  from_email: string;
  to_email: string;
  subject: string;
  tracking_id?: string | null;
  status: string;
}

const insertTrackingEvent = async (trx: any, payload: TrackingEventPayload) => {
  await trx('email_analytics').insert({
    user_id: payload.userId,
    email_id: payload.emailId,
    event_type: payload.eventType,
    recipient_email: payload.recipientEmail,
    tracking_id: payload.trackingId || null,
    link_url: payload.linkUrl || null,
    user_agent: payload.userAgent || null,
    ip_address: payload.ipAddress || null,
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    created_at: new Date(),
    updated_at: new Date()
  });
};

export const resolveTrackingClientIp = (req: any): string => {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || req.ip || 'unknown';
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0]).trim() || req.ip || 'unknown';
  }

  return req.ip || req.connection?.remoteAddress || 'unknown';
};

export class EmailTrackingService {
  async trackOpenByTrackingId(trackingId: string, context: TrackingContext = {}): Promise<boolean> {
    try {
      const email = await db('emails')
        .where('tracking_id', trackingId)
        .first() as EmailRow | undefined;

      if (!email) {
        return false;
      }

      const ipAddress = context.ipAddress || 'unknown';
      let insertedOpenEvent = false;

      await db.transaction(async (trx) => {
        const existingOpen = await trx('email_analytics')
          .where('email_id', email.id)
          .whereIn('event_type', ['open', 'opened'])
          .where('ip_address', ipAddress)
          .first();

        if (existingOpen) {
          return;
        }

        const openedAt = new Date();
        const nextStatus = ['clicked', 'opened'].includes(email.status) ? email.status : 'opened';

        await trx('emails')
          .where('id', email.id)
          .update({
            status: nextStatus,
            updated_at: openedAt
          });

        await insertTrackingEvent(trx, {
          userId: email.user_id,
          emailId: email.id,
          eventType: 'open',
          recipientEmail: email.to_email,
          trackingId,
          userAgent: context.userAgent || 'unknown',
          ipAddress,
          metadata: {
            source: 'tracking_pixel',
            acceptedByServer: ['delivered', 'opened', 'clicked'].includes(email.status)
          }
        });
        insertedOpenEvent = true;
      });

      if (insertedOpenEvent) {
        await emailWebhookEventService.emitForEmail('email.opened', {
          id: email.id,
          user_id: email.user_id,
          from_email: email.from_email,
          to_email: email.to_email,
          subject: email.subject,
          status: 'opened',
          tracking_id: email.tracking_id || trackingId
        }, {
          accepted_by_server: ['delivered', 'opened', 'clicked'].includes(email.status),
          source: 'tracking_pixel'
        });
      }

      return true;
    } catch (error) {
      logger.error('Open tracking failed', {
        trackingId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async trackClickByTrackingId(
    trackingId: string,
    linkUrl?: string | null,
    context: TrackingContext = {}
  ): Promise<boolean> {
    try {
      const email = await db('emails')
        .where('tracking_id', trackingId)
        .first() as EmailRow | undefined;

      if (!email) {
        return false;
      }

      const ipAddress = context.ipAddress || 'unknown';
      const normalizedUrl = typeof linkUrl === 'string' ? linkUrl : null;
      let insertedClickEvent = false;

      await db.transaction(async (trx) => {
        const existingOpen = await trx('email_analytics')
          .where('email_id', email.id)
          .whereIn('event_type', ['open', 'opened'])
          .where('ip_address', ipAddress)
          .first();

        const existingClickQuery = trx('email_analytics')
          .where('email_id', email.id)
          .where('event_type', 'click')
          .where('ip_address', ipAddress);

        if (normalizedUrl) {
          existingClickQuery.where('link_url', normalizedUrl);
        } else {
          existingClickQuery.whereNull('link_url');
        }

        const existingClick = await existingClickQuery.first();
        const clickedAt = new Date();

        await trx('emails')
          .where('id', email.id)
          .update({
            status: 'clicked',
            updated_at: clickedAt
          });

        if (!existingOpen) {
          await insertTrackingEvent(trx, {
            userId: email.user_id,
            emailId: email.id,
            eventType: 'open',
            recipientEmail: email.to_email,
            trackingId,
            userAgent: context.userAgent || 'unknown',
            ipAddress,
            metadata: {
              source: 'tracked_link_inferred_open',
              acceptedByServer: ['delivered', 'opened', 'clicked'].includes(email.status)
            }
          });
        }

        if (existingClick) {
          return;
        }

        await insertTrackingEvent(trx, {
          userId: email.user_id,
          emailId: email.id,
          eventType: 'click',
          recipientEmail: email.to_email,
          trackingId,
          linkUrl: normalizedUrl,
          userAgent: context.userAgent || 'unknown',
          ipAddress,
          metadata: {
            source: 'tracked_link',
            acceptedByServer: ['delivered', 'opened', 'clicked'].includes(email.status)
          }
        });
        insertedClickEvent = true;
      });

      if (insertedClickEvent) {
        await emailWebhookEventService.emitForEmail('email.clicked', {
          id: email.id,
          user_id: email.user_id,
          from_email: email.from_email,
          to_email: email.to_email,
          subject: email.subject,
          status: 'clicked',
          tracking_id: email.tracking_id || trackingId
        }, {
          link_url: normalizedUrl,
          accepted_by_server: ['delivered', 'opened', 'clicked'].includes(email.status),
          source: 'tracked_link'
        });
      }

      return true;
    } catch (error) {
      logger.error('Click tracking failed', {
        trackingId,
        linkUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async recordDeliveredEventForMessage(
    messageId: string,
    trackingId: string,
    recipientEmail: string,
    userId: number
  ): Promise<void> {
    try {
      const email = await db('emails')
        .select('id')
        .where('message_id', messageId)
        .first();

      if (!email?.id) {
        logger.warn('Could not find email row to record delivered event', { messageId, userId });
        return;
      }

      const existingDeliveredEvent = await db('email_analytics')
        .where('email_id', email.id)
        .where('event_type', 'delivered')
        .first();

      if (existingDeliveredEvent) {
        return;
      }

      await db('email_analytics').insert({
        user_id: userId,
        email_id: email.id,
        event_type: 'delivered',
        recipient_email: recipientEmail,
        tracking_id: trackingId,
        metadata: JSON.stringify({
          source: 'smtp_acceptance',
          acceptedByServer: true
        }),
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to record delivered analytics event', {
        messageId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const emailTrackingService = new EmailTrackingService();
