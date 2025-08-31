import Queue from 'bull';
import Redis from 'ioredis';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import emailService from './emailService';
import webhookService from './webhookService';

// Redis connection
const redisConnectionConfig = {
  host: Env.get('REDIS_HOST', 'localhost'),
  port: Env.getNumber('REDIS_PORT', 6379),
  db: Env.getNumber('REDIS_DB', 0),
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  ...(Env.get('REDIS_PASSWORD') && { password: Env.get('REDIS_PASSWORD') })
};

const redis = new Redis(redisConnectionConfig);

// Queue instances
const redisConfig = {
  host: Env.get('REDIS_HOST', 'localhost'),
  port: Env.getNumber('REDIS_PORT', 6379),
  db: Env.getNumber('REDIS_DB', 0),
  ...(Env.get('REDIS_PASSWORD') && { password: Env.get('REDIS_PASSWORD') })
};

export const emailQueue = new Queue('email processing', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const webhookQueue = new Queue('webhook processing', {
  redis: {
    host: Env.get('REDIS_HOST', 'localhost'),
    port: Env.getNumber('REDIS_PORT', 6379),
    db: Env.getNumber('REDIS_DB', 0),
    ...(Env.get('REDIS_PASSWORD') && { password: Env.get('REDIS_PASSWORD') })
  },
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const analyticsQueue = new Queue('analytics processing', {
  redis: {
    host: Env.get('REDIS_HOST', 'localhost'),
    port: Env.getNumber('REDIS_PORT', 6379),
    db: Env.getNumber('REDIS_DB', 0),
    ...(Env.get('REDIS_PASSWORD') && { password: Env.get('REDIS_PASSWORD') })
  },
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 50,
    attempts: 2,
    delay: 1000,
  },
});

// Job interfaces
interface EmailJob {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: any[];
  template_id?: number;
  variables?: Record<string, any>;
  tracking?: boolean;
  userId: number;
  apiKeyId?: number;
  priority?: number;
}

interface WebhookJob {
  webhookId: number;
  event: string;
  payload: any;
  attempt?: number;
}

interface AnalyticsJob {
  emailId: number;
  eventType: string;
  data: any;
}

// Email Queue Processors
emailQueue.process('send-email', 10, async (job) => {
  const { data }: { data: EmailJob } = job;
  
  try {
    logger.info('Processing email job', { jobId: job.id });
    
    const result = await emailService.sendEmail(data);
    
    // Trigger webhook if email sent successfully
    await webhookQueue.add('email-sent', {
      emailId: result.emailId,
      event: 'email.sent',
      payload: {
        messageId: result.messageId,
        to: data.to,
        subject: data.subject,
        sentAt: new Date().toISOString()
      }
    });
    
    return result;
  } catch (error) {
    logger.error('Email job failed', { 
      jobId: job.id, 
      error: error instanceof Error ? error.message : error 
    });
    throw error;
  }
});

emailQueue.process('send-batch-emails', 5, async (job) => {
  const { emails }: { emails: EmailJob[] } = job.data;
  
  try {
    logger.info('Processing batch email job', { jobId: job.id, count: emails.length });
    
    const results = await emailService.sendBatchEmails(emails);
    
    // Trigger webhooks for successful emails
    for (const result of results) {
      if (result.success && result.emailId) {
        await webhookQueue.add('email-sent', {
          emailId: result.emailId,
          event: 'email.sent',
          payload: {
            messageId: result.messageId,
            to: result.recipient,
            sentAt: new Date().toISOString()
          }
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Batch email job failed', { 
      jobId: job.id, 
      error: error instanceof Error ? error.message : error 
    });
    throw error;
  }
});

// Webhook Queue Processors
webhookQueue.process('email-sent', async (job) => {
  const { data }: { data: WebhookJob } = job;
  
  try {
    logger.info('Processing webhook job', { jobId: job.id, event: data.event });
    
    await webhookService.sendWebhook(data.event, data.payload);
    
    return { success: true };
  } catch (error) {
    logger.error('Webhook job failed', { 
      jobId: job.id, 
      error: error instanceof Error ? error.message : error 
    });
    throw error;
  }
});

webhookQueue.process('email-delivered', async (job) => {
  const { data }: { data: WebhookJob } = job;
  
  try {
    await webhookService.sendWebhook(data.event, data.payload);
    return { success: true };
  } catch (error) {
    logger.error('Webhook job failed', { jobId: job.id, error });
    throw error;
  }
});

webhookQueue.process('email-opened', async (job) => {
  const { data }: { data: WebhookJob } = job;
  
  try {
    await webhookService.sendWebhook(data.event, data.payload);
    return { success: true };
  } catch (error) {
    logger.error('Webhook job failed', { jobId: job.id, error });
    throw error;
  }
});

webhookQueue.process('email-clicked', async (job) => {
  const { data }: { data: WebhookJob } = job;
  
  try {
    await webhookService.sendWebhook(data.event, data.payload);
    return { success: true };
  } catch (error) {
    logger.error('Webhook job failed', { jobId: job.id, error });
    throw error;
  }
});

webhookQueue.process('email-bounced', async (job) => {
  const { data }: { data: WebhookJob } = job;
  
  try {
    await webhookService.sendWebhook(data.event, data.payload);
    return { success: true };
  } catch (error) {
    logger.error('Webhook job failed', { jobId: job.id, error });
    throw error;
  }
});

// Analytics Queue Processors
analyticsQueue.process('process-analytics', async (job) => {
  const { data }: { data: AnalyticsJob } = job;
  
  try {
    logger.info('Processing analytics job', { jobId: job.id, data });
    
    // Process analytics data here
    // This could involve aggregating data, updating metrics, etc.
    
    return { success: true };
  } catch (error) {
    logger.error('Analytics job failed', { jobId: job.id, error });
    throw error;
  }
});

// Queue event handlers
emailQueue.on('completed', (job, result) => {
  logger.info('Email job completed', { jobId: job.id, result });
});

emailQueue.on('failed', (job, err) => {
  logger.error('Email job failed', { jobId: job.id, error: err.message });
});

webhookQueue.on('completed', (job, result) => {
  logger.info('Webhook job completed', { jobId: job.id, result });
});

webhookQueue.on('failed', (job, err) => {
  logger.error('Webhook job failed', { jobId: job.id, error: err.message });
});

analyticsQueue.on('completed', (job) => {
  logger.info('Analytics job completed', { jobId: job.id });
});

analyticsQueue.on('failed', (job, err) => {
  logger.error('Analytics job failed', { jobId: job.id, error: err.message });
});

// Helper functions to add jobs to queues
export const addEmailJob = async (emailData: EmailJob, options?: any) => {
  const priority = emailData.priority || 0;
  return emailQueue.add('send-email', emailData, {
    priority,
    ...options
  });
};

export const addBatchEmailJob = async (emails: EmailJob[], options?: any) => {
  return emailQueue.add('send-batch-emails', { emails }, options);
};

export const addWebhookJob = async (event: string, payload: any, options?: any) => {
  return webhookQueue.add(event, { event, payload }, options);
};

export const addAnalyticsJob = async (data: AnalyticsJob, options?: any) => {
  return analyticsQueue.add('process-analytics', data, options);
};

// Queue monitoring and cleanup
export const getQueueStats = async () => {
  const [emailStats, webhookStats, analyticsStats] = await Promise.all([
    emailQueue.getJobCounts(),
    webhookQueue.getJobCounts(),
    analyticsQueue.getJobCounts()
  ]);

  return {
    email: emailStats,
    webhook: webhookStats,
    analytics: analyticsStats
  };
};

// Graceful shutdown
export const closeQueues = async () => {
  await Promise.all([
    emailQueue.close(),
    webhookQueue.close(),
    analyticsQueue.close(),
    redis.disconnect()
  ]);
  logger.info('All queues closed');
};

// Initialize queues
logger.info('Queue service initialized');

export default {
  emailQueue,
  webhookQueue,
  analyticsQueue,
  addEmailJob,
  addBatchEmailJob,
  addWebhookJob,
  addAnalyticsJob,
  getQueueStats,
  closeQueues
};