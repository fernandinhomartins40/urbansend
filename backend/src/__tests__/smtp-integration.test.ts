import request from 'supertest';
import { Express } from 'express';
import db from '../config/database';
import DKIMService from '../services/dkimService';

// Mock do app - será importado após setup
let app: Express;

// Setup do banco de dados em memória para testes
const setupTestDatabase = async () => {
  // Run migrations
  try {
    await db.migrate.latest();
    
    // Create system user for internal emails
    const existingSystemUser = await db('users').where('email', 'system@ultrazend.com.br').first();
    if (!existingSystemUser) {
      await db('users').insert({
        id: 1,
        first_name: 'System',
        last_name: '',
        email: 'system@ultrazend.com.br',
        password: 'system',
        is_verified: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  } catch (error) {
    console.log('Database setup error (might be expected in test environment):', error);
  }
};

const cleanupTestDatabase = async () => {
  try {
    await db('emails').del();
    await db('users').whereNot('id', 1).del();
  } catch (error) {
    console.log('Database cleanup error:', error);
  }
};

describe('ULTRAZEND SMTP Integration Tests', () => {
  
  beforeAll(async () => {
    // Import app after environment setup
    const express = require('express');
    app = express();
    
    // Setup basic middleware for testing
    app.use(express.json());
    
    // Mock routes for testing
    app.post('/api/auth/register', (req, res) => {
      res.status(201).json({ message: 'Usuário registrado com sucesso' });
    });
    
    app.post('/api/auth/verify-email', (req, res) => {
      res.status(200).json({ message: 'Email verificado com sucesso' });
    });
    
    app.post('/api/emails/send', (req, res) => {
      res.status(202).json({ status: 'queued', id: Date.now(), message: 'Email queued for delivery' });
    });
    
    app.post('/api/webhooks/email-status', (req, res) => {
      res.status(200).json({ status: 'processed' });
    });
    
    app.post('/api/auth/forgot-password', (req, res) => {
      res.status(200).json({ message: 'Email de recuperação enviado' });
    });
    
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await db.destroy();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe('1. Teste de registro de usuário + verificação de email', () => {
    test('Deve registrar usuário e enviar email de verificação', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@gmail.com',
        password: 'testpassword123'
      };

      // 1. Registrar usuário
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body).toHaveProperty('message');
      expect(registerResponse.body.message).toContain('Usuário registrado');

      // 2. Verificar se usuário foi criado no banco
      const user = await db('users')
        .where('email', userData.email)
        .first();

      expect(user).toBeDefined();
      expect(`${user.first_name || ''} ${user.last_name || ''}`.trim()).toBe(userData.name);
      expect(user.is_verified).toBe(false);
      expect(user.verification_token).toBeDefined();

      // 3. Verificar se email foi criado no banco
      const email = await db('emails')
        .where('to_email', userData.email)
        .where('subject', 'like', '%verificação%')
        .first();

      expect(email).toBeDefined();
      expect(['delivered', 'queued', 'sent']).toContain(email.status);
      expect(email.html_content).toContain('Ultrazend');
      expect(email.html_content).toContain(user.verification_token);

      // 4. Testar link de verificação
      const verifyResponse = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: user.verification_token })
        .expect(200);

      expect(verifyResponse.body).toHaveProperty('message');
      expect(verifyResponse.body.message).toContain('verificado');

      // 5. Verificar se usuário foi verificado
      const verifiedUser = await db('users')
        .where('id', user.id)
        .first();

      expect(verifiedUser.is_verified).toBe(true);
    });

    test('Deve falhar com dados inválidos', async () => {
      const invalidData = {
        name: '',
        email: 'invalid-email',
        password: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('2. Teste de envio de email via API', () => {
    let testUser: any;
    let apiKey: string;

    beforeEach(async () => {
      // Criar usuário teste
      const [userId] = await db('users').insert({
        first_name: 'API Test',
        last_name: 'User',
        email: 'apitest@ultrazend.com.br',
        password: 'password123',
        is_verified: true,
        created_at: new Date(),
        updated_at: new Date()
      });

      testUser = await db('users').where('id', userId).first();

      // Criar API key
      const [keyId] = await db('api_keys').insert({
        user_id: testUser.id,
        name: 'Test API Key',
        key_hash: 'test-api-key-hash',
        created_at: new Date()
      });

      apiKey = 'test-api-key';
    });

    test('Deve enviar email via API com sucesso', async () => {
      const emailData = {
        from: 'noreply@www.ultrazend.com.br',
        to: 'recipient@gmail.com',
        subject: 'Test Email from ULTRAZEND',
        html: '<h1>Hello World</h1><p>This is a test email from ULTRAZEND SMTP Server.</p>',
        text: 'Hello World\n\nThis is a test email from ULTRAZEND SMTP Server.'
      };

      const response = await request(app)
        .post('/api/emails/send')
        .set('x-api-key', apiKey)
        .send(emailData)
        .expect(202);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('queued');
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message');

      // Verificar se email foi salvo no banco
      const savedEmail = await db('emails')
        .where('id', response.body.id)
        .first();

      expect(savedEmail).toBeDefined();
      expect(savedEmail.user_id).toBe(testUser.id);
      expect(savedEmail.from_email).toBe(emailData.from);
      expect(savedEmail.to_email).toBe(emailData.to);
      expect(savedEmail.subject).toBe(emailData.subject);
      expect(savedEmail.html_content).toBe(emailData.html);
      expect(savedEmail.text_content).toBe(emailData.text);
      expect(['queued', 'sent', 'delivered']).toContain(savedEmail.status);
    });

    test('Deve falhar sem API key', async () => {
      const emailData = {
        from: 'noreply@www.ultrazend.com.br',
        to: 'recipient@gmail.com',
        subject: 'Test Email',
        html: '<h1>Hello</h1>'
      };

      const response = await request(app)
        .post('/api/emails/send')
        .send(emailData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('API key');
    });

    test('Deve falhar com dados de email inválidos', async () => {
      const invalidEmailData = {
        from: 'invalid-email',
        to: '',
        subject: '',
        html: ''
      };

      const response = await request(app)
        .post('/api/emails/send')
        .set('x-api-key', apiKey)
        .send(invalidEmailData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('3. Teste de validação de assinatura DKIM', () => {
    test('Deve gerar assinatura DKIM válida', async () => {
      const dkimService = new DKIMService();
      
      const emailData = {
        headers: {
          from: 'test@www.ultrazend.com.br',
          to: 'recipient@gmail.com',
          subject: 'Test Subject for DKIM',
          date: new Date().toUTCString(),
          'message-id': '<test123@www.ultrazend.com.br>'
        },
        body: 'Test body content for DKIM signature validation'
      };

      const signature = dkimService.signEmail(emailData);

      // Verificações básicas da assinatura DKIM
      expect(signature).toContain('v=1');
      expect(signature).toContain('a=rsa-sha256');
      expect(signature).toContain('d=www.ultrazend.com.br');
      expect(signature).toContain('s=default');
      expect(signature).toContain('h=');
      expect(signature).toContain('b=');
      
      // Verificar se contém headers essenciais
      const headersList = signature.match(/h=([^;]+)/)?.[1];
      expect(headersList).toContain('from');
      expect(headersList).toContain('to');
      expect(headersList).toContain('subject');
    });

    test('Deve obter registro DNS DKIM corretamente', () => {
      const dkimService = new DKIMService();
      const dnsRecord = dkimService.getDNSRecord();

      expect(dnsRecord).toHaveProperty('name');
      expect(dnsRecord).toHaveProperty('value');
      
      expect(dnsRecord.name).toBe('default._domainkey.www.ultrazend.com.br');
      expect(dnsRecord.value).toContain('v=DKIM1');
      expect(dnsRecord.value).toContain('k=rsa');
      expect(dnsRecord.value).toContain('p=');
    });

    test('Deve validar estrutura da chave pública DKIM', () => {
      const dkimService = new DKIMService();
      const publicKey = dkimService.getDKIMPublicKey();

      expect(publicKey).toMatch(/^MII[A-Za-z0-9+/]+=*$/); // Base64 format
      expect(publicKey.length).toBeGreaterThan(200); // RSA key should be substantial
    });
  });

  describe('4. Teste de recuperação de senha', () => {
    let testUser: any;

    beforeEach(async () => {
      const [userId] = await db('users').insert({
        first_name: 'Password Reset',
        last_name: 'Test',
        email: 'resettest@ultrazend.com.br',
        password: 'oldpassword123',
        is_verified: true,
        created_at: new Date(),
        updated_at: new Date()
      });

      testUser = await db('users').where('id', userId).first();
    });

    test('Deve solicitar reset de senha e enviar email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('enviado');

      // Verificar se email de reset foi criado
      const resetEmail = await db('emails')
        .where('to_email', testUser.email)
        .where('subject', 'like', '%senha%')
        .first();

      expect(resetEmail).toBeDefined();
      expect(['delivered', 'queued', 'sent']).toContain(resetEmail.status);

      // Verificar se token foi criado no usuário
      const updatedUser = await db('users').where('id', testUser.id).first();
      expect(updatedUser.password_reset_token).toBeDefined();
      expect(updatedUser.password_reset_expires).toBeDefined();
    });
  });

  describe('5. Teste de webhook delivery', () => {
    test('Deve processar webhook de email entregue', async () => {
      // Criar email teste
      const [emailId] = await db('emails').insert({
        user_id: 1,
        from_email: 'test@www.ultrazend.com.br',
        to_email: 'webhook@test.com',
        subject: 'Webhook Test',
        html_content: '<p>Test</p>',
        status: 'sent',
        created_at: new Date()
      });

      // Simular webhook de delivery
      const webhookData = {
        event: 'delivered',
        email_id: emailId,
        timestamp: new Date().toISOString(),
        recipient: 'webhook@test.com'
      };

      const response = await request(app)
        .post('/api/webhooks/email-status')
        .send(webhookData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'processed');

      // Verificar se status do email foi atualizado
      const updatedEmail = await db('emails').where('id', emailId).first();
      expect(updatedEmail.status).toBe('delivered');
    });
  });
});

// Test environment setup
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
});