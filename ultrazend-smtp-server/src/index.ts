/**
 * @ultrazend/smtp-server
 * Servidor SMTP completo independente - Mini UltraZend
 * 
 * FUNCIONALIDADES:
 * ✅ Servidor SMTP completo (MX + Submission)
 * ✅ Entrega direta via MX records (sem dependências externas!)
 * ✅ Autenticação de usuários
 * ✅ Assinatura DKIM automática
 * ✅ Banco de dados SQLite integrado
 * ✅ Logs completos de conexões e entregas
 * ✅ Rate limiting e segurança
 * ✅ Processamento de emails entrada e saída
 */

export { UltraZendSMTPServer } from './server/SMTPServer';
export { MXDeliveryService } from './delivery/MXDeliveryService';
export { DKIMManager } from './security/DKIMManager';
export { Logger, logger } from './utils/logger';
export * from './utils/crypto';

// Exportar todos os tipos
export * from './types';

// Classe principal simplificada
import { UltraZendSMTPServer } from './server/SMTPServer';
import { SMTPServerConfig } from './types';

/**
 * Servidor SMTP completo - Plug & Play
 * 
 * Exemplo de uso:
 * ```typescript
 * import { SMTPServer } from '@ultrazend/smtp-server';
 * 
 * const server = new SMTPServer({
 *   hostname: 'mail.meusite.com',
 *   mxPort: 25,
 *   submissionPort: 587,
 *   databasePath: './meu-smtp.sqlite'
 * });
 * 
 * await server.start();
 * ```
 */
export class SMTPServer extends UltraZendSMTPServer {
  constructor(config: SMTPServerConfig = {}) {
    super(config);
  }

  /**
   * Método helper para criar usuário SMTP
   */
  async createUser(email: string, password: string, name: string = 'User'): Promise<number> {
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);
    
    const [userId] = await this.getDatabase()('users').insert({
      email,
      password_hash: passwordHash,
      name,
      is_verified: true,
      is_active: true,
      is_admin: false
    });

    return userId;
  }

  /**
   * Método helper para adicionar domínio
   */
  async addDomain(domain: string, userId?: number): Promise<number> {
    // Se não especificou userId, usar o primeiro usuário disponível
    if (!userId) {
      const user = await this.getDatabase()('users').first();
      if (!user) {
        throw new Error('No users found. Create a user first.');
      }
      userId = user.id;
    }

    const [domainId] = await this.getDatabase()('domains').insert({
      user_id: userId,
      domain_name: domain,
      is_verified: false,
      dkim_enabled: true,
      spf_enabled: true
    });

    return domainId;
  }

  /**
   * Método helper para gerar chaves DKIM
   */
  async setupDKIM(domain: string): Promise<string> {
    const result = await this.getDKIMManager().generateDKIMKeys(domain);
    
    console.log(`\n🔑 DKIM configurado para ${domain}`);
    console.log(`\n📋 Adicione este registro DNS TXT:`);
    console.log(`Nome: default._domainkey.${domain}`);
    console.log(`Valor: ${result.dnsRecord}`);
    console.log(`\n⚠️  IMPORTANTE: Adicione o registro DNS antes de enviar emails!\n`);
    
    return result.dnsRecord;
  }

  /**
   * Método helper para obter estatísticas
   */
  async getStats() {
    const db = this.getDatabase();
    const now = new Date();
    const hour = new Date(now.getTime() - 3600000);

    const [
      totalEmails,
      recentConnections,
      authAttempts,
      activeDomains
    ] = await Promise.all([
      db('emails').count('* as count').first(),
      db('smtp_connections').where('created_at', '>=', hour).count('* as count').first(),
      db('auth_attempts').where('created_at', '>=', hour).count('* as count').first(),
      db('domains').where('is_verified', true).count('* as count').first()
    ]);

    return {
      totalEmails: (totalEmails as any)?.count || 0,
      recentConnections: (recentConnections as any)?.count || 0,
      authAttempts: (authAttempts as any)?.count || 0,
      activeDomains: (activeDomains as any)?.count || 0,
      uptime: process.uptime(),
      timestamp: now.toISOString()
    };
  }
}

// Exportar como default também
export default SMTPServer;