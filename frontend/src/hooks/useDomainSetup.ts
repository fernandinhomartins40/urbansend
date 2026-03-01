import { useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

export interface DNSRecordInstruction {
  record: string
  value: string
  priority: number
  description: string
}

export interface DNSInstructions {
  a_records: Record<string, DNSRecordInstruction>
  mx?: DNSRecordInstruction
  spf?: DNSRecordInstruction
  dkim?: DNSRecordInstruction
  dmarc?: DNSRecordInstruction
}

export interface DomainRecord {
  id: number
  name: string
  status: 'pending' | 'partial' | 'verified' | 'failed'
  completion_percentage?: number
  is_verified?: boolean
  created_at: string
  verified_at?: string
}

export interface DomainSetupResult {
  domain: DomainRecord
  dns_instructions: DNSInstructions
  setup_guide: string[]
}

export interface DNSVerificationResult {
  valid: boolean
  status?: 'verified' | 'pending' | 'failed'
  expected?: string
  found?: string
  error?: string
}

export interface VerificationResult {
  success: boolean
  domain: string
  all_passed: boolean
  verified_at: string
  results: {
    spf: DNSVerificationResult
    dkim: DNSVerificationResult
    dmarc: DNSVerificationResult
  }
  next_steps: string[]
}

export interface DomainStatus {
  id: number
  name: string
  status: 'pending' | 'partial' | 'verified' | 'failed'
  completion_percentage: number
  is_verified: boolean
  created_at: string
  verified_at?: string
  dns_status: {
    dkim: {
      configured: boolean
      valid: boolean
    }
    spf: {
      configured: boolean
      valid: boolean
    }
    dmarc: {
      configured: boolean
      valid: boolean
    }
  }
}

export interface DomainDetails {
  domain: {
    id: number
    name: string
    status: string
    completion_percentage: number
    is_verified: boolean
    verification_method?: string
    created_at: string
    updated_at: string
    verified_at?: string
  }
  configuration: {
    dkim: {
      enabled: boolean
      selector: string
      configured: boolean
      dns_valid: boolean
      public_key?: string
    }
    spf: {
      enabled: boolean
      configured: boolean
      dns_valid: boolean
    }
    dmarc: {
      enabled: boolean
      policy: string
      configured: boolean
      dns_valid: boolean
    }
  }
}

export interface UseDomainSetupReturn {
  loading: boolean
  error: string | null
  domains: DomainStatus[]
  currentDomain: DomainDetails | null
  initiateDomainSetup: (domain: string) => Promise<DomainSetupResult>
  verifyDomainSetup: (domainId: number) => Promise<VerificationResult>
  loadDomains: () => Promise<void>
  loadDomainDetails: (domainId: number) => Promise<DomainDetails>
  removeDomain: (domainId: number) => Promise<boolean>
  updateDomain: (
    domainId: number,
    updates: {
      dkim_enabled?: boolean
      spf_enabled?: boolean
      dmarc_enabled?: boolean
      dmarc_policy?: string
    }
  ) => Promise<boolean>
  regenerateDKIMKeys: (domainId: number) => Promise<any>
  getDNSInstructions: (domainId: number) => Promise<{
    domain: string
    instructions: DNSInstructions
    setup_guide: string[]
  }>
  clearError: () => void
  refreshDomain: (domainId: number) => Promise<void>
}

const getErrorMessage = (err: any, fallback: string) =>
  err.response?.data?.error || err.response?.data?.message || err.message || fallback

const normalizeDomainRecord = (domain: any): DomainRecord => ({
  id: Number(domain.id),
  name: domain.name,
  status: domain.status === 'pending_verification' ? 'pending' : domain.status,
  completion_percentage: Number(domain.completion_percentage ?? 0),
  is_verified: Boolean(domain.is_verified),
  created_at: domain.created_at,
  verified_at: domain.verified_at || undefined,
})

const normalizeDomainStatus = (domain: any): DomainStatus => ({
  id: Number(domain.id),
  name: domain.name,
  status: domain.status,
  completion_percentage: Number(domain.completion_percentage ?? 0),
  is_verified: Boolean(domain.is_verified),
  created_at: domain.created_at,
  verified_at: domain.verified_at || undefined,
  dns_status: {
    dkim: {
      configured: Boolean(domain.dns_status?.dkim?.configured),
      valid: Boolean(domain.dns_status?.dkim?.valid),
    },
    spf: {
      configured: Boolean(domain.dns_status?.spf?.configured),
      valid: Boolean(domain.dns_status?.spf?.valid),
    },
    dmarc: {
      configured: Boolean(domain.dns_status?.dmarc?.configured),
      valid: Boolean(domain.dns_status?.dmarc?.valid),
    },
  },
})

export const useDomainSetup = (): UseDomainSetupReturn => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [domains, setDomains] = useState<DomainStatus[]>([])
  const [currentDomain, setCurrentDomain] = useState<DomainDetails | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const loadDomains = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get('/domain-setup/domains')

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao carregar dominios')
      }

      setDomains((response.data.data?.domains || []).map(normalizeDomainStatus))
    } catch (err: any) {
      const message = getErrorMessage(err, 'Falha ao carregar dominios')
      setError(message)
      if (domains.length > 0) {
        toast.error(message)
      }
    } finally {
      setLoading(false)
    }
  }, [domains.length])

  const loadDomainDetails = useCallback(async (domainId: number) => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get(`/domain-setup/domains/${domainId}`)

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao carregar detalhes do dominio')
      }

      const details = response.data.data as DomainDetails
      setCurrentDomain(details)
      return details
    } catch (err: any) {
      const message = getErrorMessage(err, 'Falha ao carregar detalhes do dominio')
      setError(message)
      toast.error(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const initiateDomainSetup = useCallback(
    async (domain: string) => {
      setLoading(true)
      setError(null)

      try {
        const response = await api.post('/domain-setup/setup', { domain })

        if (!response.data.success) {
          throw new Error(response.data.error || 'Falha ao configurar dominio')
        }

        const result = response.data.data as DomainSetupResult
        const normalizedResult: DomainSetupResult = {
          ...result,
          domain: normalizeDomainRecord(result.domain),
        }

        toast.success(`Configuracao iniciada para ${domain}`)
        await loadDomains()
        return normalizedResult
      } catch (err: any) {
        const message = getErrorMessage(err, 'Falha ao configurar dominio')
        setError(message)
        toast.error(message)
        throw new Error(message)
      } finally {
        setLoading(false)
      }
    },
    [loadDomains]
  )

  const verifyDomainSetup = useCallback(
    async (domainId: number) => {
      setLoading(true)
      setError(null)

      try {
        const response = await api.post(`/domain-setup/${domainId}/verify`)

        if (!response.data.success && !response.data.data) {
          throw new Error(response.data.error || 'Falha ao verificar dominio')
        }

        const result = response.data.data as VerificationResult

        if (result.all_passed) {
          toast.success(`Dominio ${result.domain} verificado com sucesso`)
        } else {
          toast.error('A configuracao ainda precisa de ajustes nos registros DNS')
        }

        await loadDomains()

        if (currentDomain?.domain.id === domainId) {
          await loadDomainDetails(domainId)
        }

        return result
      } catch (err: any) {
        const message = getErrorMessage(err, 'Falha ao verificar dominio')
        setError(message)
        toast.error(message)
        throw new Error(message)
      } finally {
        setLoading(false)
      }
    },
    [currentDomain?.domain.id, loadDomainDetails, loadDomains]
  )

  const removeDomain = useCallback(
    async (domainId: number) => {
      setLoading(true)
      setError(null)

      try {
        const response = await api.delete(`/domain-setup/domains/${domainId}`)

        if (!response.data.success) {
          throw new Error(response.data.error || 'Falha ao remover dominio')
        }

        toast.success('Dominio removido com sucesso')
        await loadDomains()

        if (currentDomain?.domain.id === domainId) {
          setCurrentDomain(null)
        }

        return true
      } catch (err: any) {
        const message = getErrorMessage(err, 'Falha ao remover dominio')
        setError(message)
        toast.error(message)
        return false
      } finally {
        setLoading(false)
      }
    },
    [currentDomain?.domain.id, loadDomains]
  )

  const updateDomain = useCallback(
    async (
      domainId: number,
      updates: {
        dkim_enabled?: boolean
        spf_enabled?: boolean
        dmarc_enabled?: boolean
        dmarc_policy?: string
      }
    ) => {
      setLoading(true)
      setError(null)

      try {
        const response = await api.put(`/domain-setup/domains/${domainId}`, updates)

        if (!response.data.success) {
          throw new Error(response.data.error || 'Falha ao atualizar dominio')
        }

        toast.success('Configuracoes atualizadas com sucesso')
        await loadDomains()

        if (currentDomain?.domain.id === domainId) {
          await loadDomainDetails(domainId)
        }

        return true
      } catch (err: any) {
        const message = getErrorMessage(err, 'Falha ao atualizar dominio')
        setError(message)
        toast.error(message)
        return false
      } finally {
        setLoading(false)
      }
    },
    [currentDomain?.domain.id, loadDomainDetails, loadDomains]
  )

  const regenerateDKIMKeys = useCallback(
    async (domainId: number) => {
      setLoading(true)
      setError(null)

      try {
        const response = await api.post(`/domain-setup/domains/${domainId}/regenerate-dkim`)

        if (!response.data.success) {
          throw new Error(response.data.error || 'Falha ao regenerar chaves DKIM')
        }

        toast.success('Chaves DKIM regeneradas. Atualize o DNS antes de verificar novamente.')

        if (currentDomain?.domain.id === domainId) {
          await loadDomainDetails(domainId)
        }

        await loadDomains()
        return response.data.data
      } catch (err: any) {
        const message = getErrorMessage(err, 'Falha ao regenerar chaves DKIM')
        setError(message)
        toast.error(message)
        throw new Error(message)
      } finally {
        setLoading(false)
      }
    },
    [currentDomain?.domain.id, loadDomainDetails, loadDomains]
  )

  const getDNSInstructions = useCallback(async (domainId: number) => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get(`/domain-setup/dns-instructions/${domainId}`)

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao obter instrucoes DNS')
      }

      return response.data.data as {
        domain: string
        instructions: DNSInstructions
        setup_guide: string[]
      }
    } catch (err: any) {
      const message = getErrorMessage(err, 'Falha ao obter instrucoes DNS')
      setError(message)
      toast.error(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshDomain = useCallback(
    async (domainId: number) => {
      await Promise.all([
        loadDomains(),
        currentDomain?.domain.id === domainId ? loadDomainDetails(domainId) : Promise.resolve(),
      ])
    },
    [currentDomain?.domain.id, loadDomainDetails, loadDomains]
  )

  return {
    loading,
    error,
    domains,
    currentDomain,
    initiateDomainSetup,
    verifyDomainSetup,
    loadDomains,
    loadDomainDetails,
    removeDomain,
    updateDomain,
    regenerateDKIMKeys,
    getDNSInstructions,
    clearError,
    refreshDomain,
  }
}
