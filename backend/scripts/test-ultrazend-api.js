#!/usr/bin/env node

/**
 * 🌐 ULTRAZEND API TEST SUITE
 * Testa a API completa do UltraZend SMTP como produto SaaS
 */

const axios = require('axios');

// Configuração de teste
const API_CONFIG = {
  baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
  testEmail: process.env.TEST_EMAIL || 'teste@gmail.com',
  apiKey: process.env.TEST_API_KEY || 'test-api-key',
  timeout: 30000
};

class UltraZendAPITester {
  constructor() {
    this.results = {
      tests: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
    
    // Configurar cliente HTTP
    this.client = axios.create({
      baseURL: API_CONFIG.baseURL,
      timeout: API_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'UltraZend-API-Tester/1.0.0'
      }
    });
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

  async testHealthCheck() {
    const response = await this.client.get('/health');
    
    if (response.status !== 200) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
    
    const health = response.data;
    this.log(`API Health: ${JSON.stringify(health, null, 2)}`);
    
    if (!health.status || health.status !== 'ok') {
      throw new Error('API health status is not ok');
    }
  }

  async testSendEmail() {
    this.log('⚠️  This test will attempt to send a real email via API!', 'warn');
    
    if (!process.env.ENABLE_REAL_EMAIL_TEST) {
      this.log('Skipping real email test (set ENABLE_REAL_EMAIL_TEST=true to enable)', 'warn');
      return;
    }

    const emailData = {
      to: API_CONFIG.testEmail,
      subject: '🚀 UltraZend API Test - ' + new Date().toISOString(),
      html: `
        <h1>🌐 UltraZend API Test</h1>
        <p>This email was sent via UltraZend API.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Mode:</strong> Pure UltraZend SMTP (No Postfix)</p>
        <p><strong>API Version:</strong> 1.0.0</p>
        <p><strong>Test ID:</strong> ${Math.random().toString(36).substr(2, 9)}</p>
      `,
      text: `
        🌐 UltraZend API Test
        
        This email was sent via UltraZend API.
        Timestamp: ${new Date().toISOString()}
        Mode: Pure UltraZend SMTP (No Postfix)
        API Version: 1.0.0
        Test ID: ${Math.random().toString(36).substr(2, 9)}
      `
    };

    const response = await this.client.post('/api/emails/send', emailData, {
      headers: {
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    });
    
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`Send email failed with status ${response.status}`);
    }
    
    const result = response.data;
    this.log(`Email queued: ${JSON.stringify(result, null, 2)}`);
    
    if (!result.success && !result.messageId) {
      throw new Error('Email not queued properly');
    }
  }

  async testBulkEmail() {
    this.log('📬 Testing bulk email functionality');
    
    if (!process.env.ENABLE_REAL_EMAIL_TEST) {
      this.log('Skipping bulk email test (set ENABLE_REAL_EMAIL_TEST=true to enable)', 'warn');
      return;
    }

    const emails = [
      {
        to: API_CONFIG.testEmail,
        subject: '🔄 UltraZend Bulk Test 1',
        html: '<h1>Bulk Email Test 1</h1>'
      },
      {
        to: API_CONFIG.testEmail,
        subject: '🔄 UltraZend Bulk Test 2', 
        html: '<h1>Bulk Email Test 2</h1>'
      }
    ];

    const response = await this.client.post('/api/emails/send-bulk', {
      emails
    }, {
      headers: {
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    });
    
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`Bulk send failed with status ${response.status}`);
    }
    
    const result = response.data;
    this.log(`Bulk emails queued: ${JSON.stringify(result, null, 2)}`);
  }

  async testEmailTemplate() {
    this.log('📝 Testing email template functionality');
    
    if (!process.env.ENABLE_REAL_EMAIL_TEST) {
      this.log('Skipping template test (set ENABLE_REAL_EMAIL_TEST=true to enable)', 'warn');
      return;
    }

    const templateData = {
      to: API_CONFIG.testEmail,
      templateId: 'welcome', // Assumindo que existe um template 'welcome'
      variables: {
        name: 'Teste UltraZend',
        company: 'UltraZend SMTP',
        verificationUrl: 'https://ultrazend.com.br/verify?token=test123'
      }
    };

    try {
      const response = await this.client.post('/api/emails/send-template', templateData, {
        headers: {
          'Authorization': `Bearer ${API_CONFIG.apiKey}`
        }
      });
      
      if (response.status === 200 || response.status === 202) {
        this.log('Template email sent successfully');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log('Template not found - skipping template test', 'warn');
      } else {
        throw error;
      }
    }
  }

  async testAnalytics() {
    try {
      const response = await this.client.get('/api/analytics/summary', {
        headers: {
          'Authorization': `Bearer ${API_CONFIG.apiKey}`
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Analytics failed with status ${response.status}`);
      }
      
      const analytics = response.data;
      this.log(`Analytics: ${JSON.stringify(analytics, null, 2)}`);
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log('Analytics endpoint not available - may not be implemented yet', 'warn');
      } else {
        throw error;
      }
    }
  }

  async testWebhookConfiguration() {
    try {
      const webhookConfig = {
        url: 'https://httpbin.org/post',
        events: ['email.delivered', 'email.bounced', 'email.failed']
      };

      const response = await this.client.post('/api/webhooks', webhookConfig, {
        headers: {
          'Authorization': `Bearer ${API_CONFIG.apiKey}`
        }
      });
      
      if (response.status === 200 || response.status === 201) {
        this.log('Webhook configured successfully');
      }
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log('Webhook endpoint not available - may not be implemented yet', 'warn');
      } else {
        throw error;
      }
    }
  }

  async testRateLimiting() {
    this.log('🚦 Testing rate limiting');
    
    // Fazer múltiplas requisições rápidas para testar rate limiting
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        this.client.get('/health').catch(error => ({ error, status: error.response?.status }))
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status === 429);
    
    if (rateLimited) {
      this.log('Rate limiting is working correctly', 'success');
    } else {
      this.log('Rate limiting may not be configured or threshold is high', 'warn');
    }
  }

  async testAuthentication() {
    this.log('🔐 Testing authentication');
    
    // Testar sem API key
    try {
      await this.client.post('/api/emails/send', {
        to: 'test@example.com',
        subject: 'Test',
        html: '<h1>Test</h1>'
      });
      
      throw new Error('Request should have been rejected without API key');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.log('Authentication is working - unauthorized request rejected', 'success');
      } else {
        throw error;
      }
    }
  }

  async testQueueStatus() {
    try {
      const response = await this.client.get('/api/queue/status', {
        headers: {
          'Authorization': `Bearer ${API_CONFIG.apiKey}`
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Queue status failed with status ${response.status}`);
      }
      
      const queueStatus = response.data;
      this.log(`Queue Status: ${JSON.stringify(queueStatus, null, 2)}`);
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log('Queue status endpoint not available', 'warn');
      } else {
        throw error;
      }
    }
  }

  printSummary() {
    this.log('\n📊 API TEST SUMMARY', 'info');
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
    this.log('🌐 Starting UltraZend API Test Suite', 'info');
    this.log(`API configuration: ${JSON.stringify(API_CONFIG, null, 2)}`);
    
    // Executar todos os testes
    await this.runTest('Health Check', () => this.testHealthCheck());
    await this.runTest('Authentication', () => this.testAuthentication());
    await this.runTest('Rate Limiting', () => this.testRateLimiting());
    await this.runTest('Send Email', () => this.testSendEmail());
    await this.runTest('Bulk Email', () => this.testBulkEmail());
    await this.runTest('Email Template', () => this.testEmailTemplate());
    await this.runTest('Analytics', () => this.testAnalytics());
    await this.runTest('Webhook Configuration', () => this.testWebhookConfiguration());
    await this.runTest('Queue Status', () => this.testQueueStatus());
    
    return this.printSummary();
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  const tester = new UltraZendAPITester();
  
  tester.runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ API test suite crashed:', error);
      process.exit(1);
    });
}

module.exports = UltraZendAPITester;