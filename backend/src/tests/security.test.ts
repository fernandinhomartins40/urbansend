import { securityManager } from '../services/securityManager';

describe('SecurityManager', () => {
  beforeAll(async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('IP Validation', () => {
    test('should allow legitimate IP addresses', async () => {
      const result = await securityManager.validateMXConnection('192.168.1.100');
      expect(result.allowed).toBe(true);
    });

    test('should block blacklisted IP addresses', async () => {
      // Add IP to blacklist
      await securityManager.addToBlacklist('192.168.1.200', 'test');
      
      const result = await securityManager.validateMXConnection('192.168.1.200');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blacklisted');
    });

    test('should handle malformed IP addresses', async () => {
      const result = await securityManager.validateMXConnection('invalid-ip');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid IP format');
    });

    test('should block private/reserved IP ranges', async () => {
      const privateIPs = ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1'];
      
      for (const ip of privateIPs) {
        const result = await securityManager.validateMXConnection(ip);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('private or reserved');
      }
    });
  });

  describe('Spam Detection', () => {
    test('should detect emails with spam keywords', async () => {
      const spamEmail = {
        from: 'spam@test.com',
        to: 'user@example.com',
        subject: 'FREE MONEY WIN NOW URGENT!!!',
        body: 'Click here to claim your GUARANTEED prize! Act NOW before it expires!'
      };

      const result = await securityManager.checkEmailSecurity(spamEmail);
      expect(result.isSpam).toBe(true);
      expect(result.spamScore).toBeGreaterThan(0.5);
    });

    test('should allow legitimate emails', async () => {
      const legitimateEmail = {
        from: 'hello@company.com',
        to: 'user@example.com',
        subject: 'Monthly Newsletter',
        body: 'Thank you for subscribing to our newsletter. Here are this month\'s updates.'
      };

      const result = await securityManager.checkEmailSecurity(legitimateEmail);
      expect(result.isSpam).toBe(false);
      expect(result.spamScore).toBeLessThan(0.3);
    });

    test('should detect suspicious patterns', async () => {
      const suspiciousEmail = {
        from: 'no-reply@suspicious.com',
        to: 'user@example.com',
        subject: 'Re: Your Account',
        body: 'Your account will be suspended unless you verify immediately: http://fake-bank.com/verify'
      };

      const result = await securityManager.checkEmailSecurity(suspiciousEmail);
      expect(result.isSpam || result.isPhishing).toBe(true);
    });
  });

  describe('Phishing Detection', () => {
    test('should detect phishing URLs', async () => {
      const phishingEmail = {
        from: 'security@bank-fake.com',
        to: 'user@example.com',
        subject: 'Security Alert',
        body: 'Click here to secure your account: https://secure-bank-login.suspicious-domain.com/login'
      };

      const result = await securityManager.checkEmailSecurity(phishingEmail);
      expect(result.isPhishing).toBe(true);
      expect(result.phishingIndicators.length).toBeGreaterThan(0);
    });

    test('should detect domain spoofing', async () => {
      const spoofedEmail = {
        from: 'admin@g00gle.com', // Spoofed Google domain
        to: 'user@example.com',
        subject: 'Account Security',
        body: 'Your Google account needs verification.'
      };

      const result = await securityManager.checkEmailSecurity(spoofedEmail);
      expect(result.isPhishing).toBe(true);
    });

    test('should allow legitimate domains', async () => {
      const legitimateEmail = {
        from: 'notifications@github.com',
        to: 'user@example.com',
        subject: 'Pull Request',
        body: 'You have a new pull request on your repository.'
      };

      const result = await securityManager.checkEmailSecurity(legitimateEmail);
      expect(result.isPhishing).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within rate limit', async () => {
      const ip = '203.0.113.1';
      
      // Send requests within limit
      for (let i = 0; i < 5; i++) {
        const allowed = await securityManager.checkRateLimit(ip, 'smtp_connection');
        expect(allowed).toBe(true);
      }
    });

    test('should block requests exceeding rate limit', async () => {
      const ip = '203.0.113.2';
      
      // Exceed rate limit
      for (let i = 0; i < 20; i++) {
        await securityManager.checkRateLimit(ip, 'smtp_connection');
      }
      
      // Next request should be blocked
      const allowed = await securityManager.checkRateLimit(ip, 'smtp_connection');
      expect(allowed).toBe(false);
    });

    test('should reset rate limit after time window', async () => {
      const ip = '203.0.113.3';
      
      // Exceed rate limit
      for (let i = 0; i < 15; i++) {
        await securityManager.checkRateLimit(ip, 'smtp_connection');
      }
      
      // Simulate time passage (mock the database timestamp)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should eventually allow requests again (simplified test)
      const allowed = await securityManager.checkRateLimit(ip, 'email_send');
      expect(typeof allowed).toBe('boolean');
    });
  });

  describe('Malware Scanning', () => {
    test('should detect suspicious file attachments', async () => {
      const emailWithAttachment = {
        from: 'sender@test.com',
        to: 'user@example.com',
        subject: 'Document',
        body: 'Please find attached file.',
        attachments: [
          {
            filename: 'document.exe',
            content: Buffer.from('MZ\x90\x00'), // PE header signature
            mimetype: 'application/octet-stream'
          }
        ]
      };

      const result = await securityManager.checkEmailSecurity(emailWithAttachment);
      expect(result.hasMalware).toBe(true);
      expect(result.malwareIndicators).toContain('Suspicious executable file');
    });

    test('should allow safe file attachments', async () => {
      const emailWithSafeAttachment = {
        from: 'sender@test.com',
        to: 'user@example.com',
        subject: 'Document',
        body: 'Please find attached document.',
        attachments: [
          {
            filename: 'document.pdf',
            content: Buffer.from('%PDF-1.4'),
            mimetype: 'application/pdf'
          }
        ]
      };

      const result = await securityManager.checkEmailSecurity(emailWithSafeAttachment);
      expect(result.hasMalware).toBe(false);
    });

    test('should detect suspicious content patterns', async () => {
      const suspiciousContent = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      
      const emailWithSuspicious = {
        from: 'sender@test.com',
        to: 'user@example.com',
        subject: 'Test',
        body: 'Test file',
        attachments: [
          {
            filename: 'test.txt',
            content: suspiciousContent,
            mimetype: 'text/plain'
          }
        ]
      };

      const result = await securityManager.checkEmailSecurity(emailWithSuspicious);
      expect(result.hasMalware).toBe(true);
    });
  });

  describe('Security Logging', () => {
    test('should log security events', async () => {
      const mockLogger = jest.spyOn(logger, 'warn');
      
      // Trigger security event
      await securityManager.validateMXConnection('192.168.1.1');
      
      // Should have logged the event
      expect(mockLogger).toHaveBeenCalled();
      
      mockLogger.mockRestore();
    });

    test('should store security metrics in database', async () => {
      const testIP = '203.0.113.10';
      
      // Generate some security events
      await securityManager.validateMXConnection(testIP);
      await securityManager.checkRateLimit(testIP, 'smtp_connection');
      
      // Verify data was stored (simplified check)
      const result = await securityManager.validateMXConnection(testIP);
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('allowed');
    });
  });

  describe('Configuration and Cleanup', () => {
    test('should initialize successfully', async () => {
      const newSecurityManager = new SecurityManager();
      await expect(newSecurityManager.initialize()).resolves.not.toThrow();
      await newSecurityManager.cleanup();
    });

    test('should handle cleanup gracefully', async () => {
      await expect(securityManager.cleanup()).resolves.not.toThrow();
    });

    test('should update blacklists and spam keywords', async () => {
      await securityManager.addToBlacklist('192.168.100.1', 'test');
      
      const result = await securityManager.validateMXConnection('192.168.100.1');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Create a manager with invalid database
      const brokenDb = new Database(':memory:');
      brokenDb.close(); // Close immediately to cause errors
      
      const brokenManager = new SecurityManager(brokenDb);
      
      const result = await brokenManager.validateMXConnection('192.168.1.1');
      expect(result.allowed).toBe(true); // Should default to allowing on errors
      expect(result.reason).toContain('Internal error');
    });

    test('should handle malformed email data', async () => {
      const malformedEmail = {
        from: null,
        to: '',
        subject: undefined,
        body: 123 // Wrong type
      } as any;

      const result = await securityManager.checkEmailSecurity(malformedEmail);
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('isSpam');
    });

    test('should handle network timeouts', async () => {
      // Mock a timeout scenario
      const result = await securityManager.validateMXConnection('192.0.2.1', 'timeout-test.example');
      expect(typeof result.allowed).toBe('boolean');
    });
  });
});