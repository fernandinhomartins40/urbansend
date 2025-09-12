/**
 * 🧪 SERVIDOR MÍNIMO PARA TESTE FASE 2.3
 * Apenas APIs essenciais sem SMTP
 */

const express = require('express');
const cors = require('cors');
const { SimpleEmailValidator } = require('./dist/email/EmailValidator');

const app = express();
const PORT = 3002; // Porta diferente para evitar conflito

// Middlewares
app.use(cors());
app.use(express.json());

// Logger simples
const log = (message, data) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    purpose: 'Test server for Phase 2.3'
  });
});

// Endpoint da Fase 2.3 - Principal
app.get('/api/test/test-domain-integration/:userId/:domain', async (req, res) => {
  try {
    const { userId, domain } = req.params;
    const userIdNum = parseInt(userId);

    if (isNaN(userIdNum)) {
      return res.status(400).json({
        error: 'Invalid userId parameter',
        code: 'INVALID_USER_ID'
      });
    }

    log('Test domain integration request', { userId: userIdNum, domain });

    const validator = new SimpleEmailValidator();
    const result = await validator.checkDomainOwnership(domain, userIdNum);
    
    log('Domain integration test result', { 
      userId: userIdNum, 
      domain, 
      verified: result.verified 
    });

    res.json({
      success: true,
      test: 'domain-integration',
      userId: userIdNum,
      domain,
      result,
      timestamp: new Date().toISOString(),
      phase: '2.3'
    });

  } catch (error) {
    log('Domain integration test failed', { error: error.message });
    res.status(500).json({
      error: 'Domain integration test failed',
      code: 'INTEGRATION_TEST_ERROR',
      details: error.message
    });
  }
});

// Endpoint auxiliar - criar domínio de teste
app.post('/api/test/test-create-domain', async (req, res) => {
  try {
    const { userId, domain, verified = true } = req.body;

    if (!userId || !domain) {
      return res.status(400).json({
        error: 'userId and domain are required',
        code: 'MISSING_PARAMETERS'
      });
    }

    const validator = new SimpleEmailValidator();
    const success = await validator.addVerifiedDomain(userId, domain, 'test-fase-2-3');

    res.json({
      success,
      action: success ? 'created' : 'failed',
      domain,
      verified,
      message: success ? 'Test domain created successfully' : 'Failed to create domain'
    });

  } catch (error) {
    log('Failed to create test domain', { error: error.message });
    res.status(500).json({
      error: 'Failed to create test domain',
      code: 'CREATE_DOMAIN_ERROR',
      details: error.message
    });
  }
});

// Endpoint auxiliar - listar domínios
app.get('/api/test/test-user-domains/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userIdNum = parseInt(userId);

    if (isNaN(userIdNum)) {
      return res.status(400).json({
        error: 'Invalid userId parameter',
        code: 'INVALID_USER_ID'
      });
    }

    const validator = new SimpleEmailValidator();
    const domains = await validator.getUserVerifiedDomains(userIdNum);

    res.json({
      success: true,
      test: 'user-domains-list',
      userId: userIdNum,
      domains,
      count: domains.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log('Failed to get user domains', { error: error.message });
    res.status(500).json({
      error: 'Failed to get user domains',
      code: 'GET_DOMAINS_ERROR',
      details: error.message
    });
  }
});

// Status do sistema
app.get('/api/test/test-system-status', async (req, res) => {
  try {
    const validator = new SimpleEmailValidator();
    const testResult = await validator.checkDomainOwnership('test-non-existent.com', 1);

    res.json({
      success: true,
      test: 'system-status',
      status: {
        emailValidator: testResult.verified === false ? 'working' : 'error',
        server: 'minimal-test-server'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'System status check failed',
      code: 'SYSTEM_STATUS_ERROR',
      details: error.message
    });
  }
});

// Error handler
app.use((error, req, res, next) => {
  log('Unhandled error', { error: error.message });
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🧪 Test server running on http://localhost:${PORT}`);
  console.log(`📋 Fase 2.3 endpoints available:`);
  console.log(`   GET  /api/test/test-domain-integration/:userId/:domain`);
  console.log(`   POST /api/test/test-create-domain`);
  console.log(`   GET  /api/test/test-user-domains/:userId`);
  console.log(`   GET  /api/test/test-system-status`);
  console.log(`   GET  /health`);
});

module.exports = app;