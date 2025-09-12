/**
 * 🧪 TESTES UNITÁRIOS - UNIFIED EMAIL SERVICE
 * Versão: 1.0.0 - Testes Robustos e Completos
 */

import { UnifiedEmailService } from './EmailService';
import { EmailData, EmailContext, EmailQuotas } from './types';
import { logger } from '../config/logger';

// Mock dependencies
jest.mock('../config/logger');
jest.mock('../config/database');
jest.mock('../services/smtpDelivery');
jest.mock('../utils/crypto');
jest.mock('../middleware/validation');

describe('UnifiedEmailService', () => {
  let emailService: UnifiedEmailService;
  let mockEmailData: EmailData;
  let mockContext: EmailContext;

  beforeEach(() => {
    emailService = new UnifiedEmailService({ enableMetrics: true });
    
    mockEmailData = {
      from: 'test@example.com',
      to: 'recipient@example.com',
      subject: 'Test Email',
      html: '<p>Test HTML content</p>',
      text: 'Test text content'
    };

    mockContext = {
      userId: 1,
      permissions: ['email:send'],
      quotas: {
        dailyLimit: 1000,
        dailyUsed: 10,
        hourlyLimit: 100,
        hourlyUsed: 5,
        monthlyLimit: 10000,
        monthlyUsed: 500
      } as EmailQuotas
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      // Mock SMTP delivery success
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockResolvedValue(true);

      // Mock crypto
      const mockCrypto = require('../utils/crypto');
      mockCrypto.generateTrackingId = jest.fn().mockReturnValue('test-tracking-id');

      // Mock database
      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        insert: jest.fn().mockResolvedValue([123])
      }));

      // Mock validation
      const mockValidation = require('../middleware/validation');
      mockValidation.sanitizeEmailHtml = jest.fn().mockReturnValue('<p>Test HTML content</p>');

      const result = await emailService.sendEmail(mockEmailData, mockContext);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-tracking-id');
      expect(result.trackingId).toBe('test-tracking-id');
      expect(typeof result.latency).toBe('number');
    });

    it('should fail with invalid email data', async () => {
      const invalidEmailData = {
        from: '', // Invalid: empty string
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>'
      } as EmailData;

      const result = await emailService.sendEmail(invalidEmailData, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should fail when daily quota exceeded', async () => {
      const contextWithExceededQuota = {
        ...mockContext,
        quotas: {
          ...mockContext.quotas,
          dailyUsed: 1000,
          dailyLimit: 1000
        }
      };

      const result = await emailService.sendEmail(mockEmailData, contextWithExceededQuota);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Daily quota exceeded');
    });

    it('should fail when hourly quota exceeded', async () => {
      const contextWithExceededQuota = {
        ...mockContext,
        quotas: {
          ...mockContext.quotas,
          hourlyUsed: 100,
          hourlyLimit: 100
        }
      };

      const result = await emailService.sendEmail(mockEmailData, contextWithExceededQuota);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hourly quota exceeded');
    });

    it('should handle SMTP delivery failure gracefully', async () => {
      // Mock SMTP delivery failure
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockRejectedValue(
        new Error('SMTP connection failed')
      );

      // Mock crypto
      const mockCrypto = require('../utils/crypto');
      mockCrypto.generateTrackingId = jest.fn().mockReturnValue('test-tracking-id');

      // Mock database for failure recording
      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        insert: jest.fn().mockResolvedValue([123])
      }));

      const result = await emailService.sendEmail(mockEmailData, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP connection failed');
      expect(typeof result.latency).toBe('number');
    });

    it('should validate required fields', async () => {
      const testCases = [
        { field: 'from', value: '', error: 'from: must be a valid non-empty string' },
        { field: 'to', value: '', error: 'to: must be a valid string or array of strings' },
        { field: 'subject', value: '', error: 'subject: must be a valid non-empty string' },
        { field: 'content', value: { html: undefined, text: undefined }, error: 'content: must provide either html or text content' }
      ];

      for (const testCase of testCases) {
        const invalidData = { ...mockEmailData };
        
        if (testCase.field === 'content') {
          delete invalidData.html;
          delete invalidData.text;
        } else {
          (invalidData as any)[testCase.field] = testCase.value;
        }

        const result = await emailService.sendEmail(invalidData, mockContext);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain(testCase.error);
      }
    });

    it('should handle array of recipients', async () => {
      const emailDataWithMultipleRecipients = {
        ...mockEmailData,
        to: ['recipient1@example.com', 'recipient2@example.com']
      };

      // Mock SMTP delivery success
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockResolvedValue(true);

      // Mock crypto
      const mockCrypto = require('../utils/crypto');
      mockCrypto.generateTrackingId = jest.fn().mockReturnValue('test-tracking-id');

      // Mock database
      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        insert: jest.fn().mockResolvedValue([123])
      }));

      const result = await emailService.sendEmail(emailDataWithMultipleRecipients, mockContext);

      expect(result.success).toBe(true);
      expect(mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['recipient1@example.com', 'recipient2@example.com']
        })
      );
    });
  });

  describe('testConnection', () => {
    it('should return true when SMTP connection is successful', async () => {
      // Mock SMTP delivery success
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockResolvedValue(true);

      const result = await emailService.testConnection();

      expect(result).toBe(true);
      expect(mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@ultrazend.com.br',
          to: 'test@ultrazend.com.br',
          subject: 'Test Connection - UnifiedEmailService'
        })
      );
    });

    it('should return false when SMTP connection fails', async () => {
      // Mock SMTP delivery failure
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockRejectedValue(
        new Error('Connection timeout')
      );

      const result = await emailService.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getServiceStats', () => {
    it('should return service statistics', async () => {
      // Mock database query
      const mockDb = require('../config/database');
      const mockStats = {
        total_emails: 100,
        sent_count: 95,
        failed_count: 5,
        avg_latency: 1500,
        unique_users: 10
      };

      mockDb.default = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockStats)
      }));

      const result = await emailService.getServiceStats();

      expect(result).toEqual({
        date: expect.any(String),
        ...mockStats,
        success_rate: '95.00%'
      });
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      }));

      const result = await emailService.getServiceStats();

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should log errors appropriately', async () => {
      // Mock SMTP delivery failure
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockRejectedValue(
        new Error('SMTP server unavailable')
      );

      await emailService.sendEmail(mockEmailData, mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        'Email sending failed',
        expect.objectContaining({
          error: 'SMTP server unavailable'
        })
      );
    });

    it('should record failed emails in database', async () => {
      // Mock SMTP delivery failure
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockRejectedValue(
        new Error('Network timeout')
      );

      // Mock database
      const mockInsert = jest.fn().mockResolvedValue([123]);
      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        insert: mockInsert
      }));

      await emailService.sendEmail(mockEmailData, mockContext);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Network timeout'
        })
      );
    });
  });

  describe('metrics collection', () => {
    it('should record metrics when enabled', async () => {
      emailService = new UnifiedEmailService({ enableMetrics: true });

      // Mock SMTP delivery success
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockResolvedValue(true);

      // Mock database
      const mockInsert = jest.fn().mockResolvedValue([123]);
      const mockOnConflict = jest.fn().mockReturnThis();
      const mockMerge = jest.fn().mockResolvedValue([1]);

      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        insert: mockInsert,
        onConflict: mockOnConflict,
        merge: mockMerge
      }));

      await emailService.sendEmail(mockEmailData, mockContext);

      expect(mockInsert).toHaveBeenCalledTimes(2); // emails table + metrics table
    });

    it('should not fail if metrics recording fails', async () => {
      emailService = new UnifiedEmailService({ enableMetrics: true });

      // Mock SMTP delivery success
      const mockSMTPDelivery = require('../services/smtpDelivery');
      mockSMTPDelivery.SMTPDeliveryService.prototype.deliverEmail = jest.fn().mockResolvedValue(true);

      // Mock database - emails table success, metrics table failure
      let callCount = 0;
      const mockDb = require('../config/database');
      mockDb.default = jest.fn(() => ({
        insert: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve([123]); // emails table success
          } else {
            return Promise.reject(new Error('Metrics table error')); // metrics table failure
          }
        }),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis()
      }));

      const result = await emailService.sendEmail(mockEmailData, mockContext);

      expect(result.success).toBe(true); // Should succeed despite metrics failure
    });
  });
});

// Integration test helper
export const createTestEmailContext = (overrides: Partial<EmailContext> = {}): EmailContext => {
  return {
    userId: 1,
    permissions: ['email:send'],
    quotas: {
      dailyLimit: 1000,
      dailyUsed: 0,
      hourlyLimit: 100,
      hourlyUsed: 0,
      monthlyLimit: 10000,
      monthlyUsed: 0
    },
    ...overrides
  };
};

export const createTestEmailData = (overrides: Partial<EmailData> = {}): EmailData => {
  return {
    from: 'test@example.com',
    to: 'recipient@example.com',
    subject: 'Test Email',
    html: '<p>Test content</p>',
    text: 'Test content',
    ...overrides
  };
};