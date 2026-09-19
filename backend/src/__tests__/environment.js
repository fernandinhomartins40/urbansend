const path = require('path');

// Executed by Jest before test modules are imported. Keeping these values
// explicit prevents dotenv (loaded by the application with override:false)
// from selecting a developer or deployment database for a test process.
const workerId = process.env.JEST_WORKER_ID || '1';
const databasePath = path.resolve(__dirname, `../../test-worker-${workerId}.db`);

Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_CLIENT: 'sqlite',
  TEST_DB_CLIENT: 'sqlite',
  DATABASE_URL: databasePath,
  TEST_DATABASE_PATH: databasePath,
  JWT_SECRET: 'test-jwt-secret-with-enough-length-for-security',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-enough-length-for-security',
  COOKIE_SECRET: 'test-cookie-secret-with-enough-length-for-security',
  APP_ENCRYPTION_KEY: 'test-encryption-key-with-enough-length-for-security',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '2525',
  REDIS_URL: '',
  ENABLE_DKIM: 'false',
  ULTRAZEND_DIRECT_DELIVERY: 'false'
});
