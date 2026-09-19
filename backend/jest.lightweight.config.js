const baseConfig = require('./jest.config');

/**
 * Unit tests that mock all persistence and external I/O must not pay the
 * global SQLite migration/seed cost from src/__tests__/setup.ts. Integration
 * and database-contract tests keep using jest.config.js unchanged.
 */
module.exports = {
  ...baseConfig,
  setupFilesAfterEnv: [],
  maxWorkers: 1
};
