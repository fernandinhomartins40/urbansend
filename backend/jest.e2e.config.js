const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/src/tests/integration/domain-email-e2e.test.ts'],
  maxWorkers: 1
};
