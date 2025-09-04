import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { EmailAnalyticsService } from '../services/EmailAnalyticsService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const analyticsService = new EmailAnalyticsService();

export class AnalyticsController {
  /**
   * Get comprehensive analytics overview for dashboard
   */
  static getOverview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { days = 30, startDate, endDate } = req.query;

      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate && endDate) {
        start = new Date(startDate as string);
        end = new Date(endDate as string);
      } else {
        start = new Date();
        start.setDate(start.getDate() - Number(days));
      }

      // Get comprehensive stats
      const [emailStats, deliveryStats, trends] = await Promise.all([
        analyticsService.getEmailStats(userId, start, end),
        analyticsService.getDeliveryStats(userId, start, end),
        analyticsService.getEngagementTrends(userId, Number(days))
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            ...emailStats,
            ...deliveryStats
          },
          trends,
          period: {
            startDate: start,
            endDate: end || new Date(),
            days: Number(days)
          }
        }
      });

      logger.info('Analytics overview generated', { userId, days });
    } catch (error) {
      logger.error('Failed to get analytics overview', { error, userId: req.user?.id });
      throw error;
    }
  });

  /**
   * Get detailed campaign metrics
   */
  static getCampaignMetrics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { campaignId } = req.params;

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          error: 'Campaign ID is required'
        });
      }

      const campaignMetrics = await analyticsService.getCampaignMetrics(campaignId, userId);
      
      res.json({
        success: true,
        data: campaignMetrics
      });

      logger.info('Campaign metrics retrieved', { userId, campaignId });
    } catch (error) {
      logger.error('Failed to get campaign metrics', { 
        error, 
        userId: req.user?.id, 
        campaignId: req.params.campaignId 
      });
      throw error;
    }
  });

  /**
   * Get engagement data with trends and geographic breakdown
   */
  static getEngagementData = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { days = 30, includeGeo = 'true' } = req.query;

      const [trends, geoStats] = await Promise.all([
        analyticsService.getEngagementTrends(userId, Number(days)),
        includeGeo === 'true' ? analyticsService.getGeographicStats(userId) : Promise.resolve([])
      ]);

      res.json({
        success: true,
        data: {
          trends,
          geographic: geoStats,
          period: {
            days: Number(days),
            endDate: new Date()
          }
        }
      });

      logger.info('Engagement data retrieved', { userId, days, includeGeo });
    } catch (error) {
      logger.error('Failed to get engagement data', { error, userId: req.user?.id });
      throw error;
    }
  });

  /**
   * Get detailed delivery statistics
   */
  static getDeliveryStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) start = new Date(startDate as string);
      if (endDate) end = new Date(endDate as string);

      const deliveryStats = await analyticsService.getDeliveryStats(userId, start, end);
      
      res.json({
        success: true,
        data: deliveryStats
      });

      logger.info('Delivery stats retrieved', { userId, startDate, endDate });
    } catch (error) {
      logger.error('Failed to get delivery stats', { error, userId: req.user?.id });
      throw error;
    }
  });

  /**
   * Get analytics by specific event type
   */
  static getEventAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { eventType } = req.params;
      const { startDate, endDate, limit = 100 } = req.query;

      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) start = new Date(startDate as string);
      if (endDate) end = new Date(endDate as string);

      const events = await analyticsService.getAnalyticsByEventType(
        userId, 
        eventType, 
        start, 
        end
      );

      // Apply limit
      const limitedEvents = events.slice(0, Number(limit));

      res.json({
        success: true,
        data: {
          eventType,
          events: limitedEvents,
          total: events.length,
          period: {
            startDate: start,
            endDate: end
          }
        }
      });

      logger.info('Event analytics retrieved', { userId, eventType, total: events.length });
    } catch (error) {
      logger.error('Failed to get event analytics', { 
        error, 
        userId: req.user?.id, 
        eventType: req.params.eventType 
      });
      throw error;
    }
  });

  /**
   * Get recent email activities
   */
  static getRecentActivity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { limit = 50 } = req.query;

      const activities = await analyticsService.getRecentActivities(userId, Number(limit));
      
      res.json({
        success: true,
        data: {
          activities,
          total: activities.length
        }
      });

      logger.info('Recent activities retrieved', { userId, total: activities.length });
    } catch (error) {
      logger.error('Failed to get recent activities', { error, userId: req.user?.id });
      throw error;
    }
  });
}