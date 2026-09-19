import { afterAll } from '@jest/globals';
import { optimizedLogger } from '../config/optimizedLogger';
import db from '../config/database';
import { shutdownEmailMiddlewareHelpers } from '../middleware/emailMiddlewareHelpers';
import { rateLimiterInstance } from '../middleware/advancedRateLimiting';

afterAll(async () => {
  optimizedLogger.destroy();
  shutdownEmailMiddlewareHelpers();
  rateLimiterInstance.destroy();
  await db.destroy();
});
