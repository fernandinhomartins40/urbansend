import React from 'react'
import { useVerifiedDomains, useHasVerifiedDomains, type UserDomain } from '@/hooks/useUserDomains'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertTriangle, Plus, RefreshCw, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface DomainSelectorProps {
  value: string
  onChange: (domain: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  showAddButton?: boolean
  showManageButton?: boolean
  required?: boolean
}

/**
 * Componente para seleção de domínios verificados
 * Permite ao usuário selecionar apenas domínios que foram verificados
 */
export const DomainSelector = ({ 
  value, 
  onChange, 
  placeholder = "Selecione um domínio verificado",
  disabled = false,
  className = "",
  showAddButton = true,
  showManageButton = true,
  required = false
}: DomainSelectorProps) => {
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useVerifiedDomains()
  const hasVerifiedDomains = useHasVerifiedDomains()
  
  const domains: UserDomain[] = data?.data?.domains || []

  // Handler para navegar para configuração de domínios
  const handleAddDomain = () => {
    navigate('/app/domains?mode=setup')
  }

  // Handler para navegar para gerenciamento de domínios
  const handleManageDomains = () => {
    navigate('/app/domains')
  }

  // Handler para refresh dos domínios
  const handleRefresh = () => {
    refetch()
  }

  // Formatador de email baseado no domínio selecionado
  const formatEmailFromDomain = (domain: string): string => {
    // Se o valor atual já é um email completo, manter o prefixo existente
    if (value && value.includes('@')) {
      const currentPrefix = value.split('@')[0]
      return `${currentPrefix}@${domain}`
    }
    // Caso contrário, usar um prefixo padrão
    return `noreply@${domain}`
  }

  // Handler que formata o email completo quando um domínio é selecionado
  const handleDomainChange = (selectedDomain: string) => {
    const formattedEmail = formatEmailFromDomain(selectedDomain)
    onChange(formattedEmail)
  }

  // Extrair domínio do valor atual (se for um email completo)
  const extractDomainFromValue = (emailValue: string): string => {
    if (!emailValue) return ''
    if (emailValue.includes('@')) {
      return emailValue.split('@')[1]
    }
    return emailValue
  }

  const currentDomain = extractDomainFromValue(value)

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Skeleton className="h-10 w-full" />
        <div className="text-xs text-muted-foreground">
          Carregando domínios verificados...
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar domínios. 
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-2 h-6 px-2"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // No verified domains state
  if (!hasVerifiedDomains || domains.length === 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        <Select disabled>
          <SelectTrigger className="border-dashed border-amber-200 bg-amber-50">
            <SelectValue placeholder="Nenhum domínio verificado encontrado" />
          </SelectTrigger>
        </Select>
        
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            Você precisa configurar e verificar pelo menos um domínio para enviar emails.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button 
            onClick={handleAddDomain}
            className="flex-1"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Primeiro Domínio
          </Button>
          
          {showManageButton && (
            <Button 
              variant="outline" 
              onClick={handleManageDomains}
              size="sm"
            >
              <Settings className="h-4 w-4 mr-2" />
              Gerenciar
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Main component render
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-2">
        <Select 
          value={currentDomain} 
          onValueChange={handleDomainChange}
          disabled={disabled}
          required={required}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {domains.map((domain) => (
              <SelectItem key={domain.id} value={domain.domain_name}>
                <div className="flex items-center gap-2 w-full">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {domain.domain_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      noreply@{domain.domain_name}
                    </div>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className="text-xs bg-green-100 text-green-800 flex-shrink-0"
                  >
                    Verificado
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Botões de ação */}
        {(showAddButton || showManageButton) && (
          <div className="flex gap-1">
            {showAddButton && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleAddDomain}
                className="px-3"
                type="button"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            
            {showManageButton && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManageDomains}
                className="px-3"
                type="button"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Informação adicional */}
      {domains.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {domains.length === 1 
            ? '1 domínio verificado disponível'
            : `${domains.length} domínios verificados disponíveis`
          }
        </div>
      )}

      {/* Domínio selecionado preview */}
      {currentDomain && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border">
          <strong>Email que será usado:</strong> {formatEmailFromDomain(currentDomain)}
        </div>
      )}
    </div>
  )
}

/**
 * Variante simplificada do DomainSelector para uso em formulários compactos
 */
export const SimpleDomainSelector = ({ 
  value, 
  onChange, 
  placeholder,
  disabled = false,
  className = ""
}: Pick<DomainSelectorProps, 'value' | 'onChange' | 'placeholder' | 'disabled' | 'className'>) => {
  return (
    <DomainSelector
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      showAddButton={false}
      showManageButton={false}
    />
  )
}

/**
 * Hook helper para usar com react-hook-form
 */
export const useDomainSelectorField = () => {
  const hasVerifiedDomains = useHasVerifiedDomains()
  
  return {
    hasVerifiedDomains,
    validate: (value: string) => {
      if (!hasVerifiedDomains) {
        return 'Você precisa configurar pelo menos um domínio verificado'
      }
      
      if (!value || value.trim() === '') {
        return 'Selecione um domínio remetente'
      }
      
      return true
    }
  }
}

export default DomainSelector
