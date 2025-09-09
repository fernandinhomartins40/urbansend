import { QueryClient } from '@tanstack/react-query'

/**
 * Configuração global otimizada do React Query
 * Implementa cache inteligente e otimizações de performance
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache Strategy: Stale-While-Revalidate
      staleTime: 5 * 60 * 1000,        // 5 minutos - dados considerados "frescos"
      gcTime: 30 * 60 * 1000,          // 30 minutos - tempo antes da garbage collection (ex-cacheTime)
      retry: 2,                        // 2 tentativas em caso de erro
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff exponencial
      refetchOnWindowFocus: false,     // Não refetch ao focar janela (evita requests desnecessários)
      refetchOnMount: true,            // Refetch ao montar componente se stale
      refetchOnReconnect: true,        // Refetch ao reconectar internet
      networkMode: 'online',           // Só fazer requests online
      
      // Performance otimizations
      structuralSharing: true,         // Compartilhamento estrutural para evitar re-renders
      throwOnError: false,             // Não lançar erros globalmente (tratar localmente)
    },
    mutations: {
      retry: 1,                        // 1 tentativa para mutations
      retryDelay: 1000,               // 1 segundo de delay
      networkMode: 'online',
      throwOnError: false,
    }
  }
})

/**
 * Query keys centralizados para todas as entidades do sistema
 * Hierarquia organizada para invalidação eficiente de cache
 */
export const queryKeys = {
  // === EMAILS ===
  emails: {
    all: ['emails'] as const,
    lists: () => [...queryKeys.emails.all, 'list'] as const,
    list: (filters: EmailFilters) => [...queryKeys.emails.lists(), filters] as const,
    infinite: (filters: EmailFilters) => [...queryKeys.emails.all, 'infinite', filters] as const,
    details: () => [...queryKeys.emails.all, 'detail'] as const,
    detail: (id: string | number) => [...queryKeys.emails.details(), id] as const,
    search: (query: string) => [...queryKeys.emails.all, 'search', query] as const,
    analytics: () => [...queryKeys.emails.all, 'analytics'] as const,
    stats: (period: string) => [...queryKeys.emails.analytics(), period] as const,
  },

  // === TEMPLATES ===
  templates: {
    all: ['templates'] as const,
    lists: () => [...queryKeys.templates.all, 'list'] as const,
    list: (filters: TemplateFilters) => [...queryKeys.templates.lists(), filters] as const,
    details: () => [...queryKeys.templates.all, 'detail'] as const,
    detail: (id: string | number) => [...queryKeys.templates.details(), id] as const,
    categories: () => [...queryKeys.templates.all, 'categories'] as const,
    shared: () => [...queryKeys.templates.all, 'shared'] as const,
    system: () => [...queryKeys.templates.all, 'system'] as const,
  },

  // === DOMAINS ===
  domains: {
    all: ['domains'] as const,
    lists: () => [...queryKeys.domains.all, 'list'] as const,
    list: (filters?: DomainFilters) => [...queryKeys.domains.lists(), filters || {}] as const,
    verified: () => [...queryKeys.domains.all, 'verified'] as const,
    details: () => [...queryKeys.domains.all, 'detail'] as const,
    detail: (id: string | number) => [...queryKeys.domains.details(), id] as const,
    verification: (id: string | number) => [...queryKeys.domains.all, 'verification', id] as const,
    dns: (domain: string) => [...queryKeys.domains.all, 'dns', domain] as const,
    analytics: (id: string | number) => [...queryKeys.domains.details(), id, 'analytics'] as const,
  },

  // === USER & AUTH ===
  user: {
    all: ['user'] as const,
    profile: () => [...queryKeys.user.all, 'profile'] as const,
    settings: () => [...queryKeys.user.all, 'settings'] as const,
    usage: () => [...queryKeys.user.all, 'usage'] as const,
    permissions: () => [...queryKeys.user.all, 'permissions'] as const,
  },

  // === ANALYTICS ===
  analytics: {
    all: ['analytics'] as const,
    dashboard: (period: string) => [...queryKeys.analytics.all, 'dashboard', period] as const,
    performance: (filters: AnalyticsFilters) => [...queryKeys.analytics.all, 'performance', filters] as const,
    trends: (period: string) => [...queryKeys.analytics.all, 'trends', period] as const,
    segments: () => [...queryKeys.analytics.all, 'segments'] as const,
    reports: (type: string, period: string) => [...queryKeys.analytics.all, 'reports', type, period] as const,
  },

  // === SYSTEM ===
  system: {
    all: ['system'] as const,
    health: () => [...queryKeys.system.all, 'health'] as const,
    metrics: () => [...queryKeys.system.all, 'metrics'] as const,
    logs: (level?: string) => [...queryKeys.system.all, 'logs', level || 'all'] as const,
  },

  // === WEBHOOKS ===
  webhooks: {
    all: ['webhooks'] as const,
    lists: () => [...queryKeys.webhooks.all, 'list'] as const,
    detail: (id: string | number) => [...queryKeys.webhooks.all, 'detail', id] as const,
    logs: (id: string | number) => [...queryKeys.webhooks.all, 'logs', id] as const,
  }
} as const

/**
 * Tipos TypeScript para filtros
 */
export interface EmailFilters {
  search?: string
  status?: string
  date_filter?: string
  from_date?: string
  to_date?: string
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface TemplateFilters {
  search?: string
  category?: string
  is_active?: boolean
  template_type?: 'user' | 'system' | 'shared'
  page?: number
  limit?: number
}

export interface DomainFilters {
  search?: string
  is_verified?: boolean
  has_dkim?: boolean
  has_spf?: boolean
  has_dmarc?: boolean
}

export interface AnalyticsFilters {
  period?: string
  segment_id?: string | number
  event_type?: string
  domain_id?: string | number
}

/**
 * Utilitários para gerenciamento de cache
 */
export const cacheUtils = {
  /**
   * Invalidar todos os caches relacionados a emails
   */
  invalidateEmails: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
  },

  /**
   * Invalidar todos os caches relacionados a domínios
   */
  invalidateDomains: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.domains.all })
  },

  /**
   * Invalidar todos os caches relacionados a templates
   */
  invalidateTemplates: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
  },

  /**
   * Invalidar analytics
   */
  invalidateAnalytics: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all })
  },

  /**
   * Limpar cache completamente (usar com cuidado)
   */
  clearAll: async () => {
    await queryClient.clear()
  },

  /**
   * Remover queries não utilizadas (garbage collection manual)
   */
  removeUnused: () => {
    queryClient.removeQueries({ 
      predicate: (query) => !query.getObserversCount() && query.isStale()
    })
  }
}

/**
 * Inicializar configurações adicionais do cache
 * (Versão simplificada sem persistência externa)
 */
export const initializePersistence = () => {
  if (typeof window !== 'undefined') {
    // Log de inicialização do cache otimizado
    console.log('✅ Cache otimizado da Fase 2 inicializado')
    console.log('📊 Configurações:', {
      staleTime: '5 minutos',
      gcTime: '30 minutos', 
      retries: 2,
      persistência: 'React Query padrão'
    })
  }
}

/**
 * Configurações específicas por tipo de query
 */
export const queryOptions = {
  // Dados que mudam frequentemente (emails, analytics em tempo real)
  dynamic: {
    staleTime: 30 * 1000,         // 30 segundos
    gcTime: 2 * 60 * 1000,        // 2 minutos
  },

  // Dados que mudam ocasionalmente (domínios, configurações)
  stable: {
    staleTime: 5 * 60 * 1000,     // 5 minutos
    gcTime: 15 * 60 * 1000,       // 15 minutos
  },

  // Dados que raramente mudam (templates, configurações de sistema)
  static: {
    staleTime: 30 * 60 * 1000,    // 30 minutos
    gcTime: 60 * 60 * 1000,       // 1 hora
  }
}

export default queryClient