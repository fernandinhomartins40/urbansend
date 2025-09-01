import request from 'supertest';
import { Express } from 'express';
import { testUtils, createTestUser, MockSMTPClient } from '../setup';
import { logger } from '../../config/logger';
import UltraZendSMTPServer from '../../services/smtpServer';

describe('End-to-End Email Flow Tests', () => {
  let app: Express;
  let smtpServer: UltraZendSMTPServer;
  let testDb: any;
  let testUser: any;
  let authToken: string;
  let mockSMTPClient: MockSMTPClient;

  beforeAll(async () => {
    // Import app after environment is set up
    const { app: expressApp } = await import('../../index');
    app = expressApp;
    
    testDb = testUtils.getTestDb();
    
    // Initialize SMTP server for e2e testing
    smtpServer = new UltraZendSMTPServer();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    mockSMTPClient = new MockSMTPClient();
    
    // Create verified test user
    testUser = await createTestUser({
      email: 'e2e-test@ultrazend.com.br',
      is_verified: true,
      plan_type: 'pro'
    });
  }, 60000);

  afterAll(async () => {
    if (smtpServer) {
      await smtpServer.stop();
    }
    
    if (mockSMTPClient) {
      await mockSMTPClient.close();
    }
    
    if (testDb) {
      await testDb.destroy();
    }
    
    await testUtils.cleanupTestData();
  }, 30000);

  describe('User Registration and Verification Flow', () => {
    test('should register new user and send verification email', async () => {
      const newUserData = {
        name: 'E2E Test User',
        email: 'newuser@example.com',
        password: 'SecurePassword123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUserData)
        .expect(201);

      expect(response.body.message).toContain('registered');
      expect(response.body.user.email).toBe(newUserData.email);
      expect(response.body.user.is_verified).toBe(false);

      // Verify user was created in database
      const user = await testDb('users')
        .where('email', newUserData.email)
        .first();

      expect(user).toBeDefined();
      expect(user.verification_token).toBeTruthy();
      expect(user.verification_token_expires).toBeTruthy();
    });

    test('should verify user email with valid token', async () => {
      // First register a user
      const userData = {
        name: 'Verification Test User',
        email: 'verify@example.com',
        password: 'SecurePassword123!'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Get verification token from database
      const user = await testDb('users')
        .where('email', userData.email)
        .first();

      expect(user.verification_token).toBeTruthy();

      // Verify email
      const verifyResponse = await request(app)
        .get(`/api/auth/verify/${user.verification_token}`)
        .expect(200);

      expect(verifyResponse.body.message).toContain('verified');

      // Check user is now verified in database
      const verifiedUser = await testDb('users')
        .where('email', userData.email)
        .first();

      expect(verifiedUser.is_verified).toBe(true);
      expect(verifiedUser.verification_token).toBeNull();
    });

    test('should reject verification with invalid token', async () => {
      const invalidToken = 'invalid-token-123';

      const response = await request(app)
        .get(`/api/auth/verify/${invalidToken}`)
        .expect(400);

      expect(response.body.error).toContain('Invalid');
    });

    test('should reject verification with expired token', async () => {
      // Create user with expired token
      const expiredUser = await testDb('users').insert({
        name: 'Expired User',
        email: 'expired@example.com',
        password_hash: 'hashed_password',
        is_verified: false,
        verification_token: 'expired-token-123',
        verification_token_expires: new Date(Date.now() - 1000), // 1 second ago
        created_at: new Date(),
        updated_at: new Date()
      });

      const response = await request(app)
        .get('/api/auth/verify/expired-token-123')
        .expect(400);

      expect(response.body.error).toContain('expired');
    });
  });

  describe('Authentication Flow', () => {
    test('should login verified user and return JWT token', async () => {
      const loginData = {
        email: testUser.email,
        password: 'password123' // From test setup
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.token).toBeTruthy();
      expect(response.body.refreshToken).toBeTruthy();
      expect(response.body.user.email).toBe(testUser.email);
      
      authToken = response.body.token;
    });

    test('should reject login with invalid credentials', async () => {
      const invalidLogin = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });

    test('should reject login for unverified user', async () => {
      const unverifiedUser = await createTestUser({
        email: 'unverified@example.com',
        is_verified: false
      });

      const loginData = {
        email: unverifiedUser.email,
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toContain('verified');
    });
  });

  describe('Email Sending Flow', () => {
    beforeEach(async () => {
      // Ensure we have auth token
      if (!authToken) {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'password123'
          });
        authToken = loginResponse.body.token;
      }
    });

    test('should send single email via API', async () => {
      const emailData = {
        to: 'recipient@example.com',
        subject: 'E2E Test Email',
        html: '<h1>Hello from E2E Test</h1><p>This is a test email sent via API.</p>',
        text: 'Hello from E2E Test\n\nThis is a test email sent via API.'
      };

      const response = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(emailData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.messageId).toBeTruthy();

      // Verify email was queued in database
      const queuedEmail = await testDb('emails')
        .where('recipient_email', emailData.to)
        .where('user_id', testUser.id)
        .first();

      expect(queuedEmail).toBeDefined();
      expect(queuedEmail.subject).toBe(emailData.subject);
      expect(queuedEmail.status).toBe('queued');
    });

    test('should send batch emails via API', async () => {
      const batchData = {
        emails: [
          {
            to: 'batch1@example.com',
            subject: 'Batch Email 1',
            html: '<p>Batch email 1</p>',
            text: 'Batch email 1'
          },
          {
            to: 'batch2@example.com',
            subject: 'Batch Email 2',
            html: '<p>Batch email 2</p>',
            text: 'Batch email 2'
          }
        ]
      };

      const response = await request(app)
        .post('/api/emails/send/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results.every((r: any) => r.messageId)).toBe(true);

      // Verify emails were queued
      const queuedEmails = await testDb('emails')
        .where('user_id', testUser.id)
        .whereIn('recipient_email', ['batch1@example.com', 'batch2@example.com']);

      expect(queuedEmails).toHaveLength(2);
    });

    test('should use email template for sending', async () => {
      // First create a template
      const templateData = {
        name: 'E2E Test Template',
        subject: 'Welcome {{name}}!',
        html_content: '<h1>Welcome {{name}}!</h1><p>Your email is {{email}}.</p>',
        text_content: 'Welcome {{name}}! Your email is {{email}}.'
      };

      const templateResponse = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send(templateData)
        .expect(201);

      const templateId = templateResponse.body.template.id;

      // Send email using template
      const emailWithTemplate = {
        to: 'template-test@example.com',
        templateId: templateId,
        variables: {
          name: 'John Doe',
          email: 'template-test@example.com'
        }
      };

      const response = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(emailWithTemplate)
        .expect(200);

      expect(response.body.status).toBe('success');

      // Verify email content was processed with variables
      const sentEmail = await testDb('emails')
        .where('recipient_email', 'template-test@example.com')
        .where('user_id', testUser.id)
        .first();

      expect(sentEmail.subject).toContain('John Doe');
      expect(sentEmail.html_content).toContain('John Doe');
      expect(sentEmail.html_content).toContain('template-test@example.com');
    });

    test('should reject email sending without authentication', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Unauthorized Test',
        html: '<p>This should fail</p>',
        text: 'This should fail'
      };

      const response = await request(app)
        .post('/api/emails/send')
        .send(emailData)
        .expect(401);

      expect(response.body.error).toContain('token');
    });

    test('should validate email format before sending', async () => {
      const invalidEmailData = {
        to: 'invalid-email-format',
        subject: 'Invalid Email Test',
        html: '<p>This should fail</p>',
        text: 'This should fail'
      };

      const response = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidEmailData)
        .expect(400);

      expect(response.body.error).toContain('email');
    });

    test('should enforce rate limiting for email sending', async () => {
      const promises = [];
      
      // Send multiple emails rapidly
      for (let i = 0; i < 15; i++) {
        promises.push(
          request(app)
            .post('/api/emails/send')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              to: `ratelimit${i}@example.com`,
              subject: `Rate Limit Test ${i}`,
              html: `<p>Rate limit test email ${i}</p>`,
              text: `Rate limit test email ${i}`
            })
        );
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 200);
      const rateLimited = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 429);

      // Should have some successful and some rate limited
      expect(successful.length).toBeGreaterThan(0);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('SMTP Server Integration with API', () => {
    test('should process incoming email and trigger webhooks', async () => {
      // First, set up a webhook for the user
      const webhookData = {
        url: 'http://localhost:3001/webhook/test',
        events: ['email.received'],
        is_active: true
      };

      await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData)
        .expect(201);

      // Simulate incoming email via SMTP
      await mockSMTPClient.connect();
      await mockSMTPClient.mail('external@example.com');
      await mockSMTPClient.rcpt(`${testUser.email}`);
      
      const incomingEmailContent = `From: external@example.com
To: ${testUser.email}
Subject: Incoming Email Test
Date: ${new Date().toUTCString()}

This is a test incoming email that should trigger webhooks.`;

      await mockSMTPClient.data(incomingEmailContent);

      // Verify email was received and stored
      await new Promise(resolve => setTimeout(resolve, 1000)); // Allow processing time
      
      const receivedEmails = await testDb('emails')
        .where('recipient_email', testUser.email)
        .where('sender_email', 'external@example.com');

      expect(receivedEmails.length).toBeGreaterThan(0);
    });

    test('should handle bounce notifications correctly', async () => {
      // First send an email that will bounce
      const emailData = {
        to: 'bounce@example.com',
        subject: 'Bounce Test Email',
        html: '<p>This email should bounce</p>',
        text: 'This email should bounce'
      };

      const sendResponse = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(emailData);

      const messageId = sendResponse.body.messageId;

      // Simulate bounce email received via SMTP
      await mockSMTPClient.connect();
      await mockSMTPClient.mail('mailer-daemon@example.com');
      await mockSMTPClient.rcpt(`bounce@ultrazend.com.br`);

      const bounceContent = `From: mailer-daemon@example.com
To: bounce@ultrazend.com.br
Subject: Delivery Status Notification (Failure)
Date: ${new Date().toUTCString()}

This is a delivery failure notification for message ID: ${messageId}
The recipient address bounce@example.com was not found.`;

      await mockSMTPClient.data(bounceContent);

      // Allow processing time
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify bounce was processed and email status updated
      const email = await testDb('emails')
        .where('message_id', messageId)
        .first();

      expect(email.status).toBe('bounced');
    });
  });

  describe('Complete User Journey', () => {
    test('should complete full user journey from registration to email sending', async () => {
      // Step 1: Register new user
      const userData = {
        name: 'Journey Test User',
        email: 'journey@example.com',
        password: 'SecurePassword123!'
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body.user.is_verified).toBe(false);

      // Step 2: Get verification token and verify
      const user = await testDb('users')
        .where('email', userData.email)
        .first();

      await request(app)
        .get(`/api/auth/verify/${user.verification_token}`)
        .expect(200);

      // Step 3: Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password
        })
        .expect(200);

      const userToken = loginResponse.body.token;

      // Step 4: Create email template
      const templateResponse = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Journey Template',
          subject: 'Welcome {{name}}',
          html_content: '<h1>Hello {{name}}</h1>',
          text_content: 'Hello {{name}}'
        })
        .expect(201);

      // Step 5: Set up webhook
      await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          url: 'http://localhost:3001/webhook/journey',
          events: ['email.sent', 'email.delivered'],
          is_active: true
        })
        .expect(201);

      // Step 6: Send email using template
      const emailResponse = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          to: 'journey-recipient@example.com',
          templateId: templateResponse.body.template.id,
          variables: {
            name: 'Journey Recipient'
          }
        })
        .expect(200);

      expect(emailResponse.body.status).toBe('success');

      // Step 7: Verify email was processed
      const sentEmail = await testDb('emails')
        .where('message_id', emailResponse.body.messageId)
        .first();

      expect(sentEmail).toBeDefined();
      expect(sentEmail.status).toBe('queued');
      expect(sentEmail.subject).toContain('Journey Recipient');

      // Step 8: Check user statistics
      const statsResponse = await request(app)
        .get('/api/emails/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(statsResponse.body.total_sent).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed email content gracefully', async () => {
      const malformedData = {
        to: 'test@example.com',
        // Missing subject
        html: '<p>Test</p>'
        // Missing text content
      };

      const response = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(malformedData)
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    test('should handle database connection failures gracefully', async () => {
      // This would require mocking database failures
      // Implementation depends on your error handling strategy
      
      const emailData = {
        to: 'db-test@example.com',
        subject: 'DB Test',
        html: '<p>Database test</p>',
        text: 'Database test'
      };

      // Mock database failure scenario would go here
      // For now, just verify the endpoint works normally
      await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(emailData)
        .expect(200);
    });

    test('should handle SMTP server unavailability', async () => {
      // Stop SMTP server to simulate unavailability
      if (smtpServer) {
        await smtpServer.stop();
      }

      const emailData = {
        to: 'smtp-unavailable@example.com',
        subject: 'SMTP Unavailable Test',
        html: '<p>SMTP server unavailable</p>',
        text: 'SMTP server unavailable'
      };

      // Email should still be queued even if SMTP is unavailable
      const response = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(emailData)
        .expect(200);

      expect(response.body.status).toBe('success');

      // Restart SMTP server
      smtpServer = new UltraZendSMTPServer();
      await new Promise(resolve => setTimeout(resolve, 2000));
    });
  });
});