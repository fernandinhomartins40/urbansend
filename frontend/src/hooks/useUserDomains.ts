import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

// Types para domínios
export interface UserDomain {
  id: number
  domain_name: string
  is_verified: boolean
  verification_status: 'pending' | 'verified' | 'failed'
  dkim_enabled: boolean
  spf_enabled: boolean
  dmarc_enabled: boolean
  created_at: string
  verified_at?: string
}

export interface DomainValidationResult {
  valid: boolean
  domain: string
  available: boolean
  message: string
}

// Query keys para domínios
export const domainQueryKeys = {
  all: ['user-domains'] as const,
  verified: () => [...domainQueryKeys.all, 'verified'] as const,
  list: () => [...domainQueryKeys.all, 'list'] as const,
  detail: (id: number) => [...domainQueryKeys.all, 'detail', id] as const,
}

/**
 * Hook para buscar domínios verificados do usuário
 * Usado principalmente para seleção de remetente
 */
export const useUserDomains = () => {
  return useQuery({
    queryKey: domainQueryKeys.list(),
    queryFn: async () => {
      const response = await api.get('/domains')
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 15 * 60 * 1000, // 15 minutos
    onError: (error: any) => {
      console.error('Error fetching user domains:', error)
      toast.error('Erro ao carregar domínios do usuário')
    }
  })
}

/**
 * Hook para buscar apenas domínios verificados
 * Otimizado para seleção de remetente
 */
export const useVerifiedDomains = () => {
  return useQuery({
    queryKey: domainQueryKeys.verified(),
    queryFn: async () => {
      const response = await api.get('/domains?verified_only=true')
      return response.data
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    select: (data) => {
      // Filtrar apenas domínios verificados no frontend também
      return {
        ...data,
        data: {
          ...data.data,
          domains: data.data?.domains?.filter((domain: UserDomain) => domain.is_verified) || []
        }
      }
    },
    onError: (error: any) => {
      console.error('Error fetching verified domains:', error)
      toast.error('Erro ao carregar domínios verificados')
    }
  })
}

/**
 * Hook para buscar detalhes de um domínio específico
 */
export const useDomainDetails = (domainId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: domainQueryKeys.detail(domainId),
    queryFn: async () => {
      const response = await api.get(`/domains/${domainId}`)
      return response.data
    },
    enabled: enabled && !!domainId,
    staleTime: 2 * 60 * 1000, // 2 minutos (dados mais dinâmicos)
    cacheTime: 10 * 60 * 1000,
    onError: (error: any) => {
      console.error('Error fetching domain details:', error)
      toast.error('Erro ao carregar detalhes do domínio')
    }
  })
}

/**
 * Hook para validar domínio
 */
export const useDomainValidation = () => {
  return useMutation({
    mutationFn: async (domain: string): Promise<DomainValidationResult> => {
      const response = await api.post('/domain-setup/validate', { domain })
      return response.data.data
    },
    onError: (error: any) => {
      console.error('Domain validation error:', error)
      // Não mostrar toast aqui - será tratado pelo componente
    }
  })
}

/**
 * Hook para verificar DNS de um domínio
 */
export const useDomainVerification = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (domainId: number) => {
      const response = await api.post(`/domain-setup/${domainId}/verify`)
      return response.data
    },
    onSuccess: (data, domainId) => {
      toast.success('Verificação DNS iniciada com sucesso!')
      
      // Invalidar cache dos domínios para atualizar status
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.detail(domainId) })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao verificar domínio')
    }
  })
}

/**
 * Hook para refresh manual dos domínios
 */
export const useRefreshDomains = () => {
  const queryClient = useQueryClient()
  
  return () => {
    queryClient.invalidateQueries({ queryKey: domainQueryKeys.all })
    toast.success('Lista de domínios atualizada!')
  }
}

/**
 * Utility function para verificar se usuário tem domínios verificados
 */
export const useHasVerifiedDomains = (): boolean => {
  const { data } = useVerifiedDomains()
  return (data?.data?.domains?.length || 0) > 0
}

/**
 * Utility function para obter domínio padrão verificado
 */
export const useDefaultVerifiedDomain = (): UserDomain | null => {
  const { data } = useVerifiedDomains()
  const domains = data?.data?.domains || []
  
  // Retornar o primeiro domínio verificado mais recente
  return domains.length > 0 ? domains[0] : null
}