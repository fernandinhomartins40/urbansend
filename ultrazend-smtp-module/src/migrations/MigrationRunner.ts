/**
 * @ultrazend/smtp-internal - Migration Runner
 * Sistema simples de migrations
 */

import * as fs from 'fs';
import * as path from 'path';
import knex, { Knex } from 'knex';
import { DatabaseConfig } from '../types';
import { logger } from '../utils/logger';

export class MigrationRunner {
  private db: Knex;
  private migrationDir: string;

  constructor(databaseConfig: DatabaseConfig | string) {
    this.migrationDir = path.join(__dirname, '.');
    
    // Configurar conexão com o banco
    if (typeof databaseConfig === 'string') {
      // SQLite file path
      this.db = knex({
        client: 'sqlite3',
        connection: {
          filename: databaseConfig
        },
        useNullAsDefault: true,
        migrations: {
          directory: this.migrationDir
        }
      });
    } else {
      // Configuração customizada
      this.db = knex({
        client: 'sqlite3',
        connection: databaseConfig.connection || { filename: './emails.sqlite' },
        useNullAsDefault: databaseConfig.useNullAsDefault !== false,
        migrations: {
          directory: databaseConfig.migrations?.directory || this.migrationDir
        },
        pool: databaseConfig.pool || { min: 1, max: 1 }
      });
    }
  }

  /**
   * Executa todas as migrations pendentes
   */
  async runMigrations(): Promise<void> {
    try {
      logger.info('Running database migrations...');

      // Criar tabela de migrations se não existir
      await this.ensureMigrationTable();

      // Obter migrations executadas
      const executedMigrations = await this.getExecutedMigrations();
      
      // Obter migrations disponíveis
      const availableMigrations = this.getAvailableMigrations();

      // Filtrar migrations pendentes
      const pendingMigrations = availableMigrations.filter(
        migration => !executedMigrations.includes(migration.name)
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      // Executar migrations pendentes
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      logger.info('All migrations completed successfully');

    } catch (error) {
      logger.error('Migration failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Garante que a tabela de migrations existe
   */
  private async ensureMigrationTable(): Promise<void> {
    const hasTable = await this.db.schema.hasTable('knex_migrations');
    
    if (!hasTable) {
      await this.db.schema.createTable('knex_migrations', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('batch').notNullable();
        table.timestamp('migration_time').defaultTo(this.db.fn.now());
      });
      
      logger.info('Created migrations table');
    }
  }

  /**
   * Obtém lista de migrations já executadas
   */
  private async getExecutedMigrations(): Promise<string[]> {
    try {
      const results = await this.db('knex_migrations')
        .select('name')
        .orderBy('id');
      
      return results.map(row => row.name);
    } catch (error) {
      return [];
    }
  }

  /**
   * Obtém lista de migrations disponíveis
   */
  private getAvailableMigrations(): Array<{ name: string; filepath: string }> {
    const files = fs.readdirSync(this.migrationDir);
    
    return files
      .filter(file => file.endsWith('.js') && file !== 'MigrationRunner.js')
      .map(file => ({
        name: file.replace('.js', ''),
        filepath: path.join(this.migrationDir, file)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Executa uma migration específica
   */
  private async executeMigration(migration: { name: string; filepath: string }): Promise<void> {
    try {
      logger.info(`Running migration: ${migration.name}`);

      // Carregar migration
      const migrationModule = require(migration.filepath);
      
      if (!migrationModule.up || typeof migrationModule.up !== 'function') {
        throw new Error(`Migration ${migration.name} does not export an 'up' function`);
      }

      // Executar migration em transação
      await this.db.transaction(async (trx) => {
        await migrationModule.up(trx);
        
        // Registrar migration como executada
        await trx('knex_migrations').insert({
          name: migration.name,
          batch: 1
        });
      });

      logger.info(`Migration completed: ${migration.name}`);

    } catch (error) {
      logger.error(`Migration failed: ${migration.name}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Fecha conexão com o banco
   */
  async close(): Promise<void> {
    await this.db.destroy();
  }

  /**
   * Obtém instância do Knex para uso externo
   */
  getDatabase(): Knex {
    return this.db;
  }
}