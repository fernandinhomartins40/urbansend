import { logger } from '../config/logger';
import db from '../config/database';
import { classifyBounce, getBounceCategory } from '../utils/email';

export interface SuppressionRecord {
  id?: number;
  user_id: number | null;
  email: string;
  type: 'bounce' | 'complaint' | 'manual' | 'global';
  bounce_type?: 'hard' | 'soft' | 'block';
  reason?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export interface SuppressionStats {
  total: number;
  by_type: Record<string, number>;
  by_bounce_type: Record<string, number>;
  recent_additions: number;
}

class SuppressionService {
  
  /**
   * Add email to suppression list
   */
  async addToSuppression(
    email: string, 
    type: 'bounce' | 'complaint' | 'manual' | 'global', 
    reason?: string, 
    userId?: number,
    metadata?: any
  ): Promise<void> {
    try {
      const record: Partial<SuppressionRecord> = {
        user_id: userId || null,
        email: email.toLowerCase(),
        type,
        reason,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: new Date(),
        updated_at: new Date()
      };

      // If it's a bounce, classify the bounce type
      if (type === 'bounce' && reason) {
        record.bounce_type = classifyBounce(reason);
      }

      await db('suppression_lists')
        .insert(record)
        .onConflict(['user_id', 'email'])
        .merge(['type', 'bounce_type', 'reason', 'metadata', 'updated_at']);

      logger.info('Email added to suppression list', {
        email,
        type,
        bounce_type: record.bounce_type,
        userId,
        reason
      });

    } catch (error) {
      logger.error('Failed to add email to suppression list', {
        email,
        type,
        userId,
        error
      });
      throw error;
    }
  }

  /**
   * Check if email is suppressed
   */
  async isSuppressed(email: string, userId?: number): Promise<boolean> {
    try {
      const suppressed = await db('suppression_lists')
        .where('email', email.toLowerCase())
        .where(function() {
          if (userId) {
            this.where('user_id', userId).orWhereNull('user_id');
          } else {
            this.whereNull('user_id');
          }
        })
        .first();

      return !!suppressed;
    } catch (error) {
      logger.error('Failed to check suppression status', { email, userId, error });
      return false; // Fail safe - don't block emails on error
    }
  }

  /**
   * Get suppression record for email
   */
  async getSuppressionRecord(email: string, userId?: number): Promise<SuppressionRecord | null> {
    try {
      const record = await db('suppression_lists')
        .where('email', email.toLowerCase())
        .where(function() {
          if (userId) {
            this.where('user_id', userId).orWhereNull('user_id');
          } else {
            this.whereNull('user_id');
          }
        })
        .orderBy('updated_at', 'desc')
        .first();

      if (!record) return null;

      return {
        ...record,
        metadata: record.metadata ? JSON.parse(record.metadata) : null
      };
    } catch (error) {
      logger.error('Failed to get suppression record', { email, userId, error });
      return null;
    }
  }

  /**
   * Remove email from suppression list
   */
  async removeFromSuppression(email: string, userId?: number): Promise<boolean> {
    try {
      const result = await db('suppression_lists')
        .where('email', email.toLowerCase())
        .where(function() {
          if (userId) {
            this.where('user_id', userId);
          } else {
            this.whereNull('user_id');
          }
        })
        .del();

      const removed = result > 0;
      
      if (removed) {
        logger.info('Email removed from suppression list', { email, userId });
      }

      return removed;
    } catch (error) {
      logger.error('Failed to remove email from suppression list', { email, userId, error });
      return false;
    }
  }

  /**
   * Process bounce and add to suppression if needed
   */
  async processBounce(email: string, bounceReason: string, userId?: number): Promise<void> {
    try {
      const bounceType = classifyBounce(bounceReason);
      const bounceCategory = getBounceCategory(bounceReason);

      // Only suppress hard bounces and blocks
      if (bounceType === 'hard' || bounceType === 'block') {
        await this.addToSuppression(
          email,
          'bounce',
          bounceReason,
          userId,
          {
            bounce_type: bounceType,
            category: bounceCategory.category,
            severity: bounceCategory.severity,
            action: bounceCategory.action
          }
        );

        logger.info('Email suppressed due to bounce', {
          email,
          bounceType,
          category: bounceCategory.category,
          severity: bounceCategory.severity,
          userId
        });
      } else {
        // For soft bounces, just log but don't suppress
        logger.info('Soft bounce recorded, not suppressing', {
          email,
          bounceType,
          bounceReason,
          userId
        });
      }
    } catch (error) {
      logger.error('Failed to process bounce', { email, bounceReason, userId, error });
      throw error;
    }
  }

  /**
   * Get suppression statistics
   */
  async getSuppressionStats(userId?: number): Promise<SuppressionStats> {
    try {
      const query = db('suppression_lists').select('*');
      
      if (userId) {
        query.where('user_id', userId);
      }

      const records = await query;

      const stats: SuppressionStats = {
        total: records.length,
        by_type: {},
        by_bounce_type: {},
        recent_additions: 0
      };

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      records.forEach(record => {
        // Count by type
        stats.by_type[record.type] = (stats.by_type[record.type] || 0) + 1;

        // Count by bounce type
        if (record.bounce_type) {
          stats.by_bounce_type[record.bounce_type] = (stats.by_bounce_type[record.bounce_type] || 0) + 1;
        }

        // Count recent additions
        if (record.created_at && new Date(record.created_at) > oneWeekAgo) {
          stats.recent_additions++;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get suppression stats', { userId, error });
      throw error;
    }
  }

  /**
   * Get paginated suppression list
   */
  async getSuppressionList(
    userId?: number,
    page: number = 1,
    limit: number = 50,
    type?: string
  ): Promise<{
    data: SuppressionRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      let query = db('suppression_lists')
        .select('*')
        .orderBy('updated_at', 'desc');

      if (userId) {
        query = query.where('user_id', userId);
      }

      if (type) {
        query = query.where('type', type);
      }

      const total = await query.clone().count('* as count').first();
      const totalCount = Number(total?.count || 0);

      const offset = (page - 1) * limit;
      const records = await query.offset(offset).limit(limit);

      return {
        data: records.map(record => ({
          ...record,
          metadata: record.metadata ? JSON.parse(record.metadata) : null
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get suppression list', { userId, page, limit, type, error });
      throw error;
    }
  }

  /**
   * Bulk suppress emails
   */
  async bulkSuppress(
    emails: string[],
    type: 'bounce' | 'complaint' | 'manual' | 'global',
    reason?: string,
    userId?: number
  ): Promise<{ success: number; failed: number }> {
    const results = { success: 0, failed: 0 };

    for (const email of emails) {
      try {
        await this.addToSuppression(email, type, reason, userId);
        results.success++;
      } catch (error) {
        logger.error('Failed to suppress email in bulk operation', { email, error });
        results.failed++;
      }
    }

    logger.info('Bulk suppression completed', {
      total: emails.length,
      success: results.success,
      failed: results.failed,
      type,
      userId
    });

    return results;
  }

  /**
   * Clean old suppression records (soft bounces older than 30 days)
   */
  async cleanOldSuppressions(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedCount = await db('suppression_lists')
        .where('type', 'bounce')
        .where('bounce_type', 'soft')
        .where('created_at', '<', thirtyDaysAgo)
        .del();

      if (deletedCount > 0) {
        logger.info('Cleaned old soft bounce suppressions', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to clean old suppressions', { error });
      return 0;
    }
  }
}

export default SuppressionService;