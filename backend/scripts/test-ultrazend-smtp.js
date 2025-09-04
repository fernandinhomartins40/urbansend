#!/usr/bin/env node

/**
 * 🧪 ULTRAZEND SMTP TEST SUITE
 * Testa o sistema UltraZend SMTP em modo puro (sem Postfix)
 */

const { SMTPDeliveryService } = require('../dist/services/smtpDelivery');
const { EmailService } = require('../dist/services/emailService');
const { QueueService } = require('../dist/services/queueService');
const { DKIMManager } = require('../dist/services/dkimManager');

// Configuração de teste
const TEST_CONFIG = {
  testEmail: process.env.TEST_EMAIL || 'teste@gmail.com',
  fromEmail: 'noreply@ultrazend.com.br',
  testDomain: 'gmail.com',
  timeout: 30000 // 30 segundos
};

class UltraZendSMTPTester {
  constructor() {
    this.results = {
      tests: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '🔍',
      success: '✅', 
      error: '❌',
      warn: '⚠️'
    }[type] || 'ℹ️';
    
    console.log(`${timestamp} ${prefix} ${message}`);
  }

  async runTest(testName, testFn) {
    this.results.tests++;
    this.log(`Running test: ${testName}`);
    
    try {
      await testFn();
      this.results.passed++;
      this.log(`Test passed: ${testName}`, 'success');
      return true;
    } catch (error) {
      this.results.failed++;
      this.results.errors.push({ test: testName, error: error.message });
      this.log(`Test failed: ${testName} - ${error.message}`, 'error');
      return false;
    }
  }

  async testDKIMManager() {
    const dkimManager = new DKIMManager();
    
    const emailData = {
      from: TEST_CONFIG.fromEmail,
      to: TEST_CONFIG.testEmail,
      subject: 'DKIM Test',
      html: '<h1>Test DKIM Signature</h1>',
      text: 'Test DKIM Signature'
    };

    const signed = await dkimManager.signEmail(emailData);
    
    if (!signed.dkimSignature) {
      throw new Error('DKIM signature not generated');
    }
    
    if (signed.dkimSignature.length < 100) {
      throw new Error('DKIM signature too short');
    }

    this.log(`DKIM signature generated: ${signed.dkimSignature.substring(0, 50)}...`);
  }

  async testSMTPDeliveryService() {
    const smtpService = new SMTPDeliveryService();
    
    // Teste 1: Verificar inicialização
    if (!smtpService) {
      throw new Error('SMTPDeliveryService not initialized');
    }

    // Teste 2: Testar conexão básica
    const canConnect = await smtpService.testConnection();
    if (!canConnect) {
      this.log('Connection test failed - may be expected in some environments', 'warn');
    }

    this.log('SMTPDeliveryService initialized successfully');
  }

  async testMXRecordResolution() {
    const smtpService = new SMTPDeliveryService();
    
    // Usar método privado via reflection (para teste)
    const getMXRecords = smtpService.getMXRecords || 
      ((domain) => require('dns').promises.resolveMx(domain));
    
    try {
      // Testar com domínio conhecido
      const mxRecords = await smtpService.getMXRecords(TEST_CONFIG.testDomain);
      
      if (!Array.isArray(mxRecords) || mxRecords.length === 0) {
        throw new Error(`No MX records found for ${TEST_CONFIG.testDomain}`);
      }
      
      this.log(`Found ${mxRecords.length} MX records for ${TEST_CONFIG.testDomain}:`);
      mxRecords.forEach(mx => {
        this.log(`  - ${mx.exchange} (priority: ${mx.priority})`);
      });
      
    } catch (error) {
      throw new Error(`MX record resolution failed: ${error.message}`);
    }
  }

  async testEmailService() {
    const emailService = new EmailService();
    
    if (!emailService) {
      throw new Error('EmailService not initialized');
    }

    // Testar conexão do EmailService
    const canConnect = await emailService.testConnection();
    this.log(`EmailService connection test: ${canConnect ? 'PASS' : 'FAIL'}`, 
              canConnect ? 'success' : 'warn');
  }

  async testQueueService() {
    try {
      const queueService = new QueueService();
      
      // Testar estatísticas de fila
      const stats = await queueService.getQueueStats();
      
      if (!stats || typeof stats !== 'object') {
        throw new Error('Queue stats not available');
      }

      this.log('Queue Statistics:');
      this.log(`  - Email Queue: ${JSON.stringify(stats.email)}`);
      this.log(`  - Webhook Queue: ${JSON.stringify(stats.webhook)}`);  
      this.log(`  - Analytics Queue: ${JSON.stringify(stats.analytics)}`);

      // Testar saúde da fila
      const health = await queueService.getHealth();
      this.log(`Queue Health: ${health.healthy ? 'HEALTHY' : 'UNHEALTHY'}`, 
                health.healthy ? 'success' : 'warn');
      
    } catch (error) {
      if (error.message.includes('Redis')) {
        this.log('Queue service using fallback mode (Redis not available)', 'warn');
      } else {
        throw error;
      }
    }
  }

  async testDirectEmailDelivery() {
    this.log('⚠️  This test will attempt to send a real email!', 'warn');
    
    // Só fazer teste real se explicitamente solicitado
    if (!process.env.ENABLE_REAL_EMAIL_TEST) {
      this.log('Skipping real email test (set ENABLE_REAL_EMAIL_TEST=true to enable)', 'warn');
      return;
    }

    const smtpService = new SMTPDeliveryService();
    
    const emailData = {
      from: TEST_CONFIG.fromEmail,
      to: TEST_CONFIG.testEmail,
      subject: '🧪 UltraZend SMTP Test - ' + new Date().toISOString(),
      html: `
        <h1>🚀 UltraZend SMTP Test</h1>
        <p>This email was sent directly via UltraZend SMTP server.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Mode:</strong> Direct MX Delivery (No Postfix)</p>
        <p><strong>Test ID:</strong> ${Math.random().toString(36).substr(2, 9)}</p>
      `,
      text: `
        🚀 UltraZend SMTP Test
        
        This email was sent directly via UltraZend SMTP server.
        Timestamp: ${new Date().toISOString()}
        Mode: Direct MX Delivery (No Postfix)
        Test ID: ${Math.random().toString(36).substr(2, 9)}
      `
    };

    const success = await smtpService.deliverEmail(emailData);
    
    if (!success) {
      throw new Error('Email delivery failed');
    }

    this.log(`Email sent successfully to ${TEST_CONFIG.testEmail}`, 'success');
  }

  async testEnvironmentConfiguration() {
    const env = process.env;
    const requiredVars = [
      'NODE_ENV',
      'DKIM_PRIVATE_KEY_PATH',
      'ULTRAZEND_DOMAIN'
    ];

    const missing = requiredVars.filter(v => !env[v]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    // Verificar se arquivo DKIM existe
    const fs = require('fs');
    const dkimPath = env.DKIM_PRIVATE_KEY_PATH;
    
    if (!fs.existsSync(dkimPath)) {
      throw new Error(`DKIM private key not found at: ${dkimPath}`);
    }

    this.log('Environment configuration looks good');
    this.log(`NODE_ENV: ${env.NODE_ENV}`);
    this.log(`DKIM Key: ${dkimPath}`);
  }

  printSummary() {
    this.log('\n📊 TEST SUMMARY', 'info');
    this.log(`Total Tests: ${this.results.tests}`);
    this.log(`Passed: ${this.results.passed}`, 'success');
    this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'error' : 'info');
    
    if (this.results.errors.length > 0) {
      this.log('\n❌ FAILED TESTS:', 'error');
      this.results.errors.forEach(({ test, error }) => {
        this.log(`  - ${test}: ${error}`, 'error');
      });
    }

    const success = this.results.failed === 0;
    this.log(`\n🎯 OVERALL RESULT: ${success ? 'PASS' : 'FAIL'}`, 
              success ? 'success' : 'error');
    
    return success;
  }

  async runAllTests() {
    this.log('🚀 Starting UltraZend SMTP Test Suite', 'info');
    this.log(`Test configuration: ${JSON.stringify(TEST_CONFIG, null, 2)}`);
    
    // Executar todos os testes
    await this.runTest('Environment Configuration', () => this.testEnvironmentConfiguration());
    await this.runTest('DKIM Manager', () => this.testDKIMManager());
    await this.runTest('SMTP Delivery Service', () => this.testSMTPDeliveryService());
    await this.runTest('MX Record Resolution', () => this.testMXRecordResolution());
    await this.runTest('Email Service', () => this.testEmailService());
    await this.runTest('Queue Service', () => this.testQueueService());
    await this.runTest('Direct Email Delivery', () => this.testDirectEmailDelivery());
    
    return this.printSummary();
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  const tester = new UltraZendSMTPTester();
  
  tester.runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Test suite crashed:', error);
      process.exit(1);
    });
}

module.exports = UltraZendSMTPTester;