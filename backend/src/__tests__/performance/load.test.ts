import request from 'supertest';
import { Express } from 'express';
import { performance } from 'perf_hooks';
import { testUtils, createTestUser, MockSMTPClient } from '../setup';
import { logger } from '../../config/logger';
import UltraZendSMTPServer from '../../services/smtpServer';

describe('Performance and Load Tests', () => {
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
    
    // Initialize SMTP server for performance testing
    smtpServer = new UltraZendSMTPServer();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    mockSMTPClient = new MockSMTPClient();
    
    // Create verified test user with pro plan for higher limits
    testUser = await createTestUser({
      email: 'perf-test@ultrazend.com.br',
      is_verified: true,
      plan_type: 'enterprise'
    });
    
    // Get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'password123'
      });
    authToken = loginResponse.body.token;
  }, 90000);

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

  describe('API Performance Tests', () => {
    test('should handle single email sending within performance threshold', async () => {
      const startTime = performance.now();

      const response = await request(app)
        .post('/api/emails/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: 'perf-single@example.com',
          subject: 'Performance Test Email',
          html: '<p>Performance test content</p>',
          text: 'Performance test content'
        })
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(response.body.status).toBe('success');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      logger.info('Single email send performance', {
        duration: `${duration.toFixed(2)}ms`,
        messageId: response.body.messageId
      });
    });

    test('should handle batch email sending efficiently', async () => {
      const batchSize = 50;
      const emails = Array.from({ length: batchSize }, (_, i) => ({
        to: `batch-perf-${i}@example.com`,
        subject: `Batch Performance Test ${i}`,
        html: `<p>Batch performance test email ${i}</p>`,
        text: `Batch performance test email ${i}`
      }));

      const startTime = performance.now();

      const response = await request(app)
        .post('/api/emails/send/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emails })
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerEmail = duration / batchSize;

      expect(response.body.status).toBe('success');
      expect(response.body.results).toHaveLength(batchSize);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(avgTimePerEmail).toBeLessThan(200); // Average 200ms per email

      logger.info('Batch email send performance', {
        batchSize,
        totalDuration: `${duration.toFixed(2)}ms`,
        avgPerEmail: `${avgTimePerEmail.toFixed(2)}ms`,
        throughput: `${(batchSize / (duration / 1000)).toFixed(2)} emails/sec`
      });
    });

    test('should handle concurrent API requests efficiently', async () => {
      const concurrentRequests = 20;
      const promises: Promise<any>[] = [];

      const startTime = performance.now();

      // Create concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .post('/api/emails/send')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              to: `concurrent-${i}@example.com`,
              subject: `Concurrent Test ${i}`,
              html: `<p>Concurrent test email ${i}</p>`,
              text: `Concurrent test email ${i}`
            })
        );
      }

      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      );
      const failed = results.filter(r => 
        r.status === 'rejected' || r.value.status !== 200
      );

      expect(successful.length).toBeGreaterThan(concurrentRequests * 0.8); // At least 80% success
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds

      logger.info('Concurrent request performance', {
        totalRequests: concurrentRequests,
        successful: successful.length,
        failed: failed.length,
        duration: `${duration.toFixed(2)}ms`,
        throughput: `${(successful.length / (duration / 1000)).toFixed(2)} req/sec`
      });
    });

    test('should maintain performance under sustained load', async () => {
      const loadDuration = 30000; // 30 seconds
      const requestInterval = 100; // Request every 100ms
      const maxConcurrent = 10;

      const results: any[] = [];
      const startTime = performance.now();
      let requestCount = 0;
      let activeRequests = 0;

      const sendRequest = async () => {
        if (activeRequests >= maxConcurrent) return;
        
        activeRequests++;
        const requestStart = performance.now();
        
        try {
          const response = await request(app)
            .post('/api/emails/send')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              to: `load-${requestCount}@example.com`,
              subject: `Load Test ${requestCount}`,
              html: `<p>Load test email ${requestCount}</p>`,
              text: `Load test email ${requestCount}`
            });

          const requestEnd = performance.now();
          results.push({
            status: response.status,
            duration: requestEnd - requestStart,
            timestamp: requestEnd
          });
        } catch (error) {
          const requestEnd = performance.now();
          results.push({
            status: 'error',
            duration: requestEnd - requestStart,
            timestamp: requestEnd,
            error: error.message
          });
        } finally {
          activeRequests--;
          requestCount++;
        }
      };

      // Send requests at intervals
      const intervalId = setInterval(() => {
        if (performance.now() - startTime >= loadDuration) {
          clearInterval(intervalId);
          return;
        }
        sendRequest();
      }, requestInterval);

      // Wait for load test to complete
      await new Promise(resolve => setTimeout(resolve, loadDuration + 5000));

      const successful = results.filter(r => r.status === 200);
      const avgResponseTime = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
      const throughput = successful.length / (loadDuration / 1000);

      expect(successful.length).toBeGreaterThan(0);
      expect(avgResponseTime).toBeLessThan(2000); // Average response time under 2 seconds
      expect(throughput).toBeGreaterThan(1); // At least 1 request per second

      logger.info('Sustained load test results', {
        duration: `${loadDuration}ms`,
        totalRequests: results.length,
        successful: successful.length,
        avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
        throughput: `${throughput.toFixed(2)} req/sec`
      });
    });
  });

  describe('SMTP Server Performance Tests', () => {
    test('should handle multiple concurrent SMTP connections', async () => {
      const connectionCount = 10;
      const clients: MockSMTPClient[] = [];
      const connectionPromises: Promise<boolean>[] = [];

      const startTime = performance.now();

      // Create multiple concurrent connections
      for (let i = 0; i < connectionCount; i++) {
        const client = new MockSMTPClient();
        clients.push(client);
        connectionPromises.push(client.connect());
      }

      const results = await Promise.allSettled(connectionPromises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      const successful = results.filter(r => r.status === 'fulfilled').length;

      expect(successful).toBe(connectionCount);
      expect(duration).toBeLessThan(5000); // Should establish all connections within 5 seconds

      // Send emails through each connection
      const emailPromises = clients.map(async (client, i) => {
        try {
          await client.mail(`sender${i}@example.com`);
          await client.rcpt('recipient@ultrazend.com.br');
          await client.data(`Subject: SMTP Performance Test ${i}\n\nTest email ${i}`);
          return true;
        } catch (error) {
          return false;
        }
      });

      const emailResults = await Promise.allSettled(emailPromises);
      const successfulEmails = emailResults.filter(r => 
        r.status === 'fulfilled' && r.value === true
      ).length;

      expect(successfulEmails).toBeGreaterThan(connectionCount * 0.8);

      // Cleanup
      await Promise.all(clients.map(client => client.close()));

      logger.info('SMTP concurrent connection performance', {
        connections: connectionCount,
        successful,
        connectionTime: `${duration.toFixed(2)}ms`,
        emailsSent: successfulEmails
      });
    });

    test('should handle rapid email processing', async () => {
      const emailCount = 100;
      const client = new MockSMTPClient();
      await client.connect();

      const startTime = performance.now();
      const promises = [];

      for (let i = 0; i < emailCount; i++) {
        promises.push((async () => {
          await client.mail(`rapid-sender-${i}@example.com`);
          await client.rcpt('rapid-recipient@ultrazend.com.br');
          await client.data(`Subject: Rapid Test ${i}\n\nRapid test email ${i}`);
        })());
      }

      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const throughput = successful / (duration / 1000);

      expect(successful).toBeGreaterThan(emailCount * 0.9); // 90% success rate
      expect(throughput).toBeGreaterThan(10); // At least 10 emails per second

      await client.close();

      logger.info('SMTP rapid email processing performance', {
        emailCount,
        successful,
        duration: `${duration.toFixed(2)}ms`,
        throughput: `${throughput.toFixed(2)} emails/sec`
      });
    });
  });

  describe('Database Performance Tests', () => {
    test('should handle bulk email insertions efficiently', async () => {
      const recordCount = 1000;
      const emails = Array.from({ length: recordCount }, (_, i) => ({
        user_id: testUser.id,
        sender_email: 'bulk-test@ultrazend.com.br',
        recipient_email: `bulk-${i}@example.com`,
        subject: `Bulk Insert Test ${i}`,
        html_content: `<p>Bulk test email ${i}</p>`,
        text_content: `Bulk test email ${i}`,
        status: 'queued',
        message_id: `bulk-${i}-${Date.now()}@ultrazend.com.br`,
        created_at: new Date(),
        updated_at: new Date()
      }));

      const startTime = performance.now();
      
      // Use batch insert for better performance
      await testDb('emails').insert(emails);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = recordCount / (duration / 1000);

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(throughput).toBeGreaterThan(100); // At least 100 records per second

      logger.info('Bulk database insert performance', {
        recordCount,
        duration: `${duration.toFixed(2)}ms`,
        throughput: `${throughput.toFixed(2)} records/sec`
      });

      // Verify records were inserted
      const insertedCount = await testDb('emails')
        .where('user_id', testUser.id)
        .where('sender_email', 'bulk-test@ultrazend.com.br')
        .count('* as count')
        .first();

      expect(insertedCount.count).toBe(recordCount);
    });

    test('should handle complex queries efficiently', async () => {
      const startTime = performance.now();

      // Complex query with joins and aggregations
      const stats = await testDb('emails')
        .select('status')
        .select(testDb.raw('COUNT(*) as count'))
        .select(testDb.raw('AVG(CASE WHEN created_at > updated_at THEN 0 ELSE julianday(updated_at) - julianday(created_at) END) as avg_processing_time'))
        .leftJoin('users', 'emails.user_id', 'users.id')
        .where('users.plan_type', '!=', 'free')
        .where('emails.created_at', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
        .groupBy('status')
        .having(testDb.raw('COUNT(*)'), '>', 0);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(Array.isArray(stats)).toBe(true);

      logger.info('Complex query performance', {
        duration: `${duration.toFixed(2)}ms`,
        resultCount: stats.length
      });
    });
  });

  describe('Memory and Resource Usage Tests', () => {
    test('should maintain stable memory usage during bulk operations', async () => {
      const initialMemory = process.memoryUsage();

      // Perform memory-intensive operations
      const largeEmailCount = 500;
      const promises = [];

      for (let i = 0; i < largeEmailCount; i++) {
        promises.push(
          request(app)
            .post('/api/emails/send')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              to: `memory-test-${i}@example.com`,
              subject: `Memory Test ${i}`,
              html: '<p>' + 'Large content '.repeat(100) + '</p>', // Larger content
              text: 'Large content '.repeat(100)
            })
        );
      }

      // Process in batches to avoid overwhelming
      const batchSize = 50;
      for (let i = 0; i < promises.length; i += batchSize) {
        const batch = promises.slice(i, i + batchSize);
        await Promise.allSettled(batch);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePerEmail = memoryIncrease / largeEmailCount;

      // Memory increase should be reasonable
      expect(memoryIncreasePerEmail).toBeLessThan(10000); // Less than 10KB per email

      logger.info('Memory usage during bulk operations', {
        initialHeapUsed: `${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
        finalHeapUsed: `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
        memoryIncrease: `${Math.round(memoryIncrease / 1024 / 1024)}MB`,
        memoryPerEmail: `${Math.round(memoryIncreasePerEmail / 1024)}KB`,
        emailCount: largeEmailCount
      });
    });

    test('should handle file descriptor limits gracefully', async () => {
      // This test simulates scenarios where file descriptor limits might be reached
      const connectionCount = 50;
      const clients: MockSMTPClient[] = [];

      try {
        // Create many connections
        for (let i = 0; i < connectionCount; i++) {
          const client = new MockSMTPClient();
          clients.push(client);
          await client.connect();
        }

        // Verify connections are working
        expect(clients.every(client => client.connected)).toBe(true);

        // Use connections
        const emailPromises = clients.map(async (client, i) => {
          try {
            await client.sendMail({
              from: `fd-test-${i}@example.com`,
              to: 'fd-recipient@ultrazend.com.br',
              subject: `FD Test ${i}`,
              text: `File descriptor test email ${i}`
            });
            return true;
          } catch (error) {
            return false;
          }
        });

        const results = await Promise.allSettled(emailPromises);
        const successful = results.filter(r => 
          r.status === 'fulfilled' && r.value === true
        ).length;

        expect(successful).toBeGreaterThan(connectionCount * 0.8);

        logger.info('File descriptor handling test', {
          connectionCount,
          successful,
          successRate: `${((successful / connectionCount) * 100).toFixed(2)}%`
        });
      } finally {
        // Cleanup all connections
        await Promise.all(clients.map(client => client.close().catch(() => {})));
      }
    });
  });

  describe('Rate Limiting Performance', () => {
    test('should enforce rate limits without blocking legitimate traffic', async () => {
      const rateLimitWindow = 60000; // 1 minute
      const allowedRequests = 100; // Adjust based on your rate limits
      const testRequests = allowedRequests + 20; // Send more than allowed

      const promises = [];
      const startTime = performance.now();

      for (let i = 0; i < testRequests; i++) {
        promises.push(
          request(app)
            .post('/api/emails/send')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              to: `ratelimit-perf-${i}@example.com`,
              subject: `Rate Limit Perf Test ${i}`,
              html: `<p>Rate limit performance test ${i}</p>`,
              text: `Rate limit performance test ${i}`
            })
        );
      }

      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length;
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      ).length;

      // Should have allowed requests succeed and excess be rate limited
      expect(successful).toBeLessThanOrEqual(allowedRequests);
      expect(rateLimited).toBeGreaterThan(0);
      expect(successful + rateLimited).toBe(testRequests);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      logger.info('Rate limiting performance', {
        testRequests,
        successful,
        rateLimited,
        duration: `${duration.toFixed(2)}ms`,
        allowedRate: `${(successful / testRequests * 100).toFixed(2)}%`
      });
    });
  });
});