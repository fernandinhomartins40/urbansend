/**
 * Utilities para criação robusta de tabelas
 * Resolve problemas de concorrência e duplicação
 */

import { Knex } from 'knex';
import { logger } from '../config/logger';

export class TableUtils {
  /**
   * Cria tabela de forma robusta, ignorando erros se já existir
   */
  static async createTableSafe(
    db: Knex,
    tableName: string,
    tableBuilder: (table: Knex.CreateTableBuilder) => void
  ): Promise<void> {
    try {
      const hasTable = await db.schema.hasTable(tableName);
      if (!hasTable) {
        await db.schema.createTable(tableName, tableBuilder);
        logger.info(`✅ Table created: ${tableName}`);
      } else {
        logger.debug(`ℹ️ Table already exists: ${tableName}`);
      }
    } catch (error: any) {
      // Ignorar erro se tabela já existe (race condition)
      if (error.code === 'SQLITE_ERROR' && error.message.includes('already exists')) {
        logger.debug(`ℹ️ Table ${tableName} already exists (concurrent creation)`);
        return;
      }
      
      // Re-throw outros erros
      logger.error(`❌ Failed to create table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Executa SQL raw de forma robusta
   */
  static async executeRawSafe(
    db: Knex,
    sql: string,
    description: string = 'SQL operation'
  ): Promise<void> {
    try {
      await db.raw(sql);
      logger.debug(`✅ ${description} completed`);
    } catch (error: any) {
      // Ignorar erro se tabela/índice já existe
      if (error.code === 'SQLITE_ERROR' && 
          (error.message.includes('already exists') || 
           error.message.includes('duplicate column'))) {
        logger.debug(`ℹ️ ${description} already exists (concurrent execution)`);
        return;
      }
      
      // Re-throw outros erros
      logger.error(`❌ Failed ${description}:`, error);
      throw error;
    }
  }

  /**
   * Wrapper para operações de inicialização que devem ser tolerantes a erros
   */
  static async initializeSafe<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    try {
      const result = await operation();
      logger.debug(`✅ ${operationName} initialized successfully`);
      return result;
    } catch (error: any) {
      logger.warn(`⚠️ ${operationName} initialization failed (continuing):`, {
        error: error.message,
        code: error.code
      });
      return null;
    }
  }
}