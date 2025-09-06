import React from 'react'
import { Card, CardContent } from './card'
import { Progress } from './progress'
import { Skeleton } from './skeleton'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export interface LoadingStep {
  id: string
  name: string
  status: 'pending' | 'loading' | 'completed' | 'error'
  message?: string
  duration?: number
}

export interface EnhancedLoadingProps {
  isLoading: boolean
  title?: string
  message?: string
  progress?: number
  steps?: LoadingStep[]
  showSkeleton?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'spinner' | 'progress' | 'steps' | 'skeleton'
}

export const EnhancedLoading: React.FC<EnhancedLoadingProps> = ({
  isLoading,
  title = 'Carregando...',
  message,
  progress,
  steps,
  showSkeleton = false,
  className = '',
  size = 'md',
  variant = 'spinner'
}) => {
  if (!isLoading && !showSkeleton) return null

  const sizeClasses = {
    sm: 'p-3 text-sm',
    md: 'p-4',
    lg: 'p-6 text-lg'
  }

  const spinnerSizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }

  if (showSkeleton || variant === 'skeleton') {
    return (
      <Card className={`${className}`}>
        <CardContent className={sizeClasses[size]}>
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (variant === 'steps' && steps) {
    return (
      <Card className={`${className}`}>
        <CardContent className={sizeClasses[size]}>
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="font-semibold">{title}</h3>
              {message && (
                <p className="text-gray-600 text-sm mt-1">{message}</p>
              )}
            </div>
            
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {step.status === 'completed' && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                    {step.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                    {step.status === 'loading' && (
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    )}
                    {step.status === 'pending' && (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <p className={`font-medium ${
                      step.status === 'completed' ? 'text-green-700' :
                      step.status === 'error' ? 'text-red-700' :
                      step.status === 'loading' ? 'text-blue-700' :
                      'text-gray-500'
                    }`}>
                      {step.name}
                    </p>
                    {step.message && (
                      <p className="text-xs text-gray-500 mt-1">{step.message}</p>
                    )}
                  </div>
                  
                  {step.duration && step.status === 'completed' && (
                    <span className="text-xs text-gray-400">
                      {step.duration}ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (variant === 'progress') {
    return (
      <Card className={`${className}`}>
        <CardContent className={sizeClasses[size]}>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Loader2 className={`${spinnerSizes[size]} animate-spin text-blue-500`} />
              <div className="flex-1">
                <h3 className="font-semibold">{title}</h3>
                {message && (
                  <p className="text-gray-600 text-sm">{message}</p>
                )}
              </div>
            </div>
            
            {typeof progress === 'number' && (
              <div className="space-y-1">
                <Progress value={progress} className="w-full" />
                <p className="text-xs text-gray-500 text-right">
                  {Math.round(progress)}%
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Default spinner variant
  return (
    <Card className={`${className}`}>
      <CardContent className={`${sizeClasses[size]} flex items-center justify-center`}>
        <div className="flex items-center space-x-3">
          <Loader2 className={`${spinnerSizes[size]} animate-spin text-blue-500`} />
          <div>
            <p className="font-semibold">{title}</p>
            {message && (
              <p className="text-gray-600 text-sm">{message}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Loading overlay que pode ser usado sobre qualquer conteúdo
 */
export interface LoadingOverlayProps extends EnhancedLoadingProps {
  children: React.ReactNode
  blur?: boolean
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  children,
  isLoading,
  blur = true,
  ...loadingProps
}) => {
  return (
    <div className="relative">
      <div className={isLoading && blur ? 'blur-sm pointer-events-none' : ''}>
        {children}
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
          <EnhancedLoading
            {...loadingProps}
            isLoading={true}
            className="bg-white/90 backdrop-blur-sm shadow-lg"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Hook para gerenciar loading states com steps
 */
export const useLoadingSteps = (initialSteps: Omit<LoadingStep, 'status'>[]) => {
  const [steps, setSteps] = React.useState<LoadingStep[]>(
    initialSteps.map(step => ({ ...step, status: 'pending' as const }))
  )
  
  const startStep = (stepId: string, message?: string) => {
    setSteps(current => 
      current.map(step => 
        step.id === stepId 
          ? { ...step, status: 'loading' as const, message }
          : step
      )
    )
  }
  
  const completeStep = (stepId: string, duration?: number) => {
    setSteps(current => 
      current.map(step => 
        step.id === stepId 
          ? { ...step, status: 'completed' as const, duration }
          : step
      )
    )
  }
  
  const errorStep = (stepId: string, message?: string) => {
    setSteps(current => 
      current.map(step => 
        step.id === stepId 
          ? { ...step, status: 'error' as const, message }
          : step
      )
    )
  }
  
  const resetSteps = () => {
    setSteps(current => 
      current.map(step => ({ ...step, status: 'pending' as const }))
    )
  }
  
  const isCompleted = steps.every(step => step.status === 'completed')
  const hasError = steps.some(step => step.status === 'error')
  const isLoading = steps.some(step => step.status === 'loading')
  
  return {
    steps,
    startStep,
    completeStep,
    errorStep,
    resetSteps,
    isCompleted,
    hasError,
    isLoading
  }
}