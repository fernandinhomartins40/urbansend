import React, { useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'

export interface AsyncOperationOptions {
  successMessage?: string
  errorMessage?: string
  showToasts?: boolean
  onSuccess?: (result: any) => void
  onError?: (error: Error) => void
}

export interface AsyncOperationState<T> {
  isLoading: boolean
  error: Error | null
  data: T | null
  execute: (...args: any[]) => Promise<T>
  reset: () => void
}

/**
 * Hook para gerenciar operações assíncronas com loading states
 * e tratamento de erros padronizado
 */
export const useAsyncOperation = <T = any>(
  asyncFunction: (...args: any[]) => Promise<T>,
  options: AsyncOperationOptions = {}
): AsyncOperationState<T> => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<T | null>(null)
  
  // Use ref to track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)
  
  const {
    successMessage,
    errorMessage = 'Ocorreu um erro inesperado',
    showToasts = true,
    onSuccess,
    onError
  } = options

  const execute = useCallback(async (...args: any[]): Promise<T> => {
    if (!isMountedRef.current) return Promise.reject(new Error('Component unmounted'))
    
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await asyncFunction(...args)
      
      if (isMountedRef.current) {
        setData(result)
        setError(null)
        
        // Show success toast if configured
        if (showToasts && successMessage) {
          toast.success(successMessage)
        }
        
        // Call success callback
        onSuccess?.(result)
      }
      
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      
      if (isMountedRef.current) {
        setError(error)
        setData(null)
        
        // Show error toast if configured
        if (showToasts) {
          const message = error.message || errorMessage
          toast.error(message)
        }
        
        // Call error callback
        onError?.(error)
      }
      
      throw error
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [asyncFunction, successMessage, errorMessage, showToasts, onSuccess, onError])

  const reset = useCallback(() => {
    if (isMountedRef.current) {
      setIsLoading(false)
      setError(null)
      setData(null)
    }
  }, [])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  return {
    isLoading,
    error,
    data,
    execute,
    reset
  }
}

/**
 * Hook especializado para operações de múltiplas etapas
 */
export const useMultiStepOperation = <T = any>(
  steps: Array<{
    name: string
    execute: (...args: any[]) => Promise<any>
    successMessage?: string
  }>,
  options: AsyncOperationOptions = {}
): AsyncOperationState<T> & {
  currentStep: number
  currentStepName: string
  progress: number
} => {
  const [currentStep, setCurrentStep] = useState(0)
  const [results, setResults] = useState<any[]>([])
  
  const executeSteps = useCallback(async (...args: any[]): Promise<T> => {
    const allResults: any[] = []
    
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i)
      const step = steps[i]
      
      try {
        const result = await step.execute(...args)
        allResults.push(result)
        
        if (step.successMessage && options.showToasts !== false) {
          toast.success(step.successMessage)
        }
      } catch (error) {
        setCurrentStep(0)
        throw error
      }
    }
    
    setResults(allResults)
    setCurrentStep(0)
    return allResults as T
  }, [steps, options.showToasts])

  const asyncOp = useAsyncOperation(executeSteps, options)
  
  const progress = steps.length > 0 ? (currentStep / steps.length) * 100 : 0
  const currentStepName = steps[currentStep]?.name || 'Concluído'

  return {
    ...asyncOp,
    currentStep,
    currentStepName,
    progress
  }
}

/**
 * Hook para operações com debounce (útil para search, validações, etc.)
 */
export const useDebouncedAsyncOperation = <T = any>(
  asyncFunction: (...args: any[]) => Promise<T>,
  delay: number = 500,
  options: AsyncOperationOptions = {}
): AsyncOperationState<T> & {
  debouncedExecute: (...args: any[]) => void
  cancelDebounce: () => void
} => {
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)
  const asyncOp = useAsyncOperation(asyncFunction, options)

  const debouncedExecute = useCallback((...args: any[]) => {
    // Cancel previous debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      asyncOp.execute(...args)
      setDebounceTimer(null)
    }, delay)

    setDebounceTimer(timer)
  }, [asyncOp.execute, delay, debounceTimer])

  const cancelDebounce = useCallback(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      setDebounceTimer(null)
    }
  }, [debounceTimer])

  return {
    ...asyncOp,
    debouncedExecute,
    cancelDebounce
  }
}