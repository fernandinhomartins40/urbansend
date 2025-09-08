import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

// Types baseados na API backend
export interface DomainRecord {
  id: number;
  name: string;
  status: 'pending' | 'partial' | 'verified' | 'failed';
  completion_percentage: number;
  is_verified: boolean;
  created_at: string;
  verified_at?: string;
}

export interface DNSInstructions {
  spf: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
  dkim: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
  dmarc: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
  verification: {
    record: string;
    value: string;
    priority: number;
    description: string;
  };
}

export interface DomainSetupResult {
  domain: DomainRecord;
  dns_instructions: DNSInstructions;
  setup_guide: string[];
  verification_token: string;
}

export interface DNSVerificationResult {
  valid: boolean;
  status: 'verified' | 'pending' | 'failed';
  expected?: string;
  found?: string;
  error?: string;
}

export interface VerificationResult {
  success: boolean;
  domain: string;
  all_passed: boolean;
  verified_at: string;
  results: {
    verification_token: DNSVerificationResult;
    spf: DNSVerificationResult;
    dkim: DNSVerificationResult;
    dmarc: DNSVerificationResult;
  };
  next_steps: string[];
}

export interface DomainStatus {
  id: number;
  name: string;
  status: 'pending' | 'partial' | 'verified' | 'failed';
  completion_percentage: number;
  is_verified: boolean;
  created_at: string;
  verified_at?: string;
  dns_status: {
    dkim: {
      configured: boolean;
      valid: boolean;
    };
    spf: {
      configured: boolean;
      valid: boolean;
    };
    dmarc: {
      configured: boolean;
      valid: boolean;
    };
  };
}

export interface DomainDetails {
  domain: {
    id: number;
    name: string;
    status: string;
    completion_percentage: number;
    is_verified: boolean;
    verification_token: string;
    verification_method: string;
    created_at: string;
    updated_at: string;
    verified_at?: string;
  };
  configuration: {
    dkim: {
      enabled: boolean;
      selector: string;
      configured: boolean;
      dns_valid: boolean;
      public_key?: string;
    };
    spf: {
      enabled: boolean;
      configured: boolean;
      dns_valid: boolean;
    };
    dmarc: {
      enabled: boolean;
      policy: string;
      configured: boolean;
      dns_valid: boolean;
    };
  };
}

export interface UseDomainSetupReturn {
  // State
  loading: boolean;
  error: string | null;
  domains: DomainStatus[];
  currentDomain: DomainDetails | null;
  
  // Actions
  initiateDomainSetup: (domain: string) => Promise<DomainSetupResult>;
  verifyDomainSetup: (domainId: number) => Promise<VerificationResult>;
  loadDomains: () => Promise<void>;
  loadDomainDetails: (domainId: number) => Promise<DomainDetails>;
  removeDomain: (domainId: number) => Promise<boolean>;
  updateDomain: (domainId: number, updates: {
    dkim_enabled?: boolean;
    spf_enabled?: boolean;
    dmarc_enabled?: boolean;
    dmarc_policy?: string;
  }) => Promise<boolean>;
  regenerateDKIMKeys: (domainId: number) => Promise<any>;
  getDNSInstructions: (domainId: number) => Promise<{
    domain: string;
    instructions: DNSInstructions;
    setup_guide: string[];
  }>;
  
  // Utilities
  clearError: () => void;
  refreshDomain: (domainId: number) => Promise<void>;
}

/**
 * Hook para gerenciar configuração de domínios
 * Fornece todas as funcionalidades necessárias para o wizard de setup
 */
export const useDomainSetup = (): UseDomainSetupReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainStatus[]>([]);
  const [currentDomain, setCurrentDomain] = useState<DomainDetails | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Inicia o processo de configuração de um domínio
   */
  const initiateDomainSetup = useCallback(async (domain: string): Promise<DomainSetupResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/domain-setup/setup', { domain });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao configurar domínio');
      }

      const result = response.data.data as DomainSetupResult;

      toast.success(`Configuração de domínio iniciada para ${domain}`);

      // Recarregar lista de domínios
      await loadDomains();

      return result;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao configurar domínio';
      setError(errorMessage);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Verifica a configuração DNS de um domínio
   */
  const verifyDomainSetup = useCallback(async (domainId: number): Promise<VerificationResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post(`/domain-setup/${domainId}/verify`);

      if (!response.data.success && !response.data.data) {
        throw new Error(response.data.error || 'Falha ao verificar domínio');
      }

      const result = response.data.data as VerificationResult;

      if (result.all_passed) {
        toast.success(`Domínio ${result.domain} verificado com sucesso! ✅`);
      } else {
        const failedChecks = Object.entries(result.results)
          .filter(([_, check]) => !check.valid)
          .map(([name, _]) => name.replace('_', ' '))
          .join(', ');
        
        toast.error(`Verificação incompleta. Falharam: ${failedChecks}`);
      }

      // Recarregar lista de domínios
      await loadDomains();

      // Se estiver visualizando detalhes do domínio, recarregar
      if (currentDomain && currentDomain.domain.id === domainId) {
        await loadDomainDetails(domainId);
      }

      return result;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao verificar domínio';
      setError(errorMessage);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentDomain]);

  /**
   * Carrega lista de domínios do usuário
   */
  const loadDomains = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/domain-setup/domains');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao carregar domínios');
      }

      setDomains(response.data.data.domains);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao carregar domínios';
      setError(errorMessage);
      
      // Não mostrar toast para erro de carregamento se for primeira vez
      if (domains.length > 0) {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [domains.length]);

  /**
   * Carrega detalhes completos de um domínio
   */
  const loadDomainDetails = useCallback(async (domainId: number): Promise<DomainDetails> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/domain-setup/domains/${domainId}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao carregar detalhes do domínio');
      }

      const details = response.data.data as DomainDetails;
      setCurrentDomain(details);

      return details;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao carregar detalhes do domínio';
      setError(errorMessage);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Remove um domínio
   */
  const removeDomain = useCallback(async (domainId: number): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.delete(`/domain-setup/domains/${domainId}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao remover domínio');
      }

      toast.success('Domínio removido com sucesso');

      // Recarregar lista de domínios
      await loadDomains();

      // Limpar detalhes se era o domínio atual
      if (currentDomain && currentDomain.domain.id === domainId) {
        setCurrentDomain(null);
      }

      return true;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao remover domínio';
      setError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentDomain]);

  /**
   * Atualiza configurações de um domínio
   */
  const updateDomain = useCallback(async (domainId: number, updates: {
    dkim_enabled?: boolean;
    spf_enabled?: boolean;
    dmarc_enabled?: boolean;
    dmarc_policy?: string;
  }): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.put(`/domain-setup/domains/${domainId}`, updates);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao atualizar domínio');
      }

      toast.success('Configurações do domínio atualizadas com sucesso');

      // Recarregar lista de domínios
      await loadDomains();

      // Recarregar detalhes se estiver visualizando
      if (currentDomain && currentDomain.domain.id === domainId) {
        await loadDomainDetails(domainId);
      }

      return true;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao atualizar domínio';
      setError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentDomain, loadDomains, loadDomainDetails]);

  /**
   * Regenera chaves DKIM para um domínio
   */
  const regenerateDKIMKeys = useCallback(async (domainId: number): Promise<any> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post(`/domain-setup/domains/${domainId}/regenerate-dkim`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao regenerar chaves DKIM');
      }

      toast.success('Chaves DKIM regeneradas com sucesso! Por favor, atualize seus registros DNS.');

      // Recarregar detalhes do domínio se estiver visualizando
      if (currentDomain && currentDomain.domain.id === domainId) {
        await loadDomainDetails(domainId);
      }

      // Recarregar lista de domínios
      await loadDomains();

      return response.data.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao regenerar chaves DKIM';
      setError(errorMessage);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentDomain]);

  /**
   * Obtém instruções DNS atualizadas para um domínio
   */
  const getDNSInstructions = useCallback(async (domainId: number): Promise<{
    domain: string;
    instructions: DNSInstructions;
    setup_guide: string[];
  }> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/domain-setup/dns-instructions/${domainId}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao obter instruções DNS');
      }

      return response.data.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Falha ao obter instruções DNS';
      setError(errorMessage);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Força atualização de um domínio específico
   */
  const refreshDomain = useCallback(async (domainId: number): Promise<void> => {
    await Promise.all([
      loadDomains(),
      currentDomain && currentDomain.domain.id === domainId 
        ? loadDomainDetails(domainId) 
        : Promise.resolve()
    ]);
  }, [currentDomain, loadDomains, loadDomainDetails]);

  return {
    // State
    loading,
    error,
    domains,
    currentDomain,
    
    // Actions
    initiateDomainSetup,
    verifyDomainSetup,
    loadDomains,
    loadDomainDetails,
    removeDomain,
    updateDomain,
    regenerateDKIMKeys,
    getDNSInstructions,
    
    // Utilities
    clearError,
    refreshDomain
  };
};