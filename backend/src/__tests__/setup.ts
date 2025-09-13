import { Database } from 'sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../config/logger';
import { monitoringService } from '../services/monitoringService';
import { DEFAULT_USER_PERMISSIONS, ADMIN_PERMISSIONS, permissionsToJson } from '../constants/permissions';

// Test database path
const TEST_DB_PATH = path.resolve(__dirname, '../../test.db');

/**
 * Global test setup
 * Creates test database and initializes services
 */
beforeAll(async () => {
  // Silence logs during tests unless specifically needed
  logger.silent = process.env.TEST_VERBOSE !== 'true';
  
  // Remove existing test database
  try {
    await fs.unlink(TEST_DB_PATH);
  } catch (error) {
    // Ignore if file doesn't exist
  }
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_PATH;
  process.env.JWT_SECRET = 'test-jwt-secret-with-enough-length-for-security';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-enough-length-for-security';
  process.env.SMTP_HOSTNAME = 'test.ultrazend.local';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  
  // Initialize test database
  await initializeTestDatabase();
  
  logger.info('Test environment initialized');
}, 60000);

/**
 * Global test teardown
 */
afterAll(async () => {
  try {
    // Close monitoring service
    if (monitoringService && typeof monitoringService.close === 'function') {
      await monitoringService.close();
    }
    
    // Clean up test database
    await fs.unlink(TEST_DB_PATH);
  } catch (error) {
    logger.warn('Error during test cleanup:', error);
  }
  
  // Wait a bit for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 100));
}, 30000);

/**
 * Initialize test database with schema and sample data
 */
async function initializeTestDatabase(): Promise<void> {
  const knex = require('knex')({
    client: 'sqlite3',
    connection: {
      filename: TEST_DB_PATH
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, '../migrations')
    }
  });

  try {
    // Run migrations
    await knex.migrate.latest();
    
    // Insert test data
    await seedTestData(knex);
    
    logger.info('Test database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize test database:', error);
    throw error;
  } finally {
    await knex.destroy();
  }
}

/**
 * Seed test database with sample data
 */
async function seedTestData(knex: any): Promise<void> {
  const bcrypt = require('bcrypt');
  
  // Create test users
  const testUsers = [
    {
      name: 'Test User 1',
      email: 'test1@example.com',
      password: await bcrypt.hash('password123', 10),
      is_verified: true,
      permissions: permissionsToJson(DEFAULT_USER_PERMISSIONS),
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'Test User 2',
      email: 'test2@example.com',
      password: await bcrypt.hash('password123', 10),
      is_verified: false,
      permissions: permissionsToJson(DEFAULT_USER_PERMISSIONS),
      email_verification_token: 'a'.repeat(64), // 64 char hex token
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'System User',
      email: 'system@test.local',
      password: await bcrypt.hash('system-password', 12),
      is_verified: true,
      permissions: permissionsToJson(ADMIN_PERMISSIONS),
      created_at: new Date(),
      updated_at: new Date()
    }
  ];

  const userIds = await knex('users').insert(testUsers);
  
  // Create test API keys (check if table exists and what columns it has)
  const hasApiKeysTable = await knex.schema.hasTable('api_keys');
  if (hasApiKeysTable) {
    try {
      const testApiKeys = [
        {
          user_id: userIds[0],
          name: 'Test API Key 1',
          key_value: await bcrypt.hash('test-api-key-1', 10),
          is_active: true,
          created_at: new Date()
        },
        {
          user_id: userIds[1],
          name: 'Test API Key 2', 
          key_value: await bcrypt.hash('test-api-key-2', 10),
          is_active: true,
          created_at: new Date()
        }
      ];

      await knex('api_keys').insert(testApiKeys);
    } catch (error: any) {
      logger.warn('Could not create test API keys:', error.message || error);
    }
  }
  
  // Create test domains (check if table exists)
  const hasDomainsTable = await knex.schema.hasTable('domains');
  if (hasDomainsTable) {
    try {
      const testDomains = [
        {
          user_id: userIds[0],
          name: 'test1.example.com', // Use 'name' instead of 'domain'
          is_verified: true,
          verification_token: 'domain-verification-token-1',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: userIds[1],
          name: 'test2.example.com',
          is_verified: false,
          verification_token: 'domain-verification-token-2',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      await knex('domains').insert(testDomains);
    } catch (error: any) {
      logger.warn('Could not create test domains:', error.message || error);
    }
  }
  
  // Create test email templates (check if table exists)
  const hasTemplatesTable = await knex.schema.hasTable('email_templates');
  if (hasTemplatesTable) {
    try {
      const testTemplates = [
        {
          user_id: userIds[0],
          name: 'Welcome Email',
          subject: 'Welcome to {{company}}',
          html_content: '<h1>Welcome {{name}}!</h1><p>Thank you for joining us.</p>',
          text_content: 'Welcome {{name}}! Thank you for joining us.',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      await knex('email_templates').insert(testTemplates);
    } catch (error: any) {
      logger.warn('Could not create test email templates:', error.message || error);
    }
  }
  
  logger.info('Test data seeded successfully');
}

/**
 * Helper function to get test database connection
 */
export function getTestDb() {
  return require('knex')({
    client: 'sqlite3',
    connection: {
      filename: TEST_DB_PATH
    },
    useNullAsDefault: true
  });
}

/**
 * Helper function to clean up test data between tests
 */
export async function cleanupTestData(): Promise<void> {
  const knex = getTestDb();
  
  try {
    // Delete in reverse order of dependencies - check if tables exist first
    const tables = ['emails', 'email_templates', 'domains', 'api_keys', 'audit_logs', 'webhooks'];
    
    for (const table of tables) {
      const hasTable = await knex.schema.hasTable(table);
      if (hasTable) {
        try {
          await knex(table).del();
        } catch (error: any) {
          logger.warn(`Could not clean table ${table}:`, error.message || error);
        }
      }
    }
    
    // Keep users for consistency across tests
    // await knex('users').del();
    
  } catch (error: any) {
    logger.warn('Error cleaning up test data:', error.message || error);
  } finally {
    await knex.destroy();
  }
}

/**
 * Helper function to create a test user
 */
export async function createTestUser(userData: Partial<any> = {}): Promise<any> {
  const bcrypt = require('bcrypt');
  const knex = getTestDb();
  
  const defaultUser = {
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: await bcrypt.hash('password123', 10),
    is_verified: true,
    permissions: JSON.stringify(["email:send", "email:read", "domain:manage", "template:manage", "analytics:read"]),
    created_at: new Date(),
    updated_at: new Date(),
    ...userData
  };

  try {
    const [userId] = await knex('users').insert(defaultUser);
    const user = await knex('users').where('id', userId).first();
    return user;
  } finally {
    await knex.destroy();
  }
}

/**
 * Helper function to create a test API key
 */
export async function createTestApiKey(userId: number, keyData: Partial<any> = {}): Promise<any> {
  const bcrypt = require('bcrypt');
  const knex = getTestDb();
  
  const hasApiKeysTable = await knex.schema.hasTable('api_keys');
  if (!hasApiKeysTable) {
    logger.warn('api_keys table does not exist, skipping API key creation');
    return null;
  }

  const defaultKey = {
    user_id: userId,
    name: 'Test API Key',
    key_value: await bcrypt.hash('test-api-key', 10),
    is_active: true,
    created_at: new Date(),
    ...keyData
  };

  try {
    const [keyId] = await knex('api_keys').insert(defaultKey);
    const apiKey = await knex('api_keys').where('id', keyId).first();
    return apiKey;
  } catch (error: any) {
    logger.warn('Could not create test API key:', error.message || error);
    return null;
  } finally {
    await knex.destroy();
  }
}

/**
 * Mock SMTP client for testing
 */
export class MockSMTPClient {
  public connected = false;
  public lastResponse = { code: 250, message: 'OK' };
  public sentEmails: any[] = [];

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  async mail(from: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    // Simulate MAIL FROM command
  }

  async rcpt(to: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    // Simulate RCPT TO command
  }

  async data(content: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    
    this.sentEmails.push({
      content,
      timestamp: new Date()
    });
  }

  async sendMail(mailOptions: any): Promise<any> {
    this.sentEmails.push({
      ...mailOptions,
      messageId: `test-${Date.now()}@test.local`,
      timestamp: new Date()
    });

    return {
      messageId: `test-${Date.now()}@test.local`,
      response: '250 Message accepted'
    };
  }
}

/**
 * Mock Redis client for testing
 */
export class MockRedisClient {
  private data: Map<string, any> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<string> {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    this.data.delete(key);
    return existed ? 1 : 0;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async flushall(): Promise<string> {
    this.data.clear();
    return 'OK';
  }

  disconnect(): void {
    this.data.clear();
  }
}

// Global test utilities
export const testUtils = {
  getTestDb,
  cleanupTestData,
  createTestUser,
  createTestApiKey,
  MockSMTPClient,
  MockRedisClient
};