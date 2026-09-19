module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '<rootDir>/src/__tests__/unit/emailService.test.ts',
    '<rootDir>/src/__tests__/unit/emailService.simple.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  setupFiles: ['<rootDir>/src/__tests__/environment.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 60000,
  verbose: true,
  maxWorkers: 4,
  testSequencer: '@jest/test-sequencer'
};
