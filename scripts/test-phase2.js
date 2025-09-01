#!/usr/bin/env node

/**
 * Teste completo da Fase 2 - Servidor SMTP Real
 * 
 * Este script testa todos os componentes implementados na Fase 2:
 * - SecurityManager
 * - RateLimiter 
 * - ReputationManager
 * - DKIMManager
 * - EmailProcessor
 * - DeliveryManager
 * - UltraZendSMTPServer
 */

const { logger } = require('../backend/src/config/logger');
const { SecurityManager } = require('../backend/src/services/securityManager');
const { RateLimiter } = require('../backend/src/services/rateLimiter');
const { ReputationManager } = require('../backend/src/services/reputationManager');
const { DKIMManager } = require('../backend/src/services/dkimManager');
const { EmailProcessor } = require('../backend/src/services/emailProcessor');
const { DeliveryManager } = require('../backend/src/services/deliveryManager');
const UltraZendSMTPServer = require('../backend/src/services/smtpServer');

class Phase2Tester {
  constructor() {
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runTest(testName, testFunction) {
    this.totalTests++;
    console.log(`\n🧪 Testing: ${testName}`);
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      this.passedTests++;
      this.testResults.push({
        name: testName,
        status: 'PASSED',
        duration,
        error: null
      });
      
      console.log(`✅ ${testName} - PASSED (${duration}ms)`);
    } catch (error) {
      this.failedTests++;
      this.testResults.push({
        name: testName,
        status: 'FAILED',
        duration: 0,
        error: error.message
      });
      
      console.log(`❌ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testSecurityManager() {
    const securityManager = new SecurityManager();
    
    await this.runTest('SecurityManager - Whitelist Check', async () => {
      const result = await securityManager.validateMXConnection('127.0.0.1', 'localhost');
      if (!result || typeof result.isValid !== 'boolean') {
        throw new Error('Invalid response format');
      }
    });

    await this.runTest('SecurityManager - Email Security Check', async () => {
      const testEmail = {
        from: 'test@example.com',
        to: 'user@ultrazend.com',
        subject: 'Test Email',
        body: 'This is a test email'
      };
      
      const result = await securityManager.checkEmailSecurity(testEmail, '127.0.0.1');
      if (!result || typeof result.isSecure !== 'boolean') {
        throw new Error('Invalid response format');
      }
    });

    await this.runTest('SecurityManager - Spam Analysis', async () => {
      const result = await securityManager.analyzeSpam('This is a test message', {});
      if (!result || typeof result.spamScore !== 'number') {
        throw new Error('Invalid spam analysis result');
      }
    });
  }

  async testRateLimiter() {
    const rateLimiter = new RateLimiter();
    
    await this.runTest('RateLimiter - Connection Check', async () => {
      const result = await rateLimiter.checkConnection('127.0.0.1');
      if (!result || typeof result.allowed !== 'boolean') {
        throw new Error('Invalid rate limit response');
      }
    });

    await this.runTest('RateLimiter - Auth Check', async () => {
      const result = await rateLimiter.checkAuth('127.0.0.1', 'testuser');
      if (!result || typeof result.allowed !== 'boolean') {
        throw new Error('Invalid auth rate limit response');
      }
    });

    await this.runTest('RateLimiter - Email Sending Check', async () => {
      const result = await rateLimiter.checkEmailSending(1, '127.0.0.1');
      if (!result || typeof result.allowed !== 'boolean') {
        throw new Error('Invalid email rate limit response');
      }
    });

    await this.runTest('RateLimiter - Get Stats', async () => {
      const stats = await rateLimiter.getRateLimitStats();
      if (!stats || !stats.timestamp) {
        throw new Error('Invalid rate limit stats');
      }
    });
  }

  async testReputationManager() {
    const reputationManager = new ReputationManager();
    
    await this.runTest('ReputationManager - Check Delivery Allowed', async () => {
      const result = await reputationManager.checkDeliveryAllowed('example.com');
      if (!result || typeof result.allowed !== 'boolean') {
        throw new Error('Invalid reputation check response');
      }
    });

    await this.runTest('ReputationManager - Record Successful Delivery', async () => {
      await reputationManager.recordSuccessfulDelivery('example.com');
      // Se chegou até aqui sem erro, o teste passou
    });

    await this.runTest('ReputationManager - Record Failed Delivery', async () => {
      await reputationManager.recordFailedDelivery('example.com', 'Test failure');
      // Se chegou até aqui sem erro, o teste passou
    });

    await this.runTest('ReputationManager - Get Stats', async () => {
      const stats = await reputationManager.getReputationStats();
      if (!stats || !stats.timestamp) {
        throw new Error('Invalid reputation stats');
      }
    });
  }

  async testDKIMManager() {
    const dkimManager = new DKIMManager();
    
    await this.runTest('DKIMManager - Generate DKIM Keys', async () => {
      const result = await dkimManager.generateDKIMKeys('test.com', 'default');
      if (!result || !result.success) {
        throw new Error('Failed to generate DKIM keys');
      }
    });

    await this.runTest('DKIMManager - Sign Email', async () => {
      // Primeiro garantir que temos uma chave
      await dkimManager.generateDKIMKeys('test.com', 'default');
      
      const emailData = {
        from: 'test@test.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        body: 'This is a test email for DKIM signing',
        headers: {}
      };
      
      const result = await dkimManager.signEmail(emailData);
      if (!result || !result.success || !result.headers['DKIM-Signature']) {
        throw new Error('Failed to sign email with DKIM');
      }
    });

    await this.runTest('DKIMManager - Get DNS Record', async () => {
      const result = await dkimManager.getDNSRecord('test.com', 'default');
      if (!result || !result.success) {
        throw new Error('Failed to get DNS record');
      }
    });
  }

  async testEmailProcessor() {
    const securityManager = new SecurityManager();
    const rateLimiter = new RateLimiter();
    const reputationManager = new ReputationManager();
    const dkimManager = new DKIMManager();
    
    const emailProcessor = new EmailProcessor(
      securityManager,
      rateLimiter,
      reputationManager,
      dkimManager
    );
    
    await this.runTest('EmailProcessor - Validate Sender', async () => {
      const result = await emailProcessor.validateSender(
        'test@example.com',
        { id: 1, email: 'test@example.com' },
        '127.0.0.1'
      );
      if (!result || typeof result.isValid !== 'boolean') {
        throw new Error('Invalid sender validation response');
      }
    });

    await this.runTest('EmailProcessor - Validate Local Recipient', async () => {
      const result = await emailProcessor.validateLocalRecipient('user@ultrazend.com');
      if (!result || typeof result.isValid !== 'boolean') {
        throw new Error('Invalid recipient validation response');
      }
    });

    // Simular um email processado
    const mockParsedEmail = {
      messageId: '<test@example.com>',
      from: { value: [{ address: 'test@example.com', name: 'Test User' }] },
      to: { value: [{ address: 'recipient@ultrazend.com', name: 'Recipient' }] },
      subject: 'Test Email',
      text: 'This is a test email',
      html: '<p>This is a test email</p>',
      headers: new Map()
    };

    const mockSession = {
      remoteAddress: '127.0.0.1',
      user: { id: 1, email: 'test@example.com' },
      authenticated: true
    };

    await this.runTest('EmailProcessor - Process Outgoing Email', async () => {
      const result = await emailProcessor.processOutgoingEmail(mockParsedEmail, mockSession);
      if (!result || typeof result.success !== 'boolean') {
        throw new Error('Invalid outgoing email processing response');
      }
    });
  }

  async testDeliveryManager() {
    const reputationManager = new ReputationManager();
    const dkimManager = new DKIMManager();
    const securityManager = new SecurityManager();
    
    const deliveryManager = new DeliveryManager(
      reputationManager,
      dkimManager,
      securityManager
    );

    await this.runTest('DeliveryManager - Queue Email', async () => {
      const emailData = {
        from: 'test@ultrazend.com',
        to: 'recipient@example.com',
        subject: 'Test Delivery',
        body: 'This is a test email for delivery',
        userId: 1
      };
      
      const deliveryId = await deliveryManager.queueEmail(emailData);
      if (!deliveryId || typeof deliveryId !== 'number') {
        throw new Error('Failed to queue email for delivery');
      }
    });

    await this.runTest('DeliveryManager - Get Stats', async () => {
      const stats = await deliveryManager.getStats();
      if (!stats || typeof stats.pending !== 'number') {
        throw new Error('Invalid delivery stats');
      }
    });
  }

  async testSMTPServer() {
    await this.runTest('SMTPServer - Initialization', async () => {
      const server = new UltraZendSMTPServer();
      if (!server) {
        throw new Error('Failed to initialize SMTP server');
      }
      
      const status = server.getStatus();
      if (!status || typeof status.isRunning !== 'boolean') {
        throw new Error('Invalid server status');
      }
    });

    await this.runTest('SMTPServer - Configuration', async () => {
      const customConfig = {
        mxPort: 2525,
        submissionPort: 5587,
        hostname: 'test.ultrazend.com'
      };
      
      const server = new UltraZendSMTPServer(customConfig);
      const status = server.getStatus();
      
      if (status.config.mxPort !== 2525 || status.config.submissionPort !== 5587) {
        throw new Error('Server configuration not applied correctly');
      }
    });
  }

  async testDatabaseTables() {
    const db = require('../backend/src/config/database').default;
    
    const expectedTables = [
      'security_events',
      'mx_reputation',
      'domain_reputation',
      'rate_limit_logs',
      'rate_limit_configs',
      'dkim_configs',
      'dkim_keys',
      'email_processing_logs',
      'quarantine',
      'email_delivery_queue',
      'delivery_stats',
      'smtp_connections',
      'auth_attempts'
    ];

    for (const tableName of expectedTables) {
      await this.runTest(`Database - Table ${tableName}`, async () => {
        const exists = await db.schema.hasTable(tableName);
        if (!exists) {
          throw new Error(`Table ${tableName} does not exist`);
        }
      });
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Phase 2 Complete Test Suite');
    console.log('=====================================\n');

    console.log('📋 Testing Database Tables...');
    await this.testDatabaseTables();

    console.log('\n🔒 Testing SecurityManager...');
    await this.testSecurityManager();

    console.log('\n⏱️ Testing RateLimiter...');
    await this.testRateLimiter();

    console.log('\n📊 Testing ReputationManager...');
    await this.testReputationManager();

    console.log('\n🔐 Testing DKIMManager...');
    await this.testDKIMManager();

    console.log('\n📧 Testing EmailProcessor...');
    await this.testEmailProcessor();

    console.log('\n🚚 Testing DeliveryManager...');
    await this.testDeliveryManager();

    console.log('\n🖥️ Testing SMTPServer...');
    await this.testSMTPServer();

    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    
    console.log(`\n📈 Overall Results:`);
    console.log(`   Total Tests: ${this.totalTests}`);
    console.log(`   ✅ Passed: ${this.passedTests}`);
    console.log(`   ❌ Failed: ${this.failedTests}`);
    console.log(`   📊 Success Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%`);

    if (this.failedTests > 0) {
      console.log(`\n❌ Failed Tests:`);
      this.testResults
        .filter(result => result.status === 'FAILED')
        .forEach(result => {
          console.log(`   • ${result.name}: ${result.error}`);
        });
    }

    console.log(`\n⏱️ Performance:`);
    const totalDuration = this.testResults.reduce((sum, result) => sum + result.duration, 0);
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log(`   Average per Test: ${(totalDuration / this.totalTests).toFixed(1)}ms`);

    console.log('\n' + '='.repeat(50));
    
    if (this.failedTests === 0) {
      console.log('🎉 ALL TESTS PASSED! Phase 2 implementation is working correctly.');
      process.exit(0);
    } else {
      console.log('⚠️ Some tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Executar os testes
async function main() {
  const tester = new Phase2Tester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = Phase2Tester;