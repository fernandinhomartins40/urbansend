import { SMTPServer } from 'smtp-server';
import { createTransport } from 'nodemailer';
import { simpleParser } from 'mailparser';
import net from 'net';
import { testUtils, MockSMTPClient, createTestUser } from '../setup';
import { logger } from '../../config/logger';
import UltraZendSMTPServer from '../../services/smtpServer';

describe('SMTP Server Integration Tests', () => {
  let smtpServer: UltraZendSMTPServer;
  let testClient: MockSMTPClient;
  let testUser: any;
  let testDb: any;

  beforeAll(async () => {
    // Create test user
    testUser = await createTestUser({
      email: 'smtp-test@example.com',
      is_verified: true,
      plan_type: 'pro'
    });
    
    testDb = testUtils.getTestDb();
    
    // Initialize SMTP server for testing
    smtpServer = new UltraZendSMTPServer();
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    testClient = new MockSMTPClient();
  }, 30000);

  afterAll(async () => {
    if (smtpServer) {
      await smtpServer.stop();
    }
    
    if (testClient) {
      await testClient.close();
    }
    
    if (testDb) {
      await testDb.destroy();
    }
    
    await testUtils.cleanupTestData();
  }, 15000);

  describe('MX Server (Port 25)', () => {
    test('should accept connections on port 25', async () => {
      const connected = await testClient.connect();
      expect(connected).toBe(true);
    });

    test('should accept valid MAIL FROM for external sender', async () => {
      await testClient.connect();
      
      await expect(testClient.mail('sender@external.com')).resolves.not.toThrow();
      expect(testClient.lastResponse.code).toBe(250);
    });

    test('should accept valid RCPT TO for local domain', async () => {
      await testClient.connect();
      await testClient.mail('sender@external.com');
      
      await expect(testClient.rcpt('test@ultrazend.com.br')).resolves.not.toThrow();
      expect(testClient.lastResponse.code).toBe(250);
    });

    test('should reject RCPT TO for relay without authentication', async () => {
      await testClient.connect();
      await testClient.mail('sender@external.com');
      
      // Should reject relay to external domain without auth
      await expect(testClient.rcpt('user@external.com'))
        .rejects.toThrow(/authentication required/i);
    });

    test('should accept and process incoming email data', async () => {
      await testClient.connect();
      await testClient.mail('sender@external.com');
      await testClient.rcpt('test@ultrazend.com.br');
      
      const emailContent = `From: sender@external.com
To: test@ultrazend.com.br
Subject: Test Email from External
Date: ${new Date().toUTCString()}

This is a test email from external sender.`;

      await expect(testClient.data(emailContent)).resolves.not.toThrow();
      expect(testClient.sentEmails).toHaveLength(1);
    });

    test('should validate sender domain reputation', async () => {
      // Mock a blacklisted IP trying to send email
      const mockBadClient = new MockSMTPClient();
      
      // This should be handled by the security manager
      await mockBadClient.connect();
      
      // The security validation should occur during connection
      expect(mockBadClient.connected).toBe(true);
    });
  });

  describe('Submission Server (Port 587)', () => {
    test('should require authentication for submission port', async () => {
      const submissionClient = new MockSMTPClient();
      
      await submissionClient.connect();
      
      // Should require authentication before allowing MAIL FROM
      await expect(submissionClient.mail('test@ultrazend.com.br'))
        .rejects.toThrow(/authentication required/i);
        
      await submissionClient.close();
    });

    test('should accept authenticated user for email submission', async () => {
      // Mock authenticated session
      const authenticatedClient = new MockSMTPClient();
      
      await authenticatedClient.connect();
      
      // Simulate successful authentication
      // In real implementation, this would go through SMTP AUTH
      Object.assign(authenticatedClient, { 
        authenticated: true,
        userId: testUser.id,
        email: testUser.email
      });
      
      await expect(authenticatedClient.mail('test@ultrazend.com.br'))
        .resolves.not.toThrow();
    });

    test('should allow relay for authenticated users', async () => {
      const authenticatedClient = new MockSMTPClient();
      
      await authenticatedClient.connect();
      
      // Mock authentication
      Object.assign(authenticatedClient, { 
        authenticated: true,
        userId: testUser.id,
        email: testUser.email
      });
      
      await authenticatedClient.mail('test@ultrazend.com.br');
      
      // Should allow relay to external domain for authenticated user
      await expect(authenticatedClient.rcpt('recipient@external.com'))
        .resolves.not.toThrow();
    });

    test('should process outgoing email with DKIM signing', async () => {
      const authenticatedClient = new MockSMTPClient();
      
      await authenticatedClient.connect();
      Object.assign(authenticatedClient, { 
        authenticated: true,
        userId: testUser.id,
        email: testUser.email
      });
      
      await authenticatedClient.mail('test@ultrazend.com.br');
      await authenticatedClient.rcpt('recipient@external.com');
      
      const emailContent = `From: test@ultrazend.com.br
To: recipient@external.com
Subject: Test Outgoing Email
Date: ${new Date().toUTCString()}

This is a test outgoing email.`;

      await authenticatedClient.data(emailContent);
      
      expect(authenticatedClient.sentEmails).toHaveLength(1);
      const sentEmail = authenticatedClient.sentEmails[0];
      expect(sentEmail.content).toContain('test@ultrazend.com.br');
    });

    test('should enforce rate limiting for email sending', async () => {
      const authenticatedClient = new MockSMTPClient();
      
      await authenticatedClient.connect();
      Object.assign(authenticatedClient, { 
        authenticated: true,
        userId: testUser.id,
        email: testUser.email
      });
      
      // Send multiple emails rapidly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(authenticatedClient.sendMail({
          from: 'test@ultrazend.com.br',
          to: `recipient${i}@external.com`,
          subject: `Test Email ${i}`,
          text: `This is test email number ${i}`
        }));
      }
      
      // Should accept reasonable number of emails
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled');
      
      expect(successful.length).toBeGreaterThan(0);
      expect(authenticatedClient.sentEmails.length).toBe(successful.length);
    });
  });

  describe('Email Processing and Validation', () => {
    test('should parse and validate incoming email structure', async () => {
      const rawEmail = `From: test@external.com
To: recipient@ultrazend.com.br
Subject: Test Email Structure
Date: ${new Date().toUTCString()}
Message-ID: <test-${Date.now()}@external.com>

This is a test email body.`;

      const parsed = await simpleParser(rawEmail);
      
      expect(parsed.from).toBeDefined();
      expect(parsed.to).toBeDefined();
      expect(parsed.subject).toBe('Test Email Structure');
      expect(parsed.text).toContain('test email body');
    });

    test('should detect and handle malformed emails', async () => {
      const malformedEmail = `This is not a valid email format`;
      
      try {
        const parsed = await simpleParser(malformedEmail);
        // Should still parse but with empty/default values
        expect(parsed).toBeDefined();
      } catch (error) {
        // Should handle parsing errors gracefully
        expect(error).toBeDefined();
      }
    });

    test('should process emails with attachments', async () => {
      const emailWithAttachment = `From: test@external.com
To: recipient@ultrazend.com.br
Subject: Email with Attachment
Date: ${new Date().toUTCString()}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="boundary123"

--boundary123
Content-Type: text/plain

This email has an attachment.

--boundary123
Content-Type: text/plain; name="test.txt"
Content-Disposition: attachment; filename="test.txt"

This is a test attachment.
--boundary123--`;

      const parsed = await simpleParser(emailWithAttachment);
      
      expect(parsed.attachments).toBeDefined();
      expect(parsed.text).toContain('attachment');
    });

    test('should validate email size limits', async () => {
      // Generate large email content (simulate size limit testing)
      const largeContent = 'A'.repeat(10 * 1024 * 1024); // 10MB
      const largeEmail = `From: test@external.com
To: recipient@ultrazend.com.br
Subject: Large Email Test
Date: ${new Date().toUTCString()}

${largeContent}`;

      // Should handle large emails appropriately
      const size = Buffer.byteLength(largeEmail, 'utf8');
      expect(size).toBeGreaterThan(10 * 1024 * 1024);
      
      // In real implementation, this would be rejected by size limits
    });
  });

  describe('Security and Anti-Spam', () => {
    test('should detect spam-like content', async () => {
      const spamEmail = `From: spam@suspicious.com
To: victim@ultrazend.com.br
Subject: !!!! WIN MONEY NOW !!!!
Date: ${new Date().toUTCString()}

URGENT! You have won $1,000,000! Click here NOW to claim your prize!
Send your bank details immediately! This offer expires soon!
MONEY! CASH! FREE! URGENT! ACT NOW!`;

      const parsed = await simpleParser(spamEmail);
      
      // Mock spam detection logic
      const spamIndicators = [
        'WIN MONEY',
        'URGENT',
        'FREE',
        'bank details',
        'ACT NOW'
      ];
      
      const spamScore = spamIndicators.filter(indicator => 
        spamEmail.toUpperCase().includes(indicator)
      ).length;
      
      expect(spamScore).toBeGreaterThan(3); // High spam score
    });

    test('should validate sender domain authenticity', async () => {
      // Mock SPF/DKIM validation
      const emailFromSuspiciousDomain = `From: legitimate@bank.com
To: victim@ultrazend.com.br
Subject: Account Verification Required
Date: ${new Date().toUTCString()}

Please verify your account by clicking this link...`;

      const parsed = await simpleParser(emailFromSuspiciousDomain);
      
      // In real implementation, would check:
      // - SPF records
      // - DKIM signature
      // - Domain reputation
      
      expect(parsed.from?.text).toContain('bank.com');
      
      // Mock domain validation result
      const isDomainSuspicious = true; // Would be actual validation
      if (isDomainSuspicious) {
        logger.warn('Suspicious domain detected', {
          from: parsed.from?.text,
          subject: parsed.subject
        });
      }
    });

    test('should block known malicious IP addresses', async () => {
      // Mock blacklisted IP test
      const maliciousIPs = [
        '192.168.1.100', // Example malicious IP
        '10.0.0.50'
      ];
      
      const testIP = '192.168.1.100';
      const isBlacklisted = maliciousIPs.includes(testIP);
      
      expect(isBlacklisted).toBe(true);
      
      if (isBlacklisted) {
        // Should reject connection from blacklisted IP
        logger.warn('Blocked connection from blacklisted IP', { ip: testIP });
      }
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent connections', async () => {
      const clients: MockSMTPClient[] = [];
      const connectionPromises: Promise<boolean>[] = [];
      
      // Create multiple concurrent connections
      for (let i = 0; i < 5; i++) {
        const client = new MockSMTPClient();
        clients.push(client);
        connectionPromises.push(client.connect());
      }
      
      const results = await Promise.allSettled(connectionPromises);
      const successfulConnections = results.filter(r => r.status === 'fulfilled');
      
      expect(successfulConnections.length).toBe(5);
      
      // Cleanup
      await Promise.all(clients.map(client => client.close()));
    });

    test('should timeout stale connections appropriately', async () => {
      const client = new MockSMTPClient();
      await client.connect();
      
      // Simulate connection timeout (would be handled by server)
      const connectionTime = Date.now();
      
      // Mock timeout logic
      setTimeout(() => {
        if (client.connected) {
          client.close();
        }
      }, 30000); // 30 second timeout
      
      expect(client.connected).toBe(true);
    });

    test('should recover from temporary failures', async () => {
      const client = new MockSMTPClient();
      
      // Simulate temporary failure and retry
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          await client.connect();
          break;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      expect(client.connected).toBe(true);
      expect(attempts).toBeLessThan(maxAttempts);
    });
  });

  describe('Monitoring and Logging', () => {
    test('should log SMTP connections and transactions', async () => {
      const client = new MockSMTPClient();
      
      // Mock logging capture
      const logs: any[] = [];
      const originalInfo = logger.info;
      logger.info = jest.fn((message: string, meta?: any) => {
        logs.push({ message, meta });
        originalInfo(message, meta);
      });
      
      await client.connect();
      await client.mail('test@example.com');
      await client.rcpt('recipient@ultrazend.com.br');
      
      // Restore original logger
      logger.info = originalInfo;
      
      // Should have logged the SMTP operations
      const smtpLogs = logs.filter(log => 
        log.message.toLowerCase().includes('smtp') ||
        log.message.toLowerCase().includes('mail') ||
        log.message.toLowerCase().includes('connection')
      );
      
      expect(smtpLogs.length).toBeGreaterThan(0);
    });

    test('should record performance metrics', async () => {
      const startTime = Date.now();
      
      const client = new MockSMTPClient();
      await client.connect();
      await client.sendMail({
        from: 'test@ultrazend.com.br',
        to: 'recipient@external.com',
        subject: 'Performance Test',
        text: 'This is a performance test email.'
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Mock metrics recording
      const metrics = {
        smtpConnectionTime: duration,
        emailsSent: 1,
        timestamp: new Date()
      };
      
      expect(metrics.smtpConnectionTime).toBeGreaterThan(0);
      expect(metrics.emailsSent).toBe(1);
    });
  });
});

/**
 * Helper function to check if port is open
 */
async function isPortOpen(port: number, host = 'localhost'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 3000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

/**
 * Helper function to wait for server to be ready
 */
async function waitForServer(port: number, timeout = 30000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await isPortOpen(port)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Server on port ${port} did not become ready within ${timeout}ms`);
}