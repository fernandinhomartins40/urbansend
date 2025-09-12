import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { dkimHealthChecker } from '../services/DKIMHealthChecker';
import { dkimMigrationService } from '../services/DKIMMigrationService';
import { environmentValidator } from '../utils/environmentValidator';
import { z } from 'zod';

/**
 * Professional DKIM Administration Routes
 * 
 * Provides secure API endpoints for DKIM system management
 * Requires admin authentication and comprehensive logging
 * Includes health monitoring, migration tools, and system diagnostics
 */

const router = Router();

// Apply authentication to all routes
router.use(authenticateJWT);

// Middleware to check admin privileges
const requireAdmin = asyncHandler(async (req: AuthenticatedRequest, res: Response, next) => {
  // Check if user is admin (you may need to adjust this based on your user model)
  const user = req.user;
  
  // For now, checking if user exists and has admin role
  // You may need to adjust this based on your actual user schema
  if (!user || !user.is_admin) {
    logger.warn('Unauthorized admin DKIM access attempt', {
      userId: user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: req.path
    });

    return res.status(403).json({
      success: false,
      error: 'Admin privileges required',
      code: 'ADMIN_REQUIRED'
    });
  }

  logger.info('Admin DKIM access authorized', {
    adminId: user.id,
    adminEmail: user.email,
    endpoint: req.path,
    ip: req.ip
  });

  next();
});

// Validation schemas
const domainSchema = z.object({
  domain: z.string()
    .min(3, 'Domain must be at least 3 characters')
    .max(253, 'Domain must be less than 253 characters')
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/, 'Invalid domain format')
});

const migrationOptionsSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
  domain: z.string().optional()
});

/**
 * GET /api/admin/dkim/health
 * Comprehensive DKIM system health check
 */
router.get('/health', 
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { domain, export: exportReport } = req.query;
    
    logger.info('Admin DKIM health check initiated', {
      adminId: req.user!.id,
      specificDomain: domain,
      exportRequested: !!exportReport
    });

    try {
      if (domain) {
        // Check specific domain
        const domainHealth = await dkimHealthChecker.checkDomainHealth(domain as string);
        
        if (!domainHealth) {
          return res.status(404).json({
            success: false,
            error: `Domain not found: ${domain}`,
            code: 'DOMAIN_NOT_FOUND'
          });
        }

        return res.json({
          success: true,
          data: {
            domain: domainHealth,
            checkedAt: new Date().toISOString()
          }
        });
      }

      // Full system health check
      const healthReport = await dkimHealthChecker.performFullHealthCheck();

      const response = {
        success: true,
        data: {
          report: {
            timestamp: healthReport.timestamp,
            systemStatus: healthReport.systemStatus,
            summary: {
              totalDomains: healthReport.totalDomains,
              healthyDomains: healthReport.healthyDomains,
              unhealthyDomains: healthReport.unhealthyDomains,
              criticalIssues: healthReport.criticalIssues
            },
            criticalDomains: healthReport.summary.critical.map(d => ({
              domainId: d.domainId,
              domainName: d.domainName,
              userId: d.userId,
              issues: d.issues
            })),
            recommendations: healthReport.recommendations
          }
        }
      };

      // Export if requested
      if (exportReport) {
        const exportData = await dkimHealthChecker.exportHealthReport();
        response.data['exportData'] = JSON.parse(exportData);
      }

      logger.info('Admin DKIM health check completed', {
        adminId: req.user!.id,
        totalDomains: healthReport.totalDomains,
        criticalIssues: healthReport.criticalIssues,
        systemStatus: healthReport.systemStatus
      });

      res.json(response);

    } catch (error) {
      logger.error('Admin DKIM health check failed', {
        adminId: req.user!.id,
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform health check',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  })
);

/**
 * POST /api/admin/dkim/migrate
 * DKIM migration for fixing issues
 */
router.post('/migrate',
  requireAdmin,
  validateRequest({ body: migrationOptionsSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { dryRun, force, domain } = req.body;
    
    logger.info('Admin DKIM migration initiated', {
      adminId: req.user!.id,
      dryRun,
      force,
      specificDomain: domain,
      ip: req.ip
    });

    try {
      let migrationResult;

      if (domain) {
        // Migrate specific domain
        const result = await dkimMigrationService.migrateDomain(domain, dryRun);
        
        if (!result) {
          return res.status(404).json({
            success: false,
            error: `Domain not found: ${domain}`,
            code: 'DOMAIN_NOT_FOUND'
          });
        }

        migrationResult = {
          success: result.status === 'SUCCESS',
          domain: result,
          summary: {
            processed: 1,
            successful: result.status === 'SUCCESS' ? 1 : 0,
            failed: result.status === 'FAILED' ? 1 : 0
          }
        };
      } else {
        // Migrate all domains
        migrationResult = await dkimMigrationService.migrateAllDomains(dryRun, force);
      }

      logger.info('Admin DKIM migration completed', {
        adminId: req.user!.id,
        success: migrationResult.success,
        processed: migrationResult.processed || migrationResult.summary?.processed,
        successful: migrationResult.successful || migrationResult.summary?.successful,
        failed: migrationResult.failed || migrationResult.summary?.failed,
        dryRun
      });

      res.json({
        success: true,
        data: {
          migration: migrationResult,
          executedAt: new Date().toISOString(),
          dryRun
        }
      });

    } catch (error) {
      logger.error('Admin DKIM migration failed', {
        adminId: req.user!.id,
        error: error instanceof Error ? error.message : String(error),
        dryRun,
        force,
        domain
      });

      res.status(500).json({
        success: false,
        error: 'Migration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'MIGRATION_FAILED'
      });
    }
  })
);

/**
 * POST /api/admin/dkim/fix-domain
 * Quick fix for specific domain
 */
router.post('/fix-domain',
  requireAdmin,
  validateRequest({ body: domainSchema }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { domain } = req.body;
    
    logger.info('Admin DKIM domain fix initiated', {
      adminId: req.user!.id,
      domain,
      ip: req.ip
    });

    try {
      // First check domain health
      const domainHealth = await dkimHealthChecker.checkDomainHealth(domain);
      
      if (!domainHealth) {
        return res.status(404).json({
          success: false,
          error: `Domain not found: ${domain}`,
          code: 'DOMAIN_NOT_FOUND'
        });
      }

      if (domainHealth.status === 'HEALTHY') {
        return res.json({
          success: true,
          data: {
            message: `Domain ${domain} is already healthy`,
            status: 'NO_ACTION_NEEDED',
            health: domainHealth
          }
        });
      }

      // Perform migration to fix issues
      const migrationResult = await dkimMigrationService.migrateDomain(domain, false);

      if (!migrationResult) {
        throw new Error('Migration result is null');
      }

      logger.info('Admin DKIM domain fix completed', {
        adminId: req.user!.id,
        domain,
        success: migrationResult.status === 'SUCCESS',
        action: migrationResult.action,
        duration: migrationResult.durationMs
      });

      res.json({
        success: migrationResult.status === 'SUCCESS',
        data: {
          domain,
          result: migrationResult,
          beforeHealth: domainHealth,
          fixedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Admin DKIM domain fix failed', {
        adminId: req.user!.id,
        domain,
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Domain fix failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'DOMAIN_FIX_FAILED'
      });
    }
  })
);

/**
 * GET /api/admin/dkim/environment
 * Environment configuration validation
 */
router.get('/environment',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    logger.info('Admin environment validation requested', {
      adminId: req.user!.id,
      ip: req.ip
    });

    try {
      const validationResult = await environmentValidator.validateEnvironment();
      const report = environmentValidator.generateReport(validationResult);

      logger.info('Admin environment validation completed', {
        adminId: req.user!.id,
        isValid: validationResult.isValid,
        environment: validationResult.environment,
        issuesCount: validationResult.issues.length,
        criticalErrorsCount: validationResult.criticalErrors.length
      });

      res.json({
        success: true,
        data: {
          validation: validationResult,
          report,
          validatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Admin environment validation failed', {
        adminId: req.user!.id,
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Environment validation failed',
        code: 'VALIDATION_FAILED'
      });
    }
  })
);

/**
 * GET /api/admin/dkim/stats
 * System statistics and metrics
 */
router.get('/stats',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    logger.info('Admin DKIM stats requested', {
      adminId: req.user!.id
    });

    try {
      // Get health report for stats
      const healthReport = await dkimHealthChecker.performFullHealthCheck();
      
      // Calculate additional metrics
      const criticalDomains = healthReport.summary.critical.length;
      const unhealthyDomains = healthReport.summary.unhealthy.length;
      const healthPercentage = Math.round((healthReport.healthyDomains / healthReport.totalDomains) * 100);
      
      // Group issues by type
      const allIssues = [
        ...healthReport.summary.critical.flatMap(d => d.issues),
        ...healthReport.summary.unhealthy.flatMap(d => d.issues)
      ];
      
      const issuesByType = allIssues.reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const issuesBySeverity = allIssues.reduce((acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        system: {
          status: healthReport.systemStatus,
          healthPercentage,
          lastCheck: healthReport.timestamp
        },
        domains: {
          total: healthReport.totalDomains,
          healthy: healthReport.healthyDomains,
          unhealthy: unhealthyDomains,
          critical: criticalDomains
        },
        issues: {
          total: allIssues.length,
          byType: issuesByType,
          bySeverity: issuesBySeverity
        },
        recommendations: {
          count: healthReport.recommendations.length,
          urgent: healthReport.recommendations.filter(r => r.includes('CRITICAL')).length
        }
      };

      logger.info('Admin DKIM stats generated', {
        adminId: req.user!.id,
        totalDomains: stats.domains.total,
        healthPercentage: stats.system.healthPercentage,
        totalIssues: stats.issues.total
      });

      res.json({
        success: true,
        data: {
          stats,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Admin DKIM stats failed', {
        adminId: req.user!.id,
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate stats',
        code: 'STATS_FAILED'
      });
    }
  })
);

export default router;