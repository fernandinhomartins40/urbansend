import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { SmtpConnectionService } from '../services/SmtpConnectionService';

const router = Router();
router.use(authenticateJWT);

// SMTP Connection Service instance
const smtpConnectionService = new SmtpConnectionService();

/**
 * Get SMTP connection statistics
 */
router.get('/stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { timeframe = '24h' } = req.query;
    const stats = await smtpConnectionService.getConnectionStats(timeframe as string);
    
    res.json({
      success: true,
      data: stats,
      timeframe
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get connection statistics'
    });
  }
}));

/**
 * Get active SMTP connections
 */
router.get('/active', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeConnections = await smtpConnectionService.getActiveConnections();
    
    res.json({
      success: true,
      data: {
        connections: activeConnections,
        total: activeConnections.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get active connections'
    });
  }
}));

/**
 * Get connection trends over time
 */
router.get('/trends', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const trends = await smtpConnectionService.getConnectionTrends(Number(days));
    
    res.json({
      success: true,
      data: trends,
      period: {
        days: Number(days),
        endDate: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get connection trends'
    });
  }
}));

/**
 * Get top connecting hosts
 */
router.get('/top-hosts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { limit = 10, timeframe = '24h' } = req.query;
    const topHosts = await smtpConnectionService.getTopHosts(
      Number(limit), 
      timeframe as string
    );
    
    res.json({
      success: true,
      data: topHosts,
      limit: Number(limit),
      timeframe
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get top hosts'
    });
  }
}));

/**
 * Record a new connection (for testing/manual entry)
 */
router.post('/record', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { remoteAddress, hostname, serverType, status, metadata } = req.body;
    
    if (!remoteAddress || !serverType || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: remoteAddress, serverType, status'
      });
    }

    await smtpConnectionService.recordConnection(
      remoteAddress,
      hostname || 'unknown',
      serverType,
      status,
      metadata
    );
    
    res.json({
      success: true,
      message: 'Connection recorded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to record connection'
    });
  }
}));

export default router;