import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import { queryKeys, type EmailFilters } from '@/lib/queryClient'
import { emailApi } from '@/lib/api'
import { type Email, type EmailListResponse } from './useEmails'

/**
 * Configurações para paginação infinita
 */
const INFINITE_CONFIG = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGES_IN_MEMORY: 20,
  PREFETCH_THRESHOLD: 10, // Quantos itens antes do fim para começar a carregar
  STALE_TIME: 2 * 60 * 1000, // 2 minutos
  CACHE_TIME: 10 * 60 * 1000, // 10 minutos
} as const

/**
 * Interface para resultado da paginação infinita
 */
export interface InfiniteEmailsResult {
  // Dados
  emails: Email[]
  totalCount: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  
  // Estados
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  
  // Funções
  fetchNextPage: () => Promise<any>
  fetchPreviousPage: () => Promise<any>
  refresh: () => Promise<any>
  
  // Utilidades
  getEmailsByStatus: (status: string) => Email[]
  getEmailsCount: () => number
  prefetchNext: () => void
  handleAutoPrefetch: (currentIndex: number) => void
}

/**
 * Hook principal para paginação infinita de emails
 * Otimizado para performance em listas longas
 */
export const useInfiniteEmails = (filters: EmailFilters = {}): InfiniteEmailsResult => {
  const queryClient = useQueryClient()

  // Garantir página size mínima e máxima
  const pageSize = Math.min(Math.max(filters.limit || INFINITE_CONFIG.DEFAULT_PAGE_SIZE, 10), 100)
  
  const normalizedFilters = {
    ...filters,
    limit: pageSize
  }

  const query = useInfiniteQuery({
    queryKey: queryKeys.emails.infinite(normalizedFilters),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await emailApi.getEmails({ 
        ...normalizedFilters, 
        page: pageParam
      })
      return response.data as EmailListResponse
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.data.pagination
      return pagination.has_next ? pagination.current_page + 1 : undefined
    },
    getPreviousPageParam: (firstPage) => {
      const pagination = firstPage.data.pagination
      return pagination.has_prev ? pagination.current_page - 1 : undefined
    },
    placeholderData: (previousData) => previousData,
    staleTime: INFINITE_CONFIG.STALE_TIME,
    gcTime: INFINITE_CONFIG.CACHE_TIME,
    maxPages: INFINITE_CONFIG.MAX_PAGES_IN_MEMORY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    meta: {
      errorMessage: 'Erro ao carregar emails'
    }
  })

  // Memoizar emails para evitar recalcular a cada render
  const emails = useMemo(() => {
    if (!query.data?.pages) return []
    
    return query.data.pages.flatMap(page => page.data.emails)
  }, [query.data?.pages])

  // Memoizar total count
  const totalCount = useMemo(() => {
    return query.data?.pages?.[0]?.data.pagination.total_count ?? 0
  }, [query.data?.pages])

  // Função para filtrar emails por status (otimizada)
  const getEmailsByStatus = useCallback((status: string) => {
    return emails.filter(email => email.status === status)
  }, [emails])

  // Função para contar emails
  const getEmailsCount = useCallback(() => {
    return emails.length
  }, [emails.length])

  // Prefetch da próxima página quando próximo do fim
  const prefetchNext = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      const nextPageParam = query.data?.pages?.[query.data.pages.length - 1]
      if (nextPageParam) {
        const pagination = nextPageParam.data.pagination
        if (pagination.has_next) {
          queryClient.prefetchQuery({
            queryKey: [...queryKeys.emails.infinite(normalizedFilters), pagination.current_page + 1],
            queryFn: () =>
              emailApi.getEmails({
                ...normalizedFilters,
                page: pagination.current_page + 1,
              }),
            staleTime: INFINITE_CONFIG.STALE_TIME,
          })
        }
      }
    }
  }, [query.hasNextPage, query.isFetchingNextPage, query.data?.pages, queryClient, normalizedFilters])

  // Auto-prefetch quando próximo do final
  const handleAutoPrefetch = useCallback((currentIndex: number) => {
    const remainingItems = emails.length - currentIndex
    if (remainingItems <= INFINITE_CONFIG.PREFETCH_THRESHOLD && query.hasNextPage) {
      prefetchNext()
    }
  }, [emails.length, query.hasNextPage, prefetchNext])

  // Função de refresh otimizada
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ 
      queryKey: queryKeys.emails.infinite(normalizedFilters) 
    })
    return query.refetch()
  }, [queryClient, normalizedFilters, query.refetch])

  return {
    // Dados processados
    emails,
    totalCount,
    hasNextPage: query.hasNextPage ?? false,
    hasPreviousPage: query.hasPreviousPage ?? false,
    
    // Estados da query
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    
    // Funções de navegação
    fetchNextPage: query.fetchNextPage,
    fetchPreviousPage: query.fetchPreviousPage,
    refresh,
    
    // Utilidades
    getEmailsByStatus,
    getEmailsCount,
    prefetchNext,

    // Função para auto-prefetch (pode ser chamada pelo componente de lista)
    handleAutoPrefetch,
  }
}

/**
 * Hook especializado para busca infinita com debounce
 */
export const useInfiniteEmailSearch = (query: string, options: { enabled?: boolean, debounceMs?: number } = {}) => {
  const { enabled = true, debounceMs = 500 } = options

  return useInfiniteEmails({
    search: query,
    limit: 30, // Menor para busca
  })
}

/**
 * Hook para emails infinitos por status
 */
export const useInfiniteEmailsByStatus = (status: string, additionalFilters: EmailFilters = {}) => {
  return useInfiniteEmails({
    status,
    ...additionalFilters,
  })
}

/**
 * Hook para emails infinitos com filtro de data
 */
export const useInfiniteEmailsByDateRange = (
  fromDate?: string, 
  toDate?: string, 
  additionalFilters: EmailFilters = {}
) => {
  return useInfiniteEmails({
    from_date: fromDate,
    to_date: toDate,
    ...additionalFilters,
  })
}

/**
 * Utilitários para gerenciar cache de paginação infinita
 */
export const useInfiniteEmailsCache = () => {
  const queryClient = useQueryClient()

  return {
    // Invalidar todas as queries infinitas
    invalidateAll: () => {
      queryClient.invalidateQueries({
        predicate: (query) => 
          query.queryKey[0] === 'emails' && 
          query.queryKey[1] === 'infinite'
      })
    },

    // Remover páginas antigas de uma query específica
    trimPages: (filters: EmailFilters, keepPages: number = 10) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.emails.infinite(filters) },
        (data: any) => {
          if (!data?.pages) return data
          
          // Manter apenas as últimas X páginas
          const pages = data.pages.slice(-keepPages)
          const pageParams = data.pageParams.slice(-keepPages)
          
          return {
            ...data,
            pages,
            pageParams
          }
        }
      )
    },

    // Reset para primeira página
    resetToFirstPage: (filters: EmailFilters) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.emails.infinite(filters) },
        (data: any) => {
          if (!data?.pages || data.pages.length <= 1) return data
          
          // Manter apenas a primeira página
          return {
            ...data,
            pages: data.pages.slice(0, 1),
            pageParams: data.pageParams.slice(0, 1)
          }
        }
      )
    },

    // Limpar cache específico
    clear: (filters: EmailFilters) => {
      queryClient.removeQueries({
        queryKey: queryKeys.emails.infinite(filters)
      })
    },

    // Prefetch múltiplas páginas
    prefetchPages: async (filters: EmailFilters, pageCount: number = 3) => {
      const promises = []
      for (let i = 1; i <= pageCount; i++) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: [...queryKeys.emails.infinite(filters), i],
            queryFn: () => emailApi.getEmails({ ...filters, page: i }),
            staleTime: INFINITE_CONFIG.STALE_TIME,
          })
        )
      }
      await Promise.all(promises)
    }
  }
}

/**
 * Hook para observar scroll e implementar infinite scroll automático
 */
export const useInfiniteScroll = (
  infiniteQuery: ReturnType<typeof useInfiniteEmails>,
  options: {
    threshold?: number
    rootMargin?: string
    enabled?: boolean
  } = {}
) => {
  const { threshold = 0.8, rootMargin = '100px', enabled = true } = options

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage && enabled) {
        infiniteQuery.fetchNextPage()
      }
    },
    [infiniteQuery.hasNextPage, infiniteQuery.isFetchingNextPage, infiniteQuery.fetchNextPage, enabled]
  )

  const observerRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !enabled) return

      const observer = new IntersectionObserver(observerCallback, {
        threshold,
        rootMargin,
      })

      observer.observe(node)

      return () => observer.disconnect()
    },
    [observerCallback, threshold, rootMargin, enabled]
  )

  return observerRef
}
