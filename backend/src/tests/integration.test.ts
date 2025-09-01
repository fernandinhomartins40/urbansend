import { SecurityManager } from '../services/securityManager';
import { MonitoringService } from '../services/monitoringService';

// Create instances for testing
const securityManager = new SecurityManager();
const monitoringService = new MonitoringService();

describe('Phase 4 Integration Tests', () => {
  describe('Security and Monitoring Integration', () => {
    test('should validate basic SecurityManager functionality', async () => {
      // Test basic IP validation
      const validationResult = await securityManager.validateMXConnection('203.0.113.1');
      expect(validationResult).toHaveProperty('allowed');
      expect(typeof validationResult.allowed).toBe('boolean');
    });

    test('should validate basic MonitoringService functionality', async () => {
      // Test basic metrics recording
      await monitoringService.recordMetric('test.integration', 1, { type: 'counter' });
      
      // Test health status
      const healthStatus = await monitoringService.getHealthStatus();
      expect(healthStatus).toHaveProperty('overall');
      expect(['healthy', 'warning', 'critical']).toContain(healthStatus.overall);
    });

    test('should handle blacklist operations', async () => {
      const testIP = '203.0.113.100';
      
      // Add to blacklist
      await securityManager.addToBlacklist(testIP, 'integration test');
      
      // Verify blocking
      const result = await securityManager.validateMXConnection(testIP);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blacklisted');
    });

    test('should record security metrics', async () => {
      const testIP = '203.0.113.200';
      
      // Generate some security events
      await securityManager.validateMXConnection(testIP);
      
      // Check if monitoring service can get health status
      const health = await monitoringService.getHealthStatus();
      expect(health.overall).toBeTruthy();
    });

    test('should handle system monitoring', async () => {
      // Record some performance metrics
      await monitoringService.recordMetric('http.requests.total', 1, { method: 'GET', status: '200' });
      await monitoringService.recordMetric('http.request.duration', 150, { endpoint: '/api/test' });
      
      // Get system statistics
      const stats = monitoringService.getSystemStats();
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('uptime');
      expect(typeof stats.memory.used).toBe('number');
    });

    test('should provide health endpoints data', async () => {
      const healthStatus = await monitoringService.getHealthStatus();
      
      expect(healthStatus).toHaveProperty('overall');
      expect(healthStatus).toHaveProperty('services');
      expect(healthStatus).toHaveProperty('timestamp');
      expect(healthStatus).toHaveProperty('uptime');
      
      // Verify service checks exist
      expect(healthStatus.services).toHaveProperty('database');
      expect(healthStatus.services).toHaveProperty('system');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid inputs gracefully', async () => {
      // Test invalid IP
      const result = await securityManager.validateMXConnection('invalid-ip');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    test('should handle metric recording errors', async () => {
      // Test with invalid metric data
      await expect(monitoringService.recordMetric('', NaN, {})).resolves.not.toThrow();
      await expect(monitoringService.recordMetric(null as any, 1, {})).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle concurrent operations', async () => {
      const promises = [];
      
      // Test concurrent security validations
      for (let i = 0; i < 10; i++) {
        promises.push(securityManager.validateMXConnection(`203.0.113.${i}`));
      }
      
      // Test concurrent metrics recording
      for (let i = 0; i < 10; i++) {
        promises.push(monitoringService.recordMetric(`concurrent.test.${i}`, i, { type: 'gauge' }));
      }
      
      const results = await Promise.all(promises);
      expect(results.length).toBe(20);
    });

    test('should maintain performance under load', async () => {
      const startTime = Date.now();
      
      // Simulate moderate load
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(securityManager.validateMXConnection(`192.0.2.${i % 255}`));
        operations.push(monitoringService.recordMetric(`load.test.${i}`, i, { type: 'counter' }));
      }
      
      await Promise.all(operations);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});