import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

export interface UserDomain {
  id: number
  domain_name: string
  is_verified: boolean
  verification_status: 'pending' | 'partial' | 'verified' | 'failed'
  dkim_enabled: boolean
  spf_enabled: boolean
  dmarc_enabled: boolean
  created_at: string
  verified_at?: string
  completion_percentage?: number
}

export interface DomainValidationResult {
  valid: boolean
  domain: string
  available: boolean
  message: string
}

export const domainQueryKeys = {
  all: ['user-domains'] as const,
  verified: () => [...domainQueryKeys.all, 'verified'] as const,
  list: () => [...domainQueryKeys.all, 'list'] as const,
  detail: (id: number) => [...domainQueryKeys.all, 'detail', id] as const,
}

const mapDomain = (domain: any): UserDomain => ({
  id: Number(domain.id),
  domain_name: domain.domain_name || domain.name,
  is_verified: Boolean(domain.is_verified),
  verification_status: domain.verification_status || domain.status || 'pending',
  dkim_enabled: Boolean(domain.dkim_enabled ?? domain.dns_status?.dkim?.configured),
  spf_enabled: Boolean(domain.spf_enabled ?? domain.dns_status?.spf?.configured),
  dmarc_enabled: Boolean(domain.dmarc_enabled ?? domain.dns_status?.dmarc?.configured),
  created_at: domain.created_at,
  verified_at: domain.verified_at || undefined,
  completion_percentage: Number(domain.completion_percentage ?? 0),
})

export const useUserDomains = () => {
  return useQuery({
    queryKey: domainQueryKeys.list(),
    queryFn: async () => {
      const response = await api.get('/domain-setup/domains')
      const domains = (response.data.data?.domains || []).map(mapDomain)

      return {
        success: true,
        data: {
          domains,
          stats: response.data.data?.summary || {
            total: domains.length,
            verified: domains.filter((domain: UserDomain) => domain.verification_status === 'verified').length,
            pending: domains.filter((domain: UserDomain) => domain.verification_status === 'pending').length,
            failed: domains.filter((domain: UserDomain) => domain.verification_status === 'failed').length,
          },
        },
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  }) as any
}

export const useVerifiedDomains = () => {
  return useQuery({
    queryKey: domainQueryKeys.verified(),
    queryFn: async () => {
      const response = await api.get('/domain-setup/domains')
      const domains = (response.data.data?.domains || []).map(mapDomain)

      return {
        success: true,
        data: {
          domains,
        },
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    select: (data) => ({
      ...data,
      data: {
        ...data.data,
        domains:
          data.data?.domains?.filter(
            (domain: UserDomain) => domain.is_verified && domain.verification_status === 'verified'
          ) || [],
      },
    }),
  }) as any
}

export const useDomainDetails = (domainId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: domainQueryKeys.detail(domainId),
    queryFn: async () => {
      const response = await api.get(`/domain-setup/domains/${domainId}`)
      return response.data
    },
    enabled: enabled && !!domainId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  }) as any
}

export const useDomainValidation = () => {
  return useMutation({
    mutationFn: async (domain: string): Promise<DomainValidationResult> => {
      const response = await api.post('/domain-setup/validate', { domain })
      return response.data.data
    },
    onError: (error: any) => {
      console.error('Domain validation error:', error)
    },
  })
}

export const useDomainVerification = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (domainId: number) => {
      const response = await api.post(`/domain-setup/${domainId}/verify`)
      return response.data
    },
    onSuccess: (_data, domainId) => {
      toast.success('Verificacao DNS executada com sucesso')
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.detail(domainId) })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao verificar dominio')
    },
  })
}

export const useRefreshDomains = () => {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: domainQueryKeys.all })
    toast.success('Lista de dominios atualizada')
  }
}

export const useHasVerifiedDomains = (): boolean => {
  const { data } = useVerifiedDomains()
  return (data?.data?.domains?.length || 0) > 0
}

export const useDefaultVerifiedDomain = (): UserDomain | null => {
  const { data } = useVerifiedDomains()
  const domains = data?.data?.domains || []
  return domains.length > 0 ? domains[0] : null
}
