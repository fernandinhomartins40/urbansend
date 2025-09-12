#!/usr/bin/env ts-node

/**
 * Professional DKIM Fix Script
 * 
 * CLI tool to diagnose and fix DKIM issues in the UltraZend system
 * Usage: 
 *   npm run fix-dkim -- --help
 *   npm run fix-dkim -- --check
 *   npm run fix-dkim -- --fix --dry-run
 *   npm run fix-dkim -- --fix --domain=example.com
 *   npm run fix-dkim -- --migrate-all --force
 */

import { program } from 'commander';
import { logger } from '../config/logger';
import { dkimHealthChecker } from '../services/DKIMHealthChecker';
import { dkimMigrationService } from '../services/DKIMMigrationService';

// Configure CLI
program
  .name('fix-dkim-issues')
  .description('Professional DKIM diagnostic and repair tool for UltraZend')
  .version('1.0.0');

// Health check command
program
  .command('check')
  .description('Run comprehensive DKIM health check')
  .option('--export <file>', 'Export report to JSON file')
  .option('--domain <domain>', 'Check specific domain only')
  .action(async (options) => {
    try {
      console.log('🔍 Running DKIM Health Check...\n');

      if (options.domain) {
        // Check specific domain
        const domainHealth = await dkimHealthChecker.checkDomainHealth(options.domain);
        
        if (!domainHealth) {
          console.error(`❌ Domain not found: ${options.domain}`);
          process.exit(1);
        }

        console.log(`📊 Health Status for ${domainHealth.domainName}:`);
        console.log(`   Status: ${getStatusEmoji(domainHealth.status)} ${domainHealth.status}`);
        console.log(`   Issues: ${domainHealth.issues.length}`);
        
        if (domainHealth.issues.length > 0) {
          console.log('\n🔧 Issues Found:');
          domainHealth.issues.forEach((issue, i) => {
            console.log(`   ${i + 1}. [${issue.severity}] ${issue.description}`);
            console.log(`      → ${issue.recommendation}`);
          });
        }

      } else {
        // Full system health check
        const report = await dkimHealthChecker.performFullHealthCheck();
        
        console.log('📊 DKIM System Health Report:');
        console.log(`   Total Domains: ${report.totalDomains}`);
        console.log(`   Healthy: ${getStatusEmoji('HEALTHY')} ${report.healthyDomains}`);
        console.log(`   Warning: ${getStatusEmoji('WARNING')} ${report.unhealthyDomains}`);
        console.log(`   Critical: ${getStatusEmoji('CRITICAL')} ${report.criticalIssues}`);
        console.log(`   System Status: ${getStatusEmoji(report.systemStatus)} ${report.systemStatus}\n`);

        if (report.criticalIssues > 0) {
          console.log('🚨 Critical Issues:');
          report.summary.critical.forEach((domain, i) => {
            console.log(`   ${i + 1}. ${domain.domainName} (ID: ${domain.domainId})`);
            domain.issues.forEach(issue => {
              if (issue.severity === 'CRITICAL') {
                console.log(`      • ${issue.description}`);
              }
            });
          });
          console.log();
        }

        if (report.recommendations.length > 0) {
          console.log('💡 Recommendations:');
          report.recommendations.forEach((rec, i) => {
            console.log(`   ${i + 1}. ${rec}`);
          });
          console.log();
        }

        // Export if requested
        if (options.export) {
          const exportData = await dkimHealthChecker.exportHealthReport();
          const fs = await import('fs');
          fs.writeFileSync(options.export, exportData);
          console.log(`📄 Report exported to: ${options.export}`);
        }
      }

    } catch (error) {
      console.error('❌ Health check failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Migration command
program
  .command('migrate')
  .description('Migrate domains to fix DKIM issues')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--domain <domain>', 'Migrate specific domain only')
  .option('--force', 'Force regeneration even for healthy domains')
  .option('--export <file>', 'Export migration report to JSON file')
  .action(async (options) => {
    try {
      const isDryRun = options.dryRun;
      console.log(`🚀 Starting DKIM Migration ${isDryRun ? '(DRY RUN)' : '(LIVE)'}...\n`);

      if (options.domain) {
        // Migrate specific domain
        console.log(`🎯 Migrating domain: ${options.domain}`);
        
        const result = await dkimMigrationService.migrateDomain(options.domain, isDryRun);
        
        if (!result) {
          console.error(`❌ Domain not found: ${options.domain}`);
          process.exit(1);
        }

        console.log(`   Result: ${getStatusEmoji(result.status)} ${result.status}`);
        console.log(`   Action: ${result.action}`);
        console.log(`   Details: ${result.details}`);
        console.log(`   Duration: ${result.durationMs}ms`);

        if (result.error) {
          console.error(`   Error: ${result.error}`);
        }

      } else {
        // Migrate all domains
        const migrationResult = await dkimMigrationService.migrateAllDomains(isDryRun, options.force);
        
        console.log('📊 Migration Results:');
        console.log(`   Duration: ${migrationResult.duration}ms`);
        console.log(`   Total Domains: ${migrationResult.totalDomains}`);
        console.log(`   Processed: ${migrationResult.processed}`);
        console.log(`   Successful: ${getStatusEmoji('SUCCESS')} ${migrationResult.successful}`);
        console.log(`   Failed: ${getStatusEmoji('FAILED')} ${migrationResult.failed}`);
        console.log(`   Skipped: ⚪ ${migrationResult.skipped}`);
        console.log(`   Overall: ${getStatusEmoji(migrationResult.success ? 'SUCCESS' : 'FAILED')} ${migrationResult.success ? 'SUCCESS' : 'FAILED'}\n`);

        console.log('📈 Summary:');
        console.log(`   Critical Issues Fixed: ${migrationResult.summary.criticalIssuesFixed}`);
        console.log(`   New DKIM Keys Generated: ${migrationResult.summary.newDkimKeysGenerated}`);
        console.log(`   Corrupted Keys Replaced: ${migrationResult.summary.corruptedKeysReplaced}`);

        if (migrationResult.summary.errorsEncountered.length > 0) {
          console.log('\n❌ Errors Encountered:');
          migrationResult.summary.errorsEncountered.forEach((error, i) => {
            console.log(`   ${i + 1}. ${error}`);
          });
        }

        // Show failed domains
        const failedDomains = migrationResult.details.filter(d => d.status === 'FAILED');
        if (failedDomains.length > 0) {
          console.log('\n🚨 Failed Domains:');
          failedDomains.forEach((domain, i) => {
            console.log(`   ${i + 1}. ${domain.domainName} (ID: ${domain.domainId})`);
            console.log(`      Error: ${domain.error}`);
            console.log(`      Duration: ${domain.durationMs}ms`);
          });
        }

        // Export if requested
        if (options.export) {
          const exportData = await dkimMigrationService.exportMigrationReport(migrationResult);
          const fs = await import('fs');
          fs.writeFileSync(options.export, exportData);
          console.log(`📄 Migration report exported to: ${options.export}`);
        }
      }

    } catch (error) {
      console.error('❌ Migration failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Quick fix command
program
  .command('fix')
  .description('Quick fix for common DKIM issues')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    try {
      console.log('🔧 Running Quick DKIM Fix...\n');
      
      // First run health check
      const report = await dkimHealthChecker.performFullHealthCheck();
      
      if (report.criticalIssues === 0) {
        console.log('✅ No critical DKIM issues found. System is healthy!');
        return;
      }

      console.log(`🚨 Found ${report.criticalIssues} domains with critical DKIM issues`);
      
      if (options.dryRun) {
        console.log('\n[DRY RUN] Would fix the following domains:');
        report.summary.critical.forEach((domain, i) => {
          console.log(`   ${i + 1}. ${domain.domainName} (ID: ${domain.domainId})`);
          domain.issues
            .filter(issue => issue.severity === 'CRITICAL')
            .forEach(issue => console.log(`      • ${issue.description}`));
        });
      } else {
        console.log('\n🚀 Fixing critical issues...');
        
        // Run migration only for critical domains
        const migrationResult = await dkimMigrationService.migrateAllDomains(false, false);
        
        console.log(`\n✅ Quick fix completed!`);
        console.log(`   Fixed: ${migrationResult.successful} domains`);
        console.log(`   Failed: ${migrationResult.failed} domains`);
        console.log(`   Duration: ${migrationResult.duration}ms`);

        if (migrationResult.failed > 0) {
          console.log('\n❌ Some domains failed to fix. Run full migration for detailed analysis.');
        }
      }

    } catch (error) {
      console.error('❌ Quick fix failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Helper function for status emojis
function getStatusEmoji(status: string): string {
  switch (status.toUpperCase()) {
    case 'HEALTHY': return '✅';
    case 'WARNING': return '⚠️';
    case 'CRITICAL': return '🚨';
    case 'SUCCESS': return '✅';
    case 'FAILED': return '❌';
    case 'SKIPPED': return '⚪';
    default: return '❓';
  }
}

// Parse command line arguments
if (require.main === module) {
  program.parse();
}