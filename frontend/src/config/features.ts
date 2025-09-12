/**
 * 🚩 FRONTEND FEATURE FLAGS - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Sistema de feature flags no frontend para rollout gradual
 * Integrado com sistema backend para decisões de roteamento
 */

import { api } from '../lib/api';

export interface FrontendFeatureFlags {
  USE_INTEGRATED_EMAIL_SEND: boolean;
  ROLLOUT_PERCENTAGE: number;
  ENABLE_MIGRATION_MONITORING: boolean;
  USER_IN_ROLLOUT: boolean;
  ROLLOUT_PHASE: string;
}

/**
 * Cache de feature flags para evitar requisições excessivas
 */
let featureFlagsCache: FrontendFeatureFlags | null = null;
let lastFlagsFetch = 0;
const FLAGS_CACHE_TTL = 60000; // 1 minuto

/**
 * Obter feature flags do backend
 */
export async function getFeatureFlags(): Promise<FrontendFeatureFlags> {
  const now = Date.now();
  
  // Usar cache se ainda válido
  if (featureFlagsCache && now - lastFlagsFetch < FLAGS_CACHE_TTL) {
    return featureFlagsCache;
  }
  
  try {
    const response = await api.get('/feature-flags');
    featureFlagsCache = response.data;
    lastFlagsFetch = now;
    
    console.debug('🚩 Feature flags atualizadas do backend', featureFlagsCache);
    return featureFlagsCache;
    
  } catch (error) {
    console.error('Erro ao buscar feature flags do backend:', error);
    
    // Fallback para valores padrão
    const fallbackFlags: FrontendFeatureFlags = {
      USE_INTEGRATED_EMAIL_SEND: false,
      ROLLOUT_PERCENTAGE: 0,
      ENABLE_MIGRATION_MONITORING: false,
      USER_IN_ROLLOUT: false,
      ROLLOUT_PHASE: 'DISABLED'
    };
    
    featureFlagsCache = fallbackFlags;
    return fallbackFlags;
  }
}

/**
 * Verificar se o usuário atual deve usar a integração V2
 */
export async function shouldUseIntegratedEmailSend(): Promise<boolean> {
  try {
    const flags = await getFeatureFlags();
    return flags.USER_IN_ROLLOUT && flags.USE_INTEGRATED_EMAIL_SEND;
  } catch (error) {
    console.error('Erro ao verificar feature flag de email integrado:', error);
    return false; // Fallback para rota antiga em caso de erro
  }
}

/**
 * Hook personalizado para decidir qual sistema de email usar
 */
import { useEmailSendV2 } from '../hooks/useEmailSendV2';
import { useSendEmail } from '../hooks/useEmails';
import { useEffect, useState } from 'react';

export function useSmartEmailSend() {
  const [shouldUseV2, setShouldUseV2] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolloutPhase, setRolloutPhase] = useState<string>('UNKNOWN');
  
  // Hooks para ambas as versões
  const emailSendV2 = useEmailSendV2();
  const emailSendLegacy = useSendEmail();
  
  // Verificar feature flags ao montar o componente
  useEffect(() => {
    async function checkFeatureFlags() {
      try {
        const flags = await getFeatureFlags();
        setShouldUseV2(flags.USER_IN_ROLLOUT && flags.USE_INTEGRATED_EMAIL_SEND);
        setRolloutPhase(flags.ROLLOUT_PHASE);
        
        // Log para debugging
        if (flags.ENABLE_MIGRATION_MONITORING) {
          console.log('🚩 Smart Email Send - Decisão de roteamento:', {
            useV2: flags.USER_IN_ROLLOUT && flags.USE_INTEGRATED_EMAIL_SEND,
            rolloutPercentage: flags.ROLLOUT_PERCENTAGE,
            phase: flags.ROLLOUT_PHASE,
            timestamp: new Date().toISOString()
          });
        }
        
      } catch (error) {
        console.error('Erro ao carregar feature flags:', error);
        setShouldUseV2(false); // Fallback para sistema antigo
        setRolloutPhase('ERROR');
      } finally {
        setLoading(false);
      }
    }
    
    checkFeatureFlags();
  }, []);
  
  // Retornar o hook apropriado baseado na feature flag
  return {
    sendEmail: shouldUseV2 ? emailSendV2.mutateAsync : emailSendLegacy.mutate,
    sendEmailAsync: shouldUseV2 ? emailSendV2.mutateAsync : 
      (data: any) => new Promise((resolve, reject) => {
        emailSendLegacy.mutate(data, {
          onSuccess: resolve,
          onError: reject
        });
      }),
    isLoading: loading || emailSendV2.isPending || emailSendLegacy.isPending,
    error: emailSendV2.error || emailSendLegacy.error,
    isSuccess: emailSendV2.isSuccess || emailSendLegacy.isSuccess,
    
    // Informações de rollout para debugging
    rolloutInfo: {
      isUsingV2: shouldUseV2,
      phase: rolloutPhase,
      loading
    }
  };
}

/**
 * Provider de contexto para feature flags (opcional, para performance)
 */
import React, { createContext, useContext, ReactNode } from 'react';

interface FeatureFlagsContextType {
  flags: FrontendFeatureFlags | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FrontendFeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  
  const fetchFlags = async () => {
    try {
      setLoading(true);
      const newFlags = await getFeatureFlags();
      setFlags(newFlags);
    } catch (error) {
      console.error('Erro no FeatureFlagsProvider:', error);
      setFlags(null);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchFlags();
    
    // Refetch flags periodicamente
    const interval = setInterval(fetchFlags, FLAGS_CACHE_TTL);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, refetch: fetchFlags }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
}

/**
 * Componente de debug para mostrar status do rollout
 */
export function RolloutDebugInfo() {
  const [flags, setFlags] = useState<FrontendFeatureFlags | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  useEffect(() => {
    getFeatureFlags().then(setFlags);
  }, []);
  
  // Só mostrar em desenvolvimento ou se explicitamente solicitado
  if (process.env.NODE_ENV !== 'development' && !window.location.search.includes('debug=rollout')) {
    return null;
  }
  
  if (!flags) {
    return null;
  }
  
  return (
    <div style={{ 
      position: 'fixed', 
      bottom: '10px', 
      right: '10px', 
      zIndex: 9999,
      background: flags.USER_IN_ROLLOUT ? '#4CAF50' : '#FF9800',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '12px',
      cursor: 'pointer',
      opacity: showDebug ? 1 : 0.7
    }}
    onClick={() => setShowDebug(!showDebug)}
    >
      🚩 Email: {flags.USER_IN_ROLLOUT ? 'V2' : 'Legacy'} ({flags.ROLLOUT_PERCENTAGE}%)
      
      {showDebug && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: '0',
          background: '#333',
          padding: '12px',
          borderRadius: '4px',
          whiteSpace: 'pre-wrap',
          marginBottom: '5px',
          minWidth: '250px'
        }}>
          {JSON.stringify(flags, null, 2)}
        </div>
      )}
    </div>
  );
}

/**
 * Utilitário para forçar refresh das feature flags
 */
export function refreshFeatureFlags(): Promise<FrontendFeatureFlags> {
  featureFlagsCache = null;
  lastFlagsFetch = 0;
  return getFeatureFlags();
}

/**
 * Utilitário para debug de rollout no console
 */
export function debugRolloutStatus() {
  getFeatureFlags().then(flags => {
    console.group('🚩 Rollout Status Debug');
    console.log('Feature Flags:', flags);
    console.log('User in rollout:', flags.USER_IN_ROLLOUT);
    console.log('Rollout percentage:', flags.ROLLOUT_PERCENTAGE + '%');
    console.log('Phase:', flags.ROLLOUT_PHASE);
    console.log('Monitoring enabled:', flags.ENABLE_MIGRATION_MONITORING);
    console.groupEnd();
  });
}

// Debug global (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  (window as any).debugRollout = debugRolloutStatus;
  (window as any).refreshFlags = refreshFeatureFlags;
}