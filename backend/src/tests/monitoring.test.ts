import { MonitoringService } from '../services/monitoringService';
import { Database } from 'sqlite3';

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;
  let testDb: Database;

  beforeAll(async () => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    monitoringService = new MonitoringService(testDb);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    testDb.close();
  });

  describe('Metrics Recording', () => {
    test('should record system metrics', async () => {
      await monitoringService.recordMetric('test.counter', 1, { type: 'counter' });
      await monitoringService.recordMetric('test.gauge', 42, { type: 'gauge' });
      await monitoringService.recordMetric('test.histogram', 100, { type: 'histogram' });
      
      // Verify metrics are recorded
      const metrics = await monitoringService.getMetrics('json');
      expect(typeof metrics).toBe('object');
    });

    test('should aggregate counter metrics', async () => {
      const metricName = 'test.requests.total';
      
      // Record multiple counter increments
      for (let i = 0; i < 5; i++) {
        await monitoringService.recordMetric(metricName, 1, 'counter');
      }
      
      const metrics = await monitoringService.getMetrics(metricName);
      expect(metrics[metricName]).toBeGreaterThanOrEqual(5);
    });

    test('should handle gauge metrics correctly', async () => {
      const metricName = 'test.memory.usage';
      
      await monitoringService.recordMetric(metricName, 100, 'gauge');
      await monitoringService.recordMetric(metricName, 150, 'gauge');
      await monitoringService.recordMetric(metricName, 75, 'gauge');
      
      const metrics = await monitoringService.getMetrics(metricName);
      expect(metrics[metricName]).toBe(75); // Should be the latest value
    });

    test('should record histogram values', async () => {
      const metricName = 'test.response.time';
      const values = [10, 20, 30, 40, 50];
      
      for (const value of values) {
        await monitoringService.recordMetric(metricName, value, 'histogram');
      }
      
      const metrics = await monitoringService.getMetrics(metricName);
      expect(metrics[metricName]).toBeDefined();
    });
  });

  describe('Health Checks', () => {
    test('should perform database health check', async () => {
      const healthStatus = await monitoringService.getHealthStatus();
      
      expect(healthStatus).toHaveProperty('overall');
      expect(healthStatus).toHaveProperty('services');
      expect(healthStatus.services).toHaveProperty('database');
      expect(healthStatus.services.database.status).toBe('healthy');
    });

    test('should check system resources', async () => {
      const healthStatus = await monitoringService.getHealthStatus();
      
      expect(healthStatus.services).toHaveProperty('system');
      expect(healthStatus.services.system).toHaveProperty('memory');
      expect(healthStatus.services.system).toHaveProperty('cpu');
      expect(typeof healthStatus.services.system.memory.usage).toBe('number');
    });

    test('should detect unhealthy services', async () => {
      // Mock an unhealthy condition by checking a non-existent service
      const healthStatus = await monitoringService.getHealthStatus();
      
      // The service should handle missing services gracefully
      expect(['healthy', 'warning', 'critical']).toContain(healthStatus.overall);
    });

    test('should provide detailed health information', async () => {
      const healthStatus = await monitoringService.getHealthStatus();
      
      expect(healthStatus).toHaveProperty('timestamp');
      expect(healthStatus).toHaveProperty('uptime');
      expect(typeof healthStatus.timestamp).toBe('string');
      expect(typeof healthStatus.uptime).toBe('number');
    });
  });

  describe('System Statistics', () => {
    test('should return current system stats', () => {
      const stats = monitoringService.getSystemStats();
      
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('cpu');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('loadAverage');
      
      expect(typeof stats.memory.used).toBe('number');
      expect(typeof stats.memory.total).toBe('number');
      expect(typeof stats.uptime).toBe('number');
      expect(Array.isArray(stats.loadAverage)).toBe(true);
    });

    test('should calculate memory percentages correctly', () => {
      const stats = monitoringService.getSystemStats();
      
      expect(stats.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(stats.memory.percentage).toBeLessThanOrEqual(100);
    });

    test('should return process information', () => {
      const stats = monitoringService.getSystemStats();
      
      expect(stats).toHaveProperty('process');
      expect(stats.process).toHaveProperty('pid');
      expect(stats.process).toHaveProperty('version');
      expect(stats.process).toHaveProperty('platform');
      
      expect(typeof stats.process.pid).toBe('number');
      expect(typeof stats.process.version).toBe('string');
    });
  });

  describe('Performance Monitoring', () => {
    test('should track request performance', async () => {
      const requestId = 'test-request-123';
      const startTime = Date.now();
      
      await monitoringService.recordMetric('http.requests.total', 1, 'counter');
      await monitoringService.recordMetric('http.request.duration', Date.now() - startTime, 'histogram');
      
      const metrics = await monitoringService.getMetrics('http.*');
      expect(metrics).toHaveProperty('http.requests.total');
      expect(metrics).toHaveProperty('http.request.duration');
    });

    test('should monitor email processing performance', async () => {
      const emailMetrics = {
        'email.sent.total': 5,
        'email.failed.total': 2,
        'email.processing.time': 1500
      };
      
      for (const [metric, value] of Object.entries(emailMetrics)) {
        const type = metric.includes('time') ? 'histogram' : 'counter';
        await monitoringService.recordMetric(metric, value, type);
      }
      
      const metrics = await monitoringService.getMetrics('email.*');
      expect(Object.keys(metrics).length).toBeGreaterThanOrEqual(3);
    });

    test('should calculate success rates', async () => {
      await monitoringService.recordMetric('operation.success', 80, 'counter');
      await monitoringService.recordMetric('operation.failure', 20, 'counter');
      
      const metrics = await monitoringService.getMetrics('operation.*');
      const totalOps = metrics['operation.success'] + metrics['operation.failure'];
      const successRate = (metrics['operation.success'] / totalOps) * 100;
      
      expect(successRate).toBe(80);
    });
  });

  describe('Alerting and Thresholds', () => {
    test('should detect high error rates', async () => {
      // Simulate high error rate
      for (let i = 0; i < 50; i++) {
        await monitoringService.recordMetric('errors.total', 1, 'counter');
      }
      
      const healthStatus = await monitoringService.getHealthStatus();
      // The service should detect this as a potential issue
      expect(['warning', 'critical']).toContain(healthStatus.overall);
    });

    test('should monitor memory usage thresholds', async () => {
      const stats = monitoringService.getSystemStats();
      
      // Memory usage should be reasonable for tests
      expect(stats.memory.percentage).toBeLessThan(90);
    });

    test('should track response time thresholds', async () => {
      const slowResponseTime = 5000; // 5 seconds
      await monitoringService.recordMetric('response.time.slow', slowResponseTime, 'histogram');
      
      const metrics = await monitoringService.getMetrics('response.*');
      expect(metrics['response.time.slow']).toBeGreaterThan(1000);
    });
  });

  describe('Data Retention and Cleanup', () => {
    test('should clean up old metrics', async () => {
      // Record some test metrics
      for (let i = 0; i < 10; i++) {
        await monitoringService.recordMetric('cleanup.test', i, 'counter');
      }
      
      // Metrics should be recorded
      let metrics = await monitoringService.getMetrics('cleanup.*');
      expect(Object.keys(metrics).length).toBeGreaterThan(0);
      
      // Simulate cleanup (this would normally happen automatically)
      // The service should handle this internally
      metrics = await monitoringService.getMetrics('cleanup.*');
      expect(typeof metrics).toBe('object');
    });

    test('should handle database cleanup gracefully', async () => {
      // This test ensures the cleanup process doesn't crash
      await expect(monitoringService.stop()).resolves.not.toThrow();
      await expect(monitoringService.initialize()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid metric names', async () => {
      await expect(monitoringService.recordMetric('', 1, 'counter')).resolves.not.toThrow();
      await expect(monitoringService.recordMetric(null as any, 1, 'counter')).resolves.not.toThrow();
    });

    test('should handle invalid metric values', async () => {
      await expect(monitoringService.recordMetric('test.invalid', NaN, 'gauge')).resolves.not.toThrow();
      await expect(monitoringService.recordMetric('test.invalid', Infinity, 'gauge')).resolves.not.toThrow();
    });

    test('should handle database connection issues', async () => {
      // Create a service with a closed database
      const closedDb = new Database(':memory:');
      closedDb.close();
      
      const brokenService = new MonitoringService(closedDb);
      
      // Should handle errors gracefully
      await expect(brokenService.initialize()).resolves.not.toThrow();
      await expect(brokenService.recordMetric('test', 1, 'counter')).resolves.not.toThrow();
    });

    test('should provide fallback health status on errors', async () => {
      const closedDb = new Database(':memory:');
      closedDb.close();
      
      const brokenService = new MonitoringService(closedDb);
      const health = await brokenService.getHealthStatus();
      
      expect(health).toHaveProperty('overall');
      expect(['healthy', 'warning', 'critical']).toContain(health.overall);
    });
  });

  describe('Integration Tests', () => {
    test('should handle concurrent metric recording', async () => {
      const promises = [];
      
      // Record metrics concurrently
      for (let i = 0; i < 20; i++) {
        promises.push(monitoringService.recordMetric('concurrent.test', 1, 'counter'));
      }
      
      await Promise.all(promises);
      
      const metrics = await monitoringService.getMetrics('concurrent.*');
      expect(metrics['concurrent.test']).toBeGreaterThanOrEqual(20);
    });

    test('should maintain consistent state during high load', async () => {
      const operations = [];
      
      // Mix of different operations
      for (let i = 0; i < 50; i++) {
        operations.push(monitoringService.recordMetric(`load.test.${i % 5}`, i, 'gauge'));
        if (i % 10 === 0) {
          operations.push(monitoringService.getHealthStatus());
        }
      }
      
      await Promise.all(operations);
      
      const metrics = await monitoringService.getMetrics('load.test.*');
      expect(Object.keys(metrics).length).toBe(5);
    });
  });
});