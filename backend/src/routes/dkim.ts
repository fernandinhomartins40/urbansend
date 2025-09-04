import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { DKIMManager } from '../services/dkimManager';

const router = Router();
router.use(authenticateJWT);

// DKIM Manager instance
const dkimManager = new DKIMManager();

/**
 * Get DKIM statistics for the authenticated user
 */
router.get('/stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await dkimManager.getDKIMStats(userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get DKIM statistics'
    });
  }
}));

/**
 * Store a new DKIM key for a domain
 */
router.post('/keys', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domain, selector, privateKey, publicKey } = req.body;
    
    if (!domain || !selector || !privateKey || !publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: domain, selector, privateKey, publicKey'
      });
    }

    await dkimManager.storeDKIMKey(domain, selector, privateKey, publicKey);
    
    res.json({
      success: true,
      message: 'DKIM key stored successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to store DKIM key'
    });
  }
}));

/**
 * Rotate DKIM key for a domain
 */
router.post('/rotate/:domain', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domain } = req.params;
    
    const result = await dkimManager.rotateDKIMKey(domain);
    
    res.json({
      success: true,
      data: result,
      message: 'DKIM key rotated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to rotate DKIM key'
    });
  }
}));

export default router;