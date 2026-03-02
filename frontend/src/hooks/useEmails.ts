import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { emailApi } from '@/lib/api'
import { queryKeys, queryOptions, type EmailFilters } from '@/lib/queryClient'

export interface Email {
  id: number
  user_id: number
  to_email: string
  from_email: string
  reply_to?: string
  subject: string
  html_content?: string
  text_content?: string
  status: 'draft' | 'queued' | 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'opened' | 'clicked'
  template_id?: number | string
  tracking_enabled: boolean
  created_at: string
  sent_at?: string
  delivered_at?: string
  opened_at?: string
  clicked_at?: string
  bounce_reason?: string
  variables?: Record<string, string> | string
}

export interface EmailAnalyticsEvent {
  id: number
  email_id: number
  event_type: string
  tracking_id?: string
  link_url?: string
  user_agent?: string
  ip_address?: string
  location?: string
  created_at: string
}

export interface EmailListResponse {
  emails: Email[]
  pagination: {
    page: number
    pages: number
    total: number
    limit: number
  }
  stats: {
    total: number
    delivered: number
    opened: number
    clicked: number
  }
  architecture_stats?: {
    phase2_enabled: boolean
    delivery_rate: number
    modification_rate: number
    total_processed: number
    sender_corrections: number
    last_30_days: {
      sent: number
      failed: number
    }
  }
}

export interface EmailDetailResponse {
  email: Email
  analytics: EmailAnalyticsEvent[]
}

interface EmailStatsOverviewResponse {
  stats: {
    totalEmails: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    deliveryRate: number
    openRate: number
    clickRate: number
    bounceRate: number
  }
}

export const useEmails = (filters: EmailFilters = {}) => {
  return useQuery({
    queryKey: queryKeys.emails.list(filters),
    queryFn: async (): Promise<EmailListResponse> => {
      const response = await emailApi.getEmails(filters)
      return response.data
    },
    ...queryOptions.dynamic,
    placeholderData: (previousData) => previousData,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    meta: {
      errorMessage: 'Erro ao carregar emails'
    }
  })
}

export const useEmailDetails = (id: string | number, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.emails.detail(id),
    queryFn: async (): Promise<EmailDetailResponse> => {
      const response = await emailApi.getEmail(id)
      return response.data
    },
    enabled: enabled && !!id,
    ...queryOptions.stable,
    staleTime: 10 * 60 * 1000,
    select: (data) => ({
      ...data,
      analytics: [...data.analytics].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }),
    meta: {
      errorMessage: 'Erro ao carregar detalhes do email'
    }
  })
}

export const useEmailSearch = (query: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.emails.search(query),
    queryFn: async (): Promise<EmailListResponse> => {
      const response = await emailApi.getEmails({ search: query, limit: 20 })
      return response.data
    },
    enabled: enabled && query.length >= 3,
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    meta: {
      errorMessage: 'Erro ao buscar emails'
    }
  })
}

export const useEmailStats = (period: string = '30d') => {
  return useQuery({
    queryKey: queryKeys.emails.stats(period),
    queryFn: async () => {
      const response = await emailApi.getEmailStats(period)
      return response.data as EmailStatsOverviewResponse
    },
    ...queryOptions.stable,
    staleTime: 5 * 60 * 1000,
    select: (data) => ({
      sent: data.stats.totalEmails,
      delivered: data.stats.delivered,
      opened: data.stats.opened,
      clicked: data.stats.clicked,
      bounced: data.stats.bounced,
      delivery_rate: data.stats.deliveryRate,
      open_rate: data.stats.openRate,
      click_rate: data.stats.clickRate,
      bounce_rate: data.stats.bounceRate,
    }),
    meta: {
      errorMessage: 'Erro ao carregar estatisticas de emails'
    }
  })
}

export const useInfiniteEmails = (filters: EmailFilters = {}) => {
  return useInfiniteQuery({
    queryKey: queryKeys.emails.infinite(filters),
    queryFn: async ({ pageParam = 1 }): Promise<EmailListResponse> => {
      const response = await emailApi.getEmails({
        ...filters,
        page: pageParam,
        limit: filters.limit || 50
      })
      return response.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.page < lastPage.pagination.pages
        ? lastPage.pagination.page + 1
        : undefined
    },
    getPreviousPageParam: (firstPage) => {
      return firstPage.pagination.page > 1
        ? firstPage.pagination.page - 1
        : undefined
    },
    placeholderData: (previousData) => previousData,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    maxPages: 20,
    meta: {
      errorMessage: 'Erro ao carregar mais emails'
    }
  })
}

export const useSendEmail = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: emailApi.send,
    onMutate: async (newEmail) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.emails.all })

      const previousEmails = queryClient.getQueriesData({
        queryKey: queryKeys.emails.all
      })

      queryClient.setQueriesData(
        { queryKey: queryKeys.emails.lists() },
        (old: any) => {
          if (!old) return old

          const optimisticEmail = {
            id: Date.now(),
            ...newEmail,
            status: 'pending' as const,
            created_at: new Date().toISOString(),
          }

          return {
            ...old,
            emails: [optimisticEmail, ...(old.emails || [])],
            stats: {
              ...old.stats,
              total: (old.stats?.total || 0) + 1
            }
          }
        }
      )

      return { previousEmails }
    },
    onError: (_err, _newEmail, context) => {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    }
  })
}

export const useDeleteEmail = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: emailApi.deleteEmail,
    onSuccess: (_, emailId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.emails.detail(emailId)
      })

      queryClient.invalidateQueries({ queryKey: queryKeys.emails.lists() })
      toast.success('Email deletado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao deletar email')
    }
  })
}

export const usePrefetchEmail = () => {
  const queryClient = useQueryClient()

  return (id: string | number) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.emails.detail(id),
      queryFn: async () => {
        const response = await emailApi.getEmail(id)
        return response.data as EmailDetailResponse
      },
      staleTime: 10 * 60 * 1000,
    })
  }
}

export const useEmailCache = () => {
  const queryClient = useQueryClient()

  return {
    invalidateAll: () => queryClient.invalidateQueries({
      queryKey: queryKeys.emails.all
    }),

    invalidateLists: () => queryClient.invalidateQueries({
      queryKey: queryKeys.emails.lists()
    }),

    removeEmail: (id: string | number) => queryClient.removeQueries({
      queryKey: queryKeys.emails.detail(id)
    }),

    prefetchEmails: (ids: Array<string | number>) => {
      ids.forEach(id => {
        queryClient.prefetchQuery({
          queryKey: queryKeys.emails.detail(id),
          queryFn: async () => {
            const response = await emailApi.getEmail(id)
            return response.data as EmailDetailResponse
          },
          staleTime: 10 * 60 * 1000,
        })
      })
    },

    cleanup: () => {
      queryClient.removeQueries({
        queryKey: queryKeys.emails.all,
        predicate: (query) => !query.getObserversCount() && query.isStale()
      })
    }
  }
}
