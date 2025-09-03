import { EmailService } from '../../services/emailService';
import { SMTPDeliveryService } from '../../services/smtpDelivery';
import { testUtils, createTestUser } from '../setup';
import { logger } from '../../config/logger';

// Mock dependencies
jest.mock('../../services/smtpDelivery');
jest.mock('../../services/queueService');

const MockSMTPDelivery = SMTPDeliveryService as jest.MockedClass<typeof SMTPDeliveryService>;

describe('EmailService Unit Tests', () => {
  let emailService: EmailService;
  let mockSMTPDelivery: jest.Mocked<SMTPDeliveryService>;
  let testUser: any;
  let testDb: any;

  beforeAll(async () => {
    testUser = await createTestUser({
      email: 'emailservice-test@example.com',
      is_verified: true
    });
    
    testDb = testUtils.getTestDb();
  });

  beforeEach(() => {
    // Create mocked SMTP delivery
    mockSMTPDelivery = {
      deliverEmail: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'test-message-id',
        response: '250 OK'
      })
    } as any;
    
    // Create EmailService instance
    emailService = new EmailService();
    
    // Replace the internal SMTP delivery service with our mock
    (emailService as any).smtpDelivery = mockSMTPDelivery;
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.destroy();
    }
    await testUtils.cleanupTestData();
  });

  describe('sendVerificationEmail', () => {
    test('should send verification email with correct structure', async () => {
      const email = 'test@example.com';
      const name = 'Test User';
      const token = 'a'.repeat(64);
      
      await emailService.sendVerificationEmail(email, name, token);
      
      expect(mockSMTPDelivery.deliverEmail).toHaveBeenCalledTimes(1);
      
      const emailCall = mockSMTPDelivery.deliverEmail.mock.calls[0][0];
      expect(emailCall.to).toBe(email);
      expect(emailCall.subject).toBe('Verifique seu email - UltraZend');
      expect(emailCall.from).toContain('noreply@');
    });

    test('should include verification URL in email content', async () => {
      const email = 'test@example.com';
      const name = 'Test User';
      const token = 'b'.repeat(64);
      
      await emailService.sendVerificationEmail(email, name, token);
      
      const emailCall = mockSMTPDelivery.deliverEmail.mock.calls[0][0];
      const expectedUrl = process.env.FRONTEND_URL || 'https://www.ultrazend.com.br';
      
      expect(emailCall.html).toContain(`${expectedUrl}/verify-email?token=${token}`);
      expect(emailCall.text).toContain(`${expectedUrl}/verify-email?token=${token}`);
    });

    test('should personalize email with user name', async () => {
      const email = 'test@example.com';
      const name = 'João Silva';
      const token = 'c'.repeat(64);
      
      await emailService.sendVerificationEmail(email, name, token);
      
      const emailCall = mockSMTPDelivery.deliverEmail.mock.calls[0][0];
      
      expect(emailCall.html).toContain(name);
      expect(emailCall.text).toContain(name);
    });

    test('should handle delivery failures gracefully', async () => {
      mockSMTPDelivery.deliverEmail.mockRejectedValueOnce(new Error('SMTP delivery failed'));
      
      const email = 'test@example.com';
      const name = 'Test User';
      const token = 'd'.repeat(64);
      
      await expect(emailService.sendVerificationEmail(email, name, token))
        .rejects.toThrow('SMTP delivery failed');
    });
  });

  describe('processEmailJob', () => {
    test('should process email job successfully', async () => {
      const jobData = {
        emailId: 'test-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test message</p>',
        text: 'Test message',
        trackingEnabled: false
      };
      
      const result = await emailService.processEmailJob(jobData);
      
      expect(result.success).toBe(true);
      expect(result.emailId).toBe(jobData.emailId);
      expect(mockSMTPDelivery.deliverEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: jobData.from,
          to: jobData.to,
          subject: jobData.subject,
          html: jobData.html,
          text: jobData.text
        })
      );
    });

    test('should validate recipients before sending', async () => {
      const jobData = {
        emailId: 'test-invalid-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'invalid-email-format',
        subject: 'Test Email',
        html: '<p>Test message</p>',
        text: 'Test message'
      };
      
      await expect(emailService.processEmailJob(jobData))
        .rejects.toThrow(/Invalid recipient email/);
    });

    test('should process template with variables', async () => {
      const template = {
        html: '<h1>Hello {{name}}!</h1>',
        text: 'Hello {{name}}!'
      };
      
      const jobData = {
        emailId: 'test-template-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'recipient@example.com',
        subject: 'Welcome {{name}}!',
        html: template.html,
        text: template.text,
        template,
        variables: { name: 'John Doe' },
        trackingEnabled: false
      };
      
      const result = await emailService.processEmailJob(jobData);
      
      expect(result.success).toBe(true);
      
      const emailCall = mockSMTPDelivery.deliverEmail.mock.calls[0][0];
      expect(emailCall.html).toContain('Hello John Doe!');
      expect(emailCall.text).toContain('Hello John Doe!');
    });

    test('should add tracking pixel when tracking is enabled', async () => {
      const jobData = {
        emailId: 'test-tracking-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test message</p>',
        text: 'Test message',
        trackingEnabled: true
      };
      
      const result = await emailService.processEmailJob(jobData);
      
      expect(result.success).toBe(true);
      
      const emailCall = mockSMTPDelivery.deliverEmail.mock.calls[0][0];
      expect(emailCall.html).toContain('<img'); // Tracking pixel
    });

    test('should handle SMTP delivery errors', async () => {
      mockSMTPDelivery.deliverEmail.mockRejectedValueOnce(new Error('SMTP error'));
      
      const jobData = {
        emailId: 'test-error-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test message</p>',
        text: 'Test message'
      };
      
      await expect(emailService.processEmailJob(jobData))
        .rejects.toThrow('SMTP error');
    });
  });

  describe('processBatchEmailJob', () => {
    test('should process batch of emails successfully', async () => {
      const emails = [
        {
          emailId: 'batch-1',
          from: 'sender@ultrazend.com.br',
          to: 'recipient1@example.com',
          subject: 'Batch Email 1',
          html: '<p>Batch email 1</p>',
          text: 'Batch email 1'
        },
        {
          emailId: 'batch-2',
          from: 'sender@ultrazend.com.br',
          to: 'recipient2@example.com',
          subject: 'Batch Email 2',
          html: '<p>Batch email 2</p>',
          text: 'Batch email 2'
        }
      ];
      
      const jobData = {
        batchId: 'test-batch-123',
        emails,
        trackingEnabled: false
      };
      
      const result = await emailService.processBatchEmailJob(jobData);
      
      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockSMTPDelivery.deliverEmail).toHaveBeenCalledTimes(2);
    });

    test('should handle partial failures in batch', async () => {
      // Mock first email to succeed, second to fail
      mockSMTPDelivery.deliverEmail
        .mockResolvedValueOnce({
          messageId: 'msg-1',
          response: '250 OK'
        } as any)
        .mockRejectedValueOnce(new Error('SMTP error'));
      
      const emails = [
        {
          emailId: 'batch-1',
          from: 'sender@ultrazend.com.br',
          to: 'recipient1@example.com',
          subject: 'Batch Email 1',
          html: '<p>Batch email 1</p>',
          text: 'Batch email 1'
        },
        {
          emailId: 'batch-2',
          from: 'sender@ultrazend.com.br',
          to: 'recipient2@example.com',
          subject: 'Batch Email 2',
          html: '<p>Batch email 2</p>',
          text: 'Batch email 2'
        }
      ];
      
      const jobData = {
        batchId: 'test-batch-partial-123',
        emails,
        trackingEnabled: false
      };
      
      const result = await emailService.processBatchEmailJob(jobData);
      
      expect(result.success).toBe(true);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    test('should process emails in batches to avoid overload', async () => {
      const largeEmailList = Array.from({ length: 25 }, (_, i) => ({
        emailId: `batch-large-${i}`,
        from: 'sender@ultrazend.com.br',
        to: `recipient${i}@example.com`,
        subject: `Batch Email ${i}`,
        html: `<p>Batch email ${i}</p>`,
        text: `Batch email ${i}`
      }));
      
      const jobData = {
        batchId: 'test-batch-large-123',
        emails: largeEmailList,
        trackingEnabled: false
      };
      
      const result = await emailService.processBatchEmailJob(jobData);
      
      expect(result.success).toBe(true);
      expect(result.processed).toBe(25);
      expect(result.successful).toBe(25);
      expect(mockSMTPDelivery.deliverEmail).toHaveBeenCalledTimes(25);
    });
  });

  describe('Email Validation', () => {
    test('should validate email addresses correctly', async () => {
      const validEmails = [
        'user@example.com',
        'test.email+tag@domain.co.uk',
        'user123@sub.domain.org'
      ];
      
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..name@domain.com'
      ];
      
      // Test valid emails
      for (const email of validEmails) {
        await expect((emailService as any).validateRecipients(email))
          .resolves.not.toThrow();
      }
      
      // Test invalid emails
      for (const email of invalidEmails) {
        await expect((emailService as any).validateRecipients(email))
          .rejects.toThrow();
      }
    });

    test('should validate multiple recipients', async () => {
      const validRecipients = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com'
      ];
      
      await expect((emailService as any).validateRecipients(validRecipients))
        .resolves.not.toThrow();
      
      const mixedRecipients = [
        'valid@example.com',
        'invalid-email',
        'another-valid@example.com'
      ];
      
      await expect((emailService as any).validateRecipients(mixedRecipients))
        .rejects.toThrow();
    });
  });

  describe('Connection Testing', () => {
    test('should test SMTP connection successfully', async () => {
      // Mock transporter verify method
      const mockVerify = jest.fn().mockResolvedValue(true);
      (emailService as any).transporter = { verify: mockVerify };
      
      const result = await emailService.testConnection();
      
      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    test('should handle connection test failures', async () => {
      // Mock transporter verify method to fail
      const mockVerify = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (emailService as any).transporter = { verify: mockVerify };
      
      const result = await emailService.testConnection();
      
      expect(result).toBe(false);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Logging', () => {
    test('should log errors appropriately', async () => {
      const logSpy = jest.spyOn(logger, 'error').mockImplementation();
      
      mockSMTPDelivery.deliverEmail.mockRejectedValueOnce(
        new Error('Test error for logging')
      );
      
      const jobData = {
        emailId: 'test-logging-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'recipient@example.com',
        subject: 'Logging Test',
        html: '<p>Error logging test</p>',
        text: 'Error logging test'
      };
      
      try {
        await emailService.processEmailJob(jobData);
      } catch (error) {
        // Expected to fail
      }
      
      expect(logSpy).toHaveBeenCalledWith(
        'Erro ao processar job de email:',
        expect.any(Error)
      );
      
      logSpy.mockRestore();
    });

    test('should handle missing email data gracefully', async () => {
      const incompleteJobData = {
        emailId: 'test-incomplete-123',
        userId: testUser.id,
        // Missing required fields like from, to, subject
      };
      
      await expect(emailService.processEmailJob(incompleteJobData as any))
        .rejects.toThrow();
    });
  });

  describe('Performance', () => {
    test('should complete email processing within reasonable time', async () => {
      const jobData = {
        emailId: 'test-performance-123',
        userId: testUser.id,
        from: 'sender@ultrazend.com.br',
        to: 'recipient@example.com',
        subject: 'Performance Test',
        html: '<p>Performance test email</p>',
        text: 'Performance test email'
      };
      
      const startTime = Date.now();
      await emailService.processEmailJob(jobData);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('should handle concurrent email processing', async () => {
      const emailPromises = [];
      const concurrentEmails = 5;
      
      for (let i = 0; i < concurrentEmails; i++) {
        const jobData = {
          emailId: `concurrent-${i}`,
          userId: testUser.id,
          from: 'sender@ultrazend.com.br',
          to: `recipient${i}@example.com`,
          subject: `Concurrent Test ${i}`,
          html: `<p>Concurrent email test ${i}</p>`,
          text: `Concurrent email test ${i}`
        };
        
        emailPromises.push(emailService.processEmailJob(jobData));
      }
      
      const results = await Promise.allSettled(emailPromises);
      const successful = results.filter(r => r.status === 'fulfilled');
      
      expect(successful.length).toBe(concurrentEmails);
    });
  });

  describe('Memory Management', () => {
    test('should maintain stable memory usage during processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process multiple emails
      const emailPromises = [];
      for (let i = 0; i < 20; i++) {
        const jobData = {
          emailId: `memory-${i}`,
          userId: testUser.id,
          from: 'sender@ultrazend.com.br',
          to: `recipient${i}@example.com`,
          subject: `Memory Test ${i}`,
          html: '<p>' + 'Large content '.repeat(50) + '</p>',
          text: 'Large content '.repeat(50)
        };
        
        emailPromises.push(emailService.processEmailJob(jobData));
      }
      
      await Promise.all(emailPromises);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePerEmail = memoryIncrease / 20;
      
      // Memory increase should be reasonable (less than 1MB per email)
      expect(memoryIncreasePerEmail).toBeLessThan(1024 * 1024);
    });
  });
});