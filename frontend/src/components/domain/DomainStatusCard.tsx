import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  CheckCircle, 
  Clock, 
  X, 
  Settings, 
  RefreshCw, 
  AlertTriangle,
  Copy,
  ExternalLink,
  Shield,
  Mail,
  Lock
} from 'lucide-react'
import { UserDomain, useDomainVerification } from '@/hooks/useUserDomains'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import toast from 'react-hot-toast'

interface DomainStatusCardProps {
  domain: UserDomain & {
    configuration_score?: number
  }
  className?: string
  onRefresh?: () => void
  compact?: boolean
}

/**
 * Componente para exibir status visual de um domínio
 * Mostra configuração DNS, verificação e ações disponíveis
 */
export const DomainStatusCard = ({ 
  domain, 
  className = "",
  onRefresh,
  compact = false
}: DomainStatusCardProps) => {
  const navigate = useNavigate()
  const [isVerifying, setIsVerifying] = useState(false)
  const verifyDomain = useDomainVerification()

  // Calcular score de configuração
  const getConfigScore = () => {
    if (domain.configuration_score !== undefined) {
      return domain.configuration_score
    }
    
    const configs = [domain.dkim_enabled, domain.spf_enabled, domain.dmarc_enabled]
    return configs.filter(Boolean).length
  }

  // Obter cor do status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'text-green-600 bg-green-50 border-green-200'
      case 'pending': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'failed': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  // Obter ícone do status
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle className="h-3 w-3" />
      case 'pending': return <Clock className="h-3 w-3" />
      case 'failed': return <X className="h-3 w-3" />
      default: return <AlertTriangle className="h-3 w-3" />
    }
  }

  // Obter texto do status
  const getStatusText = (status: string) => {
    switch (status) {
      case 'verified': return 'Verificado'
      case 'pending': return 'Pendente'
      case 'failed': return 'Falhou'
      default: return 'Desconhecido'
    }
  }

  // Handler para configurar domínio
  const handleConfigure = () => {
    navigate(`/app/domains?mode=setup&domainId=${domain.id}`)
  }

  // Handler para verificar DNS
  const handleVerify = async () => {
    setIsVerifying(true)
    try {
      await verifyDomain.mutateAsync(domain.id)
      onRefresh?.()
    } catch (error) {
      console.error('Verification failed:', error)
    } finally {
      setIsVerifying(false)
    }
  }

  // Handler para copiar domínio
  const handleCopyDomain = () => {
    navigator.clipboard.writeText(domain.domain_name)
    toast.success('Domínio copiado para a área de transferência')
  }

  // Calcular porcentagem de configuração
  const configScore = getConfigScore()
  const configPercentage = (configScore / 3) * 100

  // Versão compacta
  if (compact) {
    return (
      <Card className={`${className} hover:shadow-sm transition-shadow`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{domain.domain_name}</div>
                <div className="flex items-center gap-1 text-xs">
                  <Badge className={`text-xs ${getStatusColor(domain.verification_status)}`}>
                    {getStatusIcon(domain.verification_status)}
                    <span className="ml-1">{getStatusText(domain.verification_status)}</span>
                  </Badge>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{configScore}/3 configs</span>
                </div>
              </div>
            </div>

            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleConfigure}
                className="h-8 w-8 p-0"
              >
                <Settings className="h-3 w-3" />
              </Button>
              
              {domain.verification_status !== 'verified' && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className={`h-3 w-3 ${isVerifying ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Versão completa
  return (
    <Card className={`${className} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base">{domain.domain_name}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyDomain}
                className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            
            <Badge className={getStatusColor(domain.verification_status)}>
              {getStatusIcon(domain.verification_status)}
              <span className="ml-1">{getStatusText(domain.verification_status)}</span>
            </Badge>
          </div>
          
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Configuração</div>
            <div className="font-semibold text-lg">{configScore}/3</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progresso da configuração</span>
            <span>{Math.round(configPercentage)}%</span>
          </div>
          <Progress value={configPercentage} className="h-2" />
        </div>

        {/* Configuration details */}
        <div className="space-y-2 mb-4">
          <TooltipProvider>
            {/* DKIM */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${domain.dkim_enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">DKIM</span>
                  </div>
                  <Badge variant={domain.dkim_enabled ? 'default' : 'secondary'} className="text-xs">
                    {domain.dkim_enabled ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>DomainKeys Identified Mail - Assinatura digital de emails</p>
              </TooltipContent>
            </Tooltip>

            {/* SPF */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${domain.spf_enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">SPF</span>
                  </div>
                  <Badge variant={domain.spf_enabled ? 'default' : 'secondary'} className="text-xs">
                    {domain.spf_enabled ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Sender Policy Framework - Autorização de servidores de envio</p>
              </TooltipContent>
            </Tooltip>

            {/* DMARC */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${domain.dmarc_enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">DMARC</span>
                  </div>
                  <Badge variant={domain.dmarc_enabled ? 'default' : 'secondary'} className="text-xs">
                    {domain.dmarc_enabled ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Domain Message Authentication Reporting - Política de autenticação</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Timestamps */}
        {(domain.created_at || domain.verified_at) && (
          <div className="text-xs text-muted-foreground mb-3 space-y-1">
            <div>Criado: {formatRelativeTime(domain.created_at)}</div>
            {domain.verified_at && (
              <div>Verificado: {formatRelativeTime(domain.verified_at)}</div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleConfigure}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>
          
          {domain.verification_status !== 'verified' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={handleVerify}
              disabled={isVerifying}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isVerifying ? 'animate-spin' : ''}`} />
              {isVerifying ? 'Verificando...' : 'Verificar'}
            </Button>
          )}

          {domain.verification_status === 'verified' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/app/analytics?domain=${domain.id}`)}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Grid de cartões de domínio
 */
export const DomainStatusGrid = ({ 
  domains, 
  onRefresh,
  loading = false 
}: { 
  domains: UserDomain[]
  onRefresh?: () => void
  loading?: boolean 
}) => {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="space-y-2">
                <div className="h-2 bg-gray-200 rounded"></div>
                <div className="h-2 bg-gray-200 rounded"></div>
                <div className="h-2 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum domínio configurado</h3>
          <p className="text-muted-foreground mb-4">
            Configure seu primeiro domínio para começar a enviar emails
          </p>
          <Button onClick={() => window.location.href = '/app/domains?mode=setup'}>
            <Settings className="h-4 w-4 mr-2" />
            Configurar Primeiro Domínio
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {domains.map((domain) => (
        <DomainStatusCard
          key={domain.id}
          domain={domain}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}

export default DomainStatusCard
