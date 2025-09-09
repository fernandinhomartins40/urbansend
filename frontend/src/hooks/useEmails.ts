import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys, queryOptions, type EmailFilters } from '@/lib/queryClient'
import { emailApi } from '@/lib/api'
import toast from 'react-hot-toast'

/**
 * Interfaces TypeScript para emails
 */
export interface Email {
  id: number
  user_id: number
  to_email: string
  from_email: string
  reply_to?: string
  subject: string
  html_content?: string
  text_content: string
  status: 'draft' | 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'opened' | 'clicked'
  template_id?: number
  tracking_enabled: boolean
  created_at: string
  sent_at?: string
  delivered_at?: string
  opened_at?: string
  clicked_at?: string
  bounce_reason?: string
  variables?: Record<string, string>
  
  // Analytics relacionados
  analytics?: {
    opens: number
    clicks: number
    forwards: number
    replies: number
    engagement_score: number
  }
}

export interface EmailListResponse {
  success: boolean
  data: {
    emails: Email[]
    pagination: {
      current_page: number
      total_pages: number
      per_page: number
      total_count: number
      has_next: boolean
      has_prev: boolean
    }
    filters: EmailFilters
    stats: {
      total: number
      sent: number
      delivered: number
      opened: number
      clicked: number
      bounced: number
    }
  }
}

export interface EmailDetailResponse {
  success: boolean
  data: Email & {
    analytics_detail: {
      events: Array<{
        type: string
        timestamp: string
        ip_address?: string
        user_agent?: string
        location?: string
      }>
      timeline: Array<{
        status: string
        timestamp: string
        details?: string
      }>
    }
  }
}

/**
 * Hook principal para buscar emails com cache otimizado
 * Usa keepPreviousData para melhor UX durante loading
 */
export const useEmails = (filters: EmailFilters = {}) => {
  return useQuery({
    queryKey: queryKeys.emails.list(filters),
    queryFn: async (): Promise<EmailListResponse> => {
      const response = await emailApi.getEmails(filters)
      return response.data
    },
    ...queryOptions.dynamic, // Dados dinâmicos (30s stale, 2min cache)
    placeholderData: (previousData) => previousData, // Manter dados anteriores durante loading
    staleTime: 2 * 60 * 1000, // 2 minutos para emails (dados mais dinâmicos)
    gcTime: 5 * 60 * 1000,    // 5 minutos de cache
    select: (data) => ({
      ...data,
      // Otimizações de seleção de dados
      data: {
        ...data.data,
        emails: data.data.emails.map(email => ({
          ...email,
          // Calcular engagement score no cliente para evitar processamento no servidor
          analytics: email.analytics ? {
            ...email.analytics,
            engagement_score: calculateEngagementScore(email.analytics)
          } : undefined
        }))
      }
    }),
    meta: {
      errorMessage: 'Erro ao carregar emails'
    }
  })
}

/**
 * Hook para buscar detalhes de um email específico
 * Cache mais longo por serem dados menos dinâmicos
 */
export const useEmailDetails = (id: string | number, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.emails.detail(id),
    queryFn: async (): Promise<EmailDetailResponse> => {
      const response = await emailApi.getEmail(id)
      return response.data
    },
    enabled: enabled && !!id,
    ...queryOptions.stable, // 5 min stale, 15 min cache
    staleTime: 10 * 60 * 1000, // 10 minutos para detalhes (menos dinâmicos)
    select: (data) => ({
      ...data,
      data: {
        ...data.data,
        // Ordenar timeline por timestamp
        analytics_detail: {
          ...data.data.analytics_detail,
          timeline: data.data.analytics_detail.timeline.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        }
      }
    }),
    meta: {
      errorMessage: 'Erro ao carregar detalhes do email'
    }
  })
}

/**
 * Hook para busca de emails com debounce automático
 * Otimizado para search em tempo real
 */
export const useEmailSearch = (query: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.emails.search(query),
    queryFn: async () => {
      const response = await emailApi.getEmails({ search: query, limit: 20 })
      return response.data
    },
    enabled: enabled && query.length >= 3, // Só buscar com 3+ caracteres
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 2 * 60 * 1000,    // 2 minutos
    placeholderData: (previousData) => previousData,
    meta: {
      errorMessage: 'Erro ao buscar emails'
    }
  })
}

/**
 * Hook para estatísticas de emails do dashboard
 * Cache mais agressivo por dados que mudam menos
 */
export const useEmailStats = (period: string = '30d') => {
  return useQuery({
    queryKey: queryKeys.emails.stats(period),
    queryFn: async () => {
      const response = await emailApi.getEmailStats(period)
      return response.data
    },
    ...queryOptions.stable,
    staleTime: 5 * 60 * 1000, // 5 minutos
    select: (data) => ({
      ...data,
      // Calcular métricas adicionais no cliente
      delivery_rate: data.delivered / (data.sent || 1) * 100,
      open_rate: data.opened / (data.delivered || 1) * 100,
      click_rate: data.clicked / (data.opened || 1) * 100,
      bounce_rate: data.bounced / (data.sent || 1) * 100,
    }),
    meta: {
      errorMessage: 'Erro ao carregar estatísticas de emails'
    }
  })
}

/**
 * Hook para paginação infinita de emails
 * Ideal para listas longas com scroll infinito
 */
export const useInfiniteEmails = (filters: EmailFilters = {}) => {
  return useInfiniteQuery({
    queryKey: queryKeys.emails.infinite(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await emailApi.getEmails({ 
        ...filters, 
        page: pageParam, 
        limit: filters.limit || 50 
      })
      return response.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.data.pagination.has_next 
        ? lastPage.data.pagination.current_page + 1 
        : undefined
    },
    getPreviousPageParam: (firstPage) => {
      return firstPage.data.pagination.has_prev 
        ? firstPage.data.pagination.current_page - 1 
        : undefined
    },
    placeholderData: (previousData) => previousData,
    staleTime: 2 * 60 * 1000, // 2 minutos
    gcTime: 10 * 60 * 1000,   // 10 minutos
    maxPages: 20, // Limite de páginas em memória
    meta: {
      errorMessage: 'Erro ao carregar mais emails'
    }
  })
}

/**
 * Mutation para envio de emails com otimistic updates
 */
export const useSendEmail = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: emailApi.send,
    onMutate: async (newEmail) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.emails.all })

      // Snapshot the previous value
      const previousEmails = queryClient.getQueriesData({ 
        queryKey: queryKeys.emails.all 
      })

      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: queryKeys.emails.lists() },
        (old: any) => {
          if (!old) return old
          
          const optimisticEmail = {
            id: Date.now(), // ID temporário
            ...newEmail,
            status: 'queued' as const,
            created_at: new Date().toISOString(),
          }

          return {
            ...old,
            data: {
              ...old.data,
              emails: [optimisticEmail, ...old.data.emails],
              stats: {
                ...old.data.stats,
                total: old.data.stats.total + 1
              }
            }
          }
        }
      )

      return { previousEmails }
    },
    onError: (err, newEmail, context) => {
      // Rollback on error
      if (context?.previousEmails) {
        context.previousEmails.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      toast.error('Erro ao enviar email')
    },
    onSuccess: () => {
      toast.success('Email enviado com sucesso!')
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    }
  })
}

/**
 * Mutation para deletar email
 */
export const useDeleteEmail = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: emailApi.deleteEmail,
    onSuccess: (_, emailId) => {
      // Remove email do cache
      queryClient.removeQueries({ 
        queryKey: queryKeys.emails.detail(emailId) 
      })
      
      // Atualizar listas
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.lists() })
      
      toast.success('Email deletado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao deletar email')
    }
  })
}

/**
 * Hook para prefetch de emails
 * Útil para precarregar dados em hover ou navegação prevista
 */
export const usePrefetchEmail = () => {
  const queryClient = useQueryClient()

  return (id: string | number) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.emails.detail(id),
      queryFn: () => emailApi.getEmail(id),
      staleTime: 10 * 60 * 1000, // 10 minutos
    })
  }
}

/**
 * Utilities para otimizações
 */

/**
 * Calcular engagement score baseado em métricas
 */
const calculateEngagementScore = (analytics: Email['analytics']): number => {
  if (!analytics) return 0
  
  const { opens, clicks, forwards, replies } = analytics
  
  // Algoritmo simples de engagement
  const openWeight = 1
  const clickWeight = 3
  const forwardWeight = 5
  const replyWeight = 7
  
  return Math.min(100, 
    (opens * openWeight) + 
    (clicks * clickWeight) + 
    (forwards * forwardWeight) + 
    (replies * replyWeight)
  )
}

/**
 * Hook customizado para gerenciar cache de emails
 */
export const useEmailCache = () => {
  const queryClient = useQueryClient()

  return {
    // Invalidar todos os caches de email
    invalidateAll: () => queryClient.invalidateQueries({ 
      queryKey: queryKeys.emails.all 
    }),
    
    // Invalidar apenas listas
    invalidateLists: () => queryClient.invalidateQueries({ 
      queryKey: queryKeys.emails.lists() 
    }),
    
    // Remover email específico do cache
    removeEmail: (id: string | number) => queryClient.removeQueries({ 
      queryKey: queryKeys.emails.detail(id) 
    }),
    
    // Prefetch em batch
    prefetchEmails: (ids: Array<string | number>) => {
      ids.forEach(id => {
        queryClient.prefetchQuery({
          queryKey: queryKeys.emails.detail(id),
          queryFn: () => emailApi.getEmail(id),
          staleTime: 10 * 60 * 1000,
        })
      })
    },

    // Limpar cache antigo
    cleanup: () => {
      queryClient.removeQueries({
        queryKey: queryKeys.emails.all,
        predicate: (query) => !query.getObserversCount() && query.isStale()
      })
    }
  }
}