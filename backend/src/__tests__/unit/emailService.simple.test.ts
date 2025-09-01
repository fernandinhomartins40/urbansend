import { EmailService } from '../../services/emailService';
import { SMTPDeliveryService } from '../../services/smtpDelivery';

// Mock dependencies
jest.mock('../../services/smtpDelivery');
jest.mock('../../services/queueService');

const MockSMTPDelivery = SMTPDeliveryService as jest.MockedClass<typeof SMTPDeliveryService>;

describe('EmailService Simple Unit Tests', () => {
  let emailService: EmailService;
  let mockSMTPDelivery: jest.Mocked<SMTPDeliveryService>;

  beforeEach(() => {
    // Create mocked SMTP delivery
    mockSMTPDelivery = {
      deliverEmail: jest.fn().mockResolvedValue({
        messageId: 'test-message-id',
        response: '250 OK'
      })
    } as any;
    
    // Create EmailService instance
    emailService = new EmailService();
    
    // Replace the internal SMTP delivery service with our mock
    (emailService as any).smtpDelivery = mockSMTPDelivery;
  });

  describe('sendVerificationEmail', () => {
    test('should call SMTP delivery with correct parameters', async () => {
      const email = 'test@example.com';
      const name = 'Test User';
      const token = 'a'.repeat(64);
      
      await emailService.sendVerificationEmail(email, name, token);
      
      expect(mockSMTPDelivery.deliverEmail).toHaveBeenCalledTimes(1);
      
      const callArgs = mockSMTPDelivery.deliverEmail.mock.calls[0][0];
      expect(callArgs.to).toBe(email);
      expect(callArgs.subject).toBe('Verifique seu email - UltraZend');
      expect(callArgs.from).toContain('noreply@');
      expect(callArgs.html).toContain(name);
      expect(callArgs.text).toContain(name);
    });

    test('should handle SMTP delivery errors', async () => {
      mockSMTPDelivery.deliverEmail.mockRejectedValueOnce(new Error('SMTP error'));
      
      const email = 'test@example.com';
      const name = 'Test User';
      const token = 'a'.repeat(64);
      
      await expect(emailService.sendVerificationEmail(email, name, token))
        .rejects.toThrow('SMTP error');
    });
  });

  describe('processEmailJob', () => {
    test('should process basic email job successfully', async () => {
      const jobData = {
        emailId: 'test-123',
        userId: 1,
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
          subject: jobData.subject
        })
      );
    });

    test('should validate recipients', async () => {
      const jobData = {
        emailId: 'test-invalid',
        userId: 1,
        from: 'sender@ultrazend.com.br',
        to: 'invalid-email',
        subject: 'Test Email',
        html: '<p>Test message</p>',
        text: 'Test message'
      };
      
      await expect(emailService.processEmailJob(jobData))
        .rejects.toThrow(/Invalid recipient email/);
    });

    test('should handle SMTP errors', async () => {
      mockSMTPDelivery.deliverEmail.mockRejectedValueOnce(new Error('SMTP error'));
      
      const jobData = {
        emailId: 'test-error',
        userId: 1,
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

  describe('testConnection', () => {
    test('should return true for successful connection', async () => {
      const mockVerify = jest.fn().mockResolvedValue(true);
      (emailService as any).transporter = { verify: mockVerify };
      
      const result = await emailService.testConnection();
      
      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    test('should return false for failed connection', async () => {
      const mockVerify = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (emailService as any).transporter = { verify: mockVerify };
      
      const result = await emailService.testConnection();
      
      expect(result).toBe(false);
    });
  });
});