import React, { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  CheckCircle, 
  X, 
  Loader2, 
  AlertTriangle, 
  Info,
  ExternalLink
} from 'lucide-react'
import { useDomainValidation } from '@/hooks/useUserDomains'
import { cn } from '@/lib/utils'
import { debounce } from 'lodash-es'

interface DomainInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoValidate?: boolean
  showValidationDetails?: boolean
  onValidationChange?: (isValid: boolean, result?: any) => void
}

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'error'

interface ValidationResult {
  valid: boolean
  domain: string
  available: boolean
  message: string
  reason: string
  existing_status?: string
  next_steps?: string[]
}

/**
 * Componente de input para domínios com validação em tempo real
 * Valida formato, disponibilidade e fornece feedback visual imediato
 */
export const DomainInput = ({ 
  value, 
  onChange, 
  placeholder = "exemplo.com",
  disabled = false,
  className = "",
  autoValidate = true,
  showValidationDetails = true,
  onValidationChange
}: DomainInputProps) => {
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [shouldShowResult, setShouldShowResult] = useState(false)
  
  const validateDomain = useDomainValidation()

  // Debounced validation function
  const debouncedValidation = useCallback(
    debounce(async (domain: string) => {
      if (!domain || domain.length < 3 || !domain.includes('.')) {
        setValidationStatus('idle')
        setValidationResult(null)
        setShouldShowResult(false)
        onValidationChange?.(false)
        return
      }
      
      setValidationStatus('validating')
      setShouldShowResult(true)
      
      try {
        const result = await validateDomain.mutateAsync(domain)
        setValidationResult(result)
        setValidationStatus(result.valid ? 'valid' : 'invalid')
        onValidationChange?.(result.valid, result)
      } catch (error: any) {
        console.error('Domain validation error:', error)
        setValidationStatus('error')
        setValidationResult({
          valid: false,
          domain,
          available: false,
          message: error.response?.data?.error || 'Erro ao validar domínio',
          reason: 'VALIDATION_ERROR'
        })
        onValidationChange?.(false)
      }
    }, 800),
    [validateDomain, onValidationChange]
  )

  // Effect para validação automática
  useEffect(() => {
    if (autoValidate && value) {
      debouncedValidation(value)
    }
    
    // Cleanup
    return () => {
      debouncedValidation.cancel()
    }
  }, [value, autoValidate, debouncedValidation])

  // Handler para mudança de valor
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toLowerCase().trim()
    onChange(newValue)
    
    if (!newValue) {
      setValidationStatus('idle')
      setValidationResult(null)
      setShouldShowResult(false)
    }
  }

  // Handler para validação manual
  const handleManualValidation = () => {
    if (value) {
      debouncedValidation(value)
    }
  }

  // Obter ícone de status
  const getStatusIcon = () => {
    switch (validationStatus) {
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'invalid':
      case 'error':
        return <X className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  // Obter classes do input baseadas no status
  const getInputClasses = () => {
    switch (validationStatus) {
      case 'valid':
        return 'border-green-500 focus-visible:ring-green-500'
      case 'invalid':
      case 'error':
        return 'border-red-500 focus-visible:ring-red-500'
      case 'validating':
        return 'border-blue-500 focus-visible:ring-blue-500'
      default:
        return ''
    }
  }

  // Renderizar detalhes da validação
  const renderValidationDetails = () => {
    if (!showValidationDetails || !shouldShowResult || !validationResult) {
      return null
    }

    const { valid, message, reason, existing_status, next_steps } = validationResult

    // Casos especiais de feedback
    if (reason === 'DOMAIN_ALREADY_EXISTS') {
      return (
        <Alert className="border-amber-200 bg-amber-50">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            <div className="font-medium mb-1">{message}</div>
            <div className="text-sm">
              Status atual: 
              <Badge className="ml-2" variant={existing_status === 'verified' ? 'default' : 'secondary'}>
                {existing_status === 'verified' ? 'Verificado' : 'Pendente'}
              </Badge>
            </div>
            <Button 
              variant="link" 
              className="p-0 h-auto text-amber-700 hover:text-amber-800"
              onClick={() => window.location.href = '/app/domains'}
            >
              Ver em Meus Domínios <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    if (valid) {
      return (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            <div className="font-medium mb-1">{message}</div>
            {next_steps && next_steps.length > 0 && (
              <ul className="text-sm mt-2 list-disc list-inside space-y-1">
                {next_steps.slice(0, 2).map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )
    }

    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <div className="font-medium mb-1">{message}</div>
          {reason === 'INVALID_FORMAT' && (
            <div className="text-sm mt-1">
              Exemplo de formato válido: exemplo.com, meusite.com.br
            </div>
          )}
          {reason === 'UNSUPPORTED_TLD' && (
            <div className="text-sm mt-1">
              Extensões suportadas: .com, .net, .org, .br, .io, entre outras
            </div>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Input com ícone de status */}
      <div className="relative">
        <Input
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(getInputClasses(), "pr-12")}
          autoComplete="off"
          spellCheck={false}
        />
        
        {/* Ícone de status */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          {getStatusIcon()}
          
          {/* Botão de validação manual */}
          {!autoValidate && validationStatus !== 'validating' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualValidation}
              disabled={!value || disabled}
              className="h-6 px-2 text-xs"
            >
              Validar
            </Button>
          )}
        </div>
      </div>

      {/* Status de validação */}
      {validationStatus === 'validating' && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Validando domínio...
        </div>
      )}

      {/* Detalhes da validação */}
      {renderValidationDetails()}
    </div>
  )
}

/**
 * Variante simplificada sem detalhes visuais
 */
export const SimpleDomainInput = (props: Omit<DomainInputProps, 'showValidationDetails'>) => {
  return <DomainInput {...props} showValidationDetails={false} />
}

/**
 * Hook para usar com react-hook-form
 */
export const useDomainInputField = () => {
  const [isValid, setIsValid] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  
  const handleValidationChange = useCallback((valid: boolean, result?: ValidationResult) => {
    setIsValid(valid)
    setValidationResult(result || null)
  }, [])

  const validate = useCallback((value: string) => {
    if (!value || value.trim() === '') {
      return 'Campo obrigatório'
    }

    if (value.length < 3) {
      return 'Domínio deve ter pelo menos 3 caracteres'
    }

    if (!value.includes('.')) {
      return 'Formato de domínio inválido'
    }

    // Se tiver resultado de validação e não for válido
    if (validationResult && !validationResult.valid) {
      return validationResult.message
    }

    // Se não teve validação ainda ou está validando
    if (!isValid && validationResult === null) {
      return 'Aguardando validação do domínio'
    }

    return true
  }, [isValid, validationResult])

  return {
    isValid,
    validationResult,
    validate,
    handleValidationChange
  }
}

export default DomainInput