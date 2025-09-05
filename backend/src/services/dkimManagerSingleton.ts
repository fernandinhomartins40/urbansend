import { DKIMManager } from './dkimManager';
import { logger } from '../config/logger';

/**
 * Singleton pattern para DKIMManager 
 * Resolve race condition na inicialização evitando múltiplas instâncias
 */
export class DKIMManagerSingleton {
  private static instance: DKIMManager | null = null;
  private static initPromise: Promise<DKIMManager> | null = null;

  /**
   * Obtém a instância singleton do DKIMManager
   * Garante que a inicialização está completa antes de retornar
   */
  public static async getInstance(): Promise<DKIMManager> {
    if (this.instance) {
      return this.instance;
    }

    if (!this.initPromise) {
      this.initPromise = this.createInstance();
    }

    return this.initPromise;
  }

  /**
   * Cria e inicializa uma nova instância do DKIMManager
   */
  private static async createInstance(): Promise<DKIMManager> {
    try {
      logger.info('Creating DKIMManager singleton instance');
      
      const manager = new DKIMManager();
      
      // Aguardar inicialização completa
      await manager.waitForInitialization();
      
      this.instance = manager;
      
      logger.info('DKIMManager singleton initialized successfully');
      return this.instance;
    } catch (error) {
      logger.error('Failed to create DKIMManager singleton', { error });
      
      // Reset para permitir nova tentativa
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Reseta a instância singleton (usar apenas para testes)
   */
  public static reset(): void {
    this.instance = null;
    this.initPromise = null;
  }

  /**
   * Verifica se o singleton já foi inicializado
   */
  public static isInitialized(): boolean {
    return this.instance !== null;
  }
}