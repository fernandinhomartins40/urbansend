import React, { useCallback, useEffect } from 'react'
import { create } from 'zustand'

interface GlobalLoadingState {
  loadingOperations: Set<string>
  isLoading: boolean
  addLoading: (operationId: string) => void
  removeLoading: (operationId: string) => void
  clearAll: () => void
}

/**
 * Store global para gerenciar múltiplas operações de loading
 */
export const useGlobalLoadingStore = create<GlobalLoadingState>((set, get) => ({
  loadingOperations: new Set<string>(),
  isLoading: false,
  
  addLoading: (operationId: string) => {
    const operations = new Set(get().loadingOperations)
    operations.add(operationId)
    set({ 
      loadingOperations: operations,
      isLoading: operations.size > 0
    })
  },
  
  removeLoading: (operationId: string) => {
    const operations = new Set(get().loadingOperations)
    operations.delete(operationId)
    set({ 
      loadingOperations: operations,
      isLoading: operations.size > 0
    })
  },
  
  clearAll: () => {
    set({ 
      loadingOperations: new Set(),
      isLoading: false
    })
  }
}))

/**
 * Hook para gerenciar loading states globais
 */
export const useGlobalLoading = (operationId?: string) => {
  const { 
    isLoading, 
    loadingOperations,
    addLoading, 
    removeLoading,
    clearAll 
  } = useGlobalLoadingStore()

  const startLoading = useCallback((id?: string) => {
    const loadingId = id || operationId || `operation_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    addLoading(loadingId)
    return loadingId
  }, [operationId, addLoading])

  const stopLoading = useCallback((id?: string) => {
    const loadingId = id || operationId
    if (loadingId) {
      removeLoading(loadingId)
    }
  }, [operationId, removeLoading])

  const withGlobalLoading = useCallback(
    async <T>(
      operation: () => Promise<T>,
      customOperationId?: string
    ): Promise<T> => {
      const loadingId = startLoading(customOperationId)
      try {
        const result = await operation()
        return result
      } finally {
        stopLoading(loadingId)
      }
    },
    [startLoading, stopLoading]
  )

  // Auto cleanup on unmount if operationId is provided
  useEffect(() => {
    return () => {
      if (operationId) {
        removeLoading(operationId)
      }
    }
  }, [operationId, removeLoading])

  return {
    isLoading,
    activeOperations: Array.from(loadingOperations),
    operationCount: loadingOperations.size,
    startLoading,
    stopLoading,
    clearAll,
    withGlobalLoading
  }
}

/**
 * Hook otimizado para operações específicas de página
 */
export const usePageLoading = (pageId: string) => {
  return useGlobalLoading(pageId)
}

/**
 * Hook para loading states de API
 */
export const useApiLoading = (apiEndpoint: string) => {
  const operationId = `api_${apiEndpoint.replace(/[^a-zA-Z0-9]/g, '_')}`
  return useGlobalLoading(operationId)
}

/**
 * Higher-order function para wrapping de operações assíncronas
 */
export const withLoadingState = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  operationId?: string
) => {
  return async (...args: T): Promise<R> => {
    const loadingId = operationId || `wrapped_${fn.name || 'anonymous'}_${Date.now()}`
    
    const { addLoading, removeLoading } = useGlobalLoadingStore.getState()
    addLoading(loadingId)
    
    try {
      return await fn(...args)
    } finally {
      removeLoading(loadingId)
    }
  }
}

// GlobalLoadingIndicator component moved to separate file for TypeScript compatibility