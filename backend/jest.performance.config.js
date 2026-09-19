const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/src/tests/integration/performance.test.ts'],
  maxWorkers: 1
};
