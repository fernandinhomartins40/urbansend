import { logger } from '../config/logger';
import db from '../config/database';
import { DomainValidator } from './DomainValidator';
import { MultiDomainDKIMManager } from './MultiDomainDKIMManager';

export interface TenantContext {
  userId: number;
  email: string;
  plan: string;
  planLimits: PlanLimits;
  verifiedDomains: VerifiedDomain[];
  dkimConfigurations: DKIMConfiguration[];
  rateLimits: RateLimits;
  tenantSettings: TenantSettings;
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export interface PlanLimits {
  emailsPerDay: number;
  emailsPerMonth: number;
  domainsLimit: number;
  webhooksLimit: number;
  apiCallsPerHour: number;
  storageLimit: number; // in MB
}

export interface VerifiedDomain {
  id: number;
  domainName: string;
  isVerified: boolean;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  lastVerifiedAt: Date;
  dkimSelector: string;
}

export interface DKIMConfiguration {
  domainId: number;
  domainName: string;
  selector: string;
  privateKey: string;
  publicKey: string;
  isActive: boolean;
}

export interface RateLimits {
  emailsSending: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  apiCalls: {
    perMinute: number;
    perHour: number;
  };
  webhookCalls: {
    perMinute: number;
    perHour: number;
  };
}

export interface TenantSettings {
  timezone: string;
  defaultFromEmail: string;
  defaultFromName: string;
  bounceHandling: boolean;
  openTracking: boolean;
  clickTracking: boolean;
  unsubscribeTracking: boolean;
  suppressionListEnabled: boolean;
}

export interface TenantOperation {
  operation: string;
  resource: string;
  resourceId?: number;
  metadata?: any;
}

export class TenantContextService {
  private static instance: TenantContextService;
  private domainValidator: DomainValidator;
  private dkimManager: MultiDomainDKIMManager;
  private contextCache: Map<number, { context: TenantContext; cachedAt: Date }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor() {
    this.domainValidator = new DomainValidator();
    this.dkimManager = new MultiDomainDKIMManager();
    this.validateRequiredTables();
  }

  public static getInstance(): TenantContextService {
    if (!TenantContextService.instance) {
      TenantContextService.instance = new TenantContextService();
    }
    return TenantContextService.instance;
  }

  private async validateRequiredTables(): Promise<void> {
    try {
      const requiredTables = [
        'users',
        'domains',
        'user_plans',
        'tenant_settings'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await db.schema.hasTable(tableName);
        if (!hasTable) {
          logger.warn(`Tabela '${tableName}' não encontrada. Algumas funcionalidades podem não funcionar.`);
        }
      }

      logger.info('TenantContextService: Validação de tabelas concluída');
    } catch (error) {
      logger.error('Erro ao validar tabelas do TenantContextService:', error);
    }
  }

  async getTenantContext(userId: number, forceRefresh: boolean = false): Promise<TenantContext> {
    try {
      // Verificar cache primeiro
      if (!forceRefresh) {
        const cached = this.contextCache.get(userId);
        if (cached && (Date.now() - cached.cachedAt.getTime()) < this.CACHE_TTL) {
          return cached.context;
        }
      }

      // Buscar dados do usuário
      const user = await db('users')
        .where('id', userId)
        .first();

      if (!user) {
        throw new Error(`Usuário ${userId} não encontrado`);
      }

      // Buscar plano do usuário
      const userPlan = await db('user_plans')
        .where('user_id', userId)
        .where('is_active', true)
        .first() || { plan_name: 'free' };

      // Buscar domínios verificados
      const verifiedDomains = await this.getVerifiedDomains(userId);

      // Buscar configurações DKIM
      const dkimConfigurations = await this.getDKIMConfigurations(userId);

      // Definir limites baseados no plano
      const planLimits = this.getPlanLimits(userPlan.plan_name);

      // Definir rate limits
      const rateLimits = this.getRateLimits(userPlan.plan_name);

      // Buscar configurações do tenant
      const tenantSettings = await this.getTenantSettings(userId);

      const context: TenantContext = {
        userId,
        email: user.email,
        plan: userPlan.plan_name,
        planLimits,
        verifiedDomains,
        dkimConfigurations,
        rateLimits,
        tenantSettings,
        isActive: user.is_verified && !user.is_suspended,
        createdAt: new Date(user.created_at),
        lastActivity: new Date(user.last_activity || user.created_at)
      };

      // Atualizar cache
      this.contextCache.set(userId, {
        context,
        cachedAt: new Date()
      });

      logger.debug('Tenant context obtido', {
        tenantId: userId,
        plan: context.plan,
        verifiedDomains: context.verifiedDomains.length,
        isActive: context.isActive
      });

      return context;

    } catch (error) {
      logger.error('Erro ao obter context do tenant', {
        tenantId: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async validateTenantOperation(
    userId: number, 
    operation: TenantOperation
  ): Promise<{ allowed: boolean; reason?: string; metadata?: any }> {
    try {
      const context = await this.getTenantContext(userId);

      if (!context.isActive) {
        return {
          allowed: false,
          reason: 'Tenant não está ativo'
        };
      }

      // Validar operações específicas
      switch (operation.operation) {
        case 'send_email':
          return await this.validateEmailSendingOperation(context, operation);

        case 'add_domain':
          return await this.validateDomainOperation(context, operation);

        case 'create_webhook':
          return await this.validateWebhookOperation(context, operation);

        case 'api_call':
          return await this.validateAPIOperation(context, operation);

        case 'use_storage':
          return await this.validateStorageOperation(context, operation);

        default:
          return {
            allowed: true,
            reason: 'Operação não requer validação específica'
          };
      }

    } catch (error) {
      logger.error('Erro ao validar operação do tenant', {
        tenantId: userId,
        operation: operation.operation,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        allowed: false,
        reason: 'Erro interno na validação'
      };
    }
  }

  async validateEmailSendingOperation(
    context: TenantContext, 
    operation: TenantOperation
  ): Promise<{ allowed: boolean; reason?: string; metadata?: any }> {
    const { userId } = context;
    const { resource: fromDomain, metadata } = operation;

    // Verificar se domínio pertence ao tenant
    const domainOwned = context.verifiedDomains.some(
      domain => domain.domainName === fromDomain && domain.isVerified
    );

    if (!domainOwned) {
      return {
        allowed: false,
        reason: `Domínio ${fromDomain} não pertence ao tenant ou não está verificado`
      };
    }

    // Verificar rate limits diários
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const emailsSentToday = await db('emails')
      .where('user_id', userId)
      .where('created_at', '>=', today)
      .count('* as count')
      .first();

    const sentCount = parseInt(String(emailsSentToday?.count || 0));

    if (sentCount >= context.planLimits.emailsPerDay) {
      return {
        allowed: false,
        reason: `Limite diário de ${context.planLimits.emailsPerDay} emails excedido`,
        metadata: {
          sentToday: sentCount,
          dailyLimit: context.planLimits.emailsPerDay
        }
      };
    }

    // Verificar rate limits por hora
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const emailsSentLastHour = await db('emails')
      .where('user_id', userId)
      .where('created_at', '>=', hourAgo)
      .count('* as count')
      .first();

    const sentLastHour = parseInt(String(emailsSentLastHour?.count || 0));

    if (sentLastHour >= context.rateLimits.emailsSending.perHour) {
      return {
        allowed: false,
        reason: `Rate limit por hora excedido: ${sentLastHour}/${context.rateLimits.emailsSending.perHour}`,
        metadata: {
          sentLastHour,
          hourlyLimit: context.rateLimits.emailsSending.perHour
        }
      };
    }

    return {
      allowed: true,
      metadata: {
        sentToday: sentCount,
        dailyLimit: context.planLimits.emailsPerDay,
        remaining: context.planLimits.emailsPerDay - sentCount
      }
    };
  }

  async validateDomainOperation(
    context: TenantContext, 
    operation: TenantOperation
  ): Promise<{ allowed: boolean; reason?: string; metadata?: any }> {
    const currentDomainCount = context.verifiedDomains.length;

    if (currentDomainCount >= context.planLimits.domainsLimit) {
      return {
        allowed: false,
        reason: `Limite de ${context.planLimits.domainsLimit} domínios atingido`,
        metadata: {
          currentDomains: currentDomainCount,
          limit: context.planLimits.domainsLimit
        }
      };
    }

    return { allowed: true };
  }

  async validateWebhookOperation(
    context: TenantContext, 
    operation: TenantOperation
  ): Promise<{ allowed: boolean; reason?: string; metadata?: any }> {
    const webhookCount = await db('webhooks')
      .where('user_id', context.userId)
      .where('is_active', true)
      .count('* as count')
      .first();

    const currentWebhooks = parseInt(String(webhookCount?.count || 0));

    if (currentWebhooks >= context.planLimits.webhooksLimit) {
      return {
        allowed: false,
        reason: `Limite de ${context.planLimits.webhooksLimit} webhooks atingido`
      };
    }

    return { allowed: true };
  }

  async validateAPIOperation(
    context: TenantContext, 
    operation: TenantOperation
  ): Promise<{ allowed: boolean; reason?: string; metadata?: any }> {
    // Implementar validação de rate limiting de API
    // Por simplicidade, retornando true por enquanto
    return { allowed: true };
  }

  async validateStorageOperation(
    context: TenantContext, 
    operation: TenantOperation
  ): Promise<{ allowed: boolean; reason?: string; metadata?: any }> {
    // Implementar validação de storage
    // Por simplicidade, retornando true por enquanto
    return { allowed: true };
  }

  private async getVerifiedDomains(userId: number): Promise<VerifiedDomain[]> {
    try {
      const domains = await db('domains')
        .where('user_id', userId)
        .select('*');

      return domains.map(domain => ({
        id: domain.id,
        domainName: domain.domain_name,
        isVerified: domain.is_verified,
        spfVerified: domain.spf_verified || false,
        dkimVerified: domain.dkim_verified || false,
        dmarcVerified: domain.dmarc_verified || false,
        lastVerifiedAt: new Date(domain.last_verification_attempt || domain.created_at),
        dkimSelector: domain.dkim_selector || 'default'
      }));
    } catch (error) {
      logger.error('Erro ao buscar domínios verificados', { userId, error });
      return [];
    }
  }

  private async getDKIMConfigurations(userId: number): Promise<DKIMConfiguration[]> {
    try {
      const domains = await db('domains')
        .where('user_id', userId)
        .where('is_verified', true)
        .select('*');

      return domains
        .filter(domain => domain.dkim_private_key && domain.dkim_public_key)
        .map(domain => ({
          domainId: domain.id,
          domainName: domain.domain_name,
          selector: domain.dkim_selector || 'default',
          privateKey: domain.dkim_private_key,
          publicKey: domain.dkim_public_key,
          isActive: domain.dkim_verified || false
        }));
    } catch (error) {
      logger.error('Erro ao buscar configurações DKIM', { userId, error });
      return [];
    }
  }

  private getPlanLimits(planName: string): PlanLimits {
    const planLimitsMap: Record<string, PlanLimits> = {
      'free': {
        emailsPerDay: 100,
        emailsPerMonth: 2000,
        domainsLimit: 1,
        webhooksLimit: 2,
        apiCallsPerHour: 100,
        storageLimit: 100 // 100MB
      },
      'pro': {
        emailsPerDay: 1000,
        emailsPerMonth: 25000,
        domainsLimit: 5,
        webhooksLimit: 10,
        apiCallsPerHour: 1000,
        storageLimit: 1000 // 1GB
      },
      'enterprise': {
        emailsPerDay: 10000,
        emailsPerMonth: 300000,
        domainsLimit: 20,
        webhooksLimit: 50,
        apiCallsPerHour: 10000,
        storageLimit: 10000 // 10GB
      }
    };

    return planLimitsMap[planName] || planLimitsMap['free'];
  }

  private getRateLimits(planName: string): RateLimits {
    const rateLimitsMap: Record<string, RateLimits> = {
      'free': {
        emailsSending: {
          perMinute: 2,
          perHour: 10,
          perDay: 100
        },
        apiCalls: {
          perMinute: 5,
          perHour: 100
        },
        webhookCalls: {
          perMinute: 1,
          perHour: 10
        }
      },
      'pro': {
        emailsSending: {
          perMinute: 10,
          perHour: 100,
          perDay: 1000
        },
        apiCalls: {
          perMinute: 50,
          perHour: 1000
        },
        webhookCalls: {
          perMinute: 5,
          perHour: 50
        }
      },
      'enterprise': {
        emailsSending: {
          perMinute: 50,
          perHour: 500,
          perDay: 10000
        },
        apiCalls: {
          perMinute: 200,
          perHour: 10000
        },
        webhookCalls: {
          perMinute: 20,
          perHour: 200
        }
      }
    };

    return rateLimitsMap[planName] || rateLimitsMap['free'];
  }

  private async getTenantSettings(userId: number): Promise<TenantSettings> {
    try {
      const settings = await db('tenant_settings')
        .where('user_id', userId)
        .first();

      const user = await db('users')
        .where('id', userId)
        .first();

      return {
        timezone: settings?.timezone || 'America/Sao_Paulo',
        defaultFromEmail: settings?.default_from_email || user?.email || '',
        defaultFromName: settings?.default_from_name || user?.name || 'UltraZend User',
        bounceHandling: settings?.bounce_handling || true,
        openTracking: settings?.open_tracking || true,
        clickTracking: settings?.click_tracking || true,
        unsubscribeTracking: settings?.unsubscribe_tracking || true,
        suppressionListEnabled: settings?.suppression_list_enabled || true
      };
    } catch (error) {
      logger.error('Erro ao buscar configurações do tenant', { userId, error });
      
      // Retornar configurações padrão
      return {
        timezone: 'America/Sao_Paulo',
        defaultFromEmail: '',
        defaultFromName: 'UltraZend User',
        bounceHandling: true,
        openTracking: true,
        clickTracking: true,
        unsubscribeTracking: true,
        suppressionListEnabled: true
      };
    }
  }

  async refreshTenantContext(userId: number): Promise<TenantContext> {
    this.contextCache.delete(userId);
    return await this.getTenantContext(userId, true);
  }

  async invalidateCache(userId?: number): Promise<void> {
    if (userId) {
      this.contextCache.delete(userId);
    } else {
      this.contextCache.clear();
    }
  }

  async updateLastActivity(userId: number): Promise<void> {
    try {
      await db('users')
        .where('id', userId)
        .update({ last_activity: new Date() });

      // Invalidar cache para forçar reload na próxima consulta
      this.contextCache.delete(userId);
    } catch (error) {
      logger.error('Erro ao atualizar última atividade', { userId, error });
    }
  }

  async getTenantMetrics(userId: number): Promise<any> {
    try {
      const context = await this.getTenantContext(userId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [emailsToday, emailsThisMonth, totalEmails] = await Promise.all([
        db('emails')
          .where('user_id', userId)
          .where('created_at', '>=', today)
          .count('* as count')
          .first(),
        
        db('emails')
          .where('user_id', userId)
          .where('created_at', '>=', new Date(today.getFullYear(), today.getMonth(), 1))
          .count('* as count')
          .first(),
        
        db('emails')
          .where('user_id', userId)
          .count('* as count')
          .first()
      ]);

      return {
        plan: context.plan,
        isActive: context.isActive,
        limits: context.planLimits,
        usage: {
          emailsToday: parseInt(String(emailsToday?.count || 0)),
          emailsThisMonth: parseInt(String(emailsThisMonth?.count || 0)),
          totalEmails: parseInt(String(totalEmails?.count || 0)),
          verifiedDomains: context.verifiedDomains.length
        },
        rateLimits: context.rateLimits,
        lastActivity: context.lastActivity
      };
    } catch (error) {
      logger.error('Erro ao obter métricas do tenant', { userId, error });
      throw error;
    }
  }

  async getAllTenants(): Promise<number[]> {
    try {
      const users = await db('users')
        .where('is_verified', true)
        .where('is_suspended', false)
        .select('id');

      return users.map(user => user.id);
    } catch (error) {
      logger.error('Erro ao obter lista de tenants', { error });
      return [];
    }
  }
}

// Export singleton instance
export const tenantContextService = TenantContextService.getInstance();