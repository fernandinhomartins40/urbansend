import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncOperation } from '@/hooks/useAsyncOperation'
import { useToast } from '@/hooks/useToast'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Copy, 
  ExternalLink,
  AlertTriangle,
  Info
} from 'lucide-react'

interface DomainVerificationProps {
  domainId: number
  domainName: string
  onVerificationComplete?: (success: boolean) => void
  className?: string
}

interface DNSRecord {
  type: string
  name: string
  value: string
  description: string
  status: 'verified' | 'pending'
  note?: string
}

interface VerificationStatus {
  domain: string
  status: {
    overall_verified: boolean
    ownership_verified: boolean
    spf_verified: boolean
    dkim_verified: boolean
    dmarc_verified: boolean
  }
  verification: {
    last_attempt: string | null
    errors: string[] | null
  }
}

interface DNSConfig {
  domain: string
  dns_records: DNSRecord[]
  instructions: {
    pt: {
      title: string
      steps: string[]
      notes: string[]
    }
  }
  verification_url: string
}

export function DomainVerification({ 
  domainId, 
  domainName, 
  onVerificationComplete,
  className 
}: DomainVerificationProps) {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)
  const [dnsConfig, setDnsConfig] = useState<DNSConfig | null>(null)
  const [activeTab, setActiveTab] = useState('status')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const { toast } = useToast()

  const {
    execute: fetchVerificationStatus,
    loading: statusLoading,
    error: statusError
  } = useAsyncOperation(
    async () => {
      const response = await api.get(`/domains/${domainId}/verification-status`)
      setVerificationStatus(response.data)
      return response.data
    }
  )

  const {
    execute: fetchDNSConfig,
    loading: configLoading,
    error: configError
  } = useAsyncOperation(
    async () => {
      const response = await api.get(`/domains/${domainId}/dns-config`)
      setDnsConfig(response.data)
      return response.data
    }
  )

  const {
    execute: verifyDomain,
    loading: verifyLoading,
    error: verifyError
  } = useAsyncOperation(
    async () => {
      const response = await api.post(`/domains/${domainId}/verify`)
      
      if (response.data.success) {
        toast.success('Verificação DNS concluída com sucesso!')
        await fetchVerificationStatus()
        onVerificationComplete?.(true)
      } else {
        toast.error('Falha na verificação DNS. Confira as configurações.')
        onVerificationComplete?.(false)
      }
      
      return response.data
    }
  )

  useEffect(() => {
    fetchVerificationStatus()
    fetchDNSConfig()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (autoRefresh) {
      interval = setInterval(async () => {
        await fetchVerificationStatus()
      }, 30000) // Atualizar a cada 30 segundos
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh, fetchVerificationStatus])

  const copyToClipboard = async (text: string, description: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${description} copiado para a área de transferência!`)
    } catch (err) {
      toast.error('Falha ao copiar para área de transferência')
    }
  }

  const getStatusIcon = (status: boolean, loading = false) => {
    if (loading) return <RefreshCw className="h-4 w-4 animate-spin" />
    return status ? 
      <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
      <XCircle className="h-4 w-4 text-red-600" />
  }

  const getStatusBadge = (status: boolean, loading = false) => {
    if (loading) return <Badge variant="secondary">Verificando...</Badge>
    return status ? 
      <Badge variant="default" className="bg-green-600">Verificado</Badge> : 
      <Badge variant="destructive">Pendente</Badge>
  }

  const calculateProgress = () => {
    if (!verificationStatus) return 0
    const { status } = verificationStatus
    let verified = 0
    const total = 4
    
    if (status.ownership_verified) verified++
    if (status.spf_verified) verified++
    if (status.dkim_verified) verified++
    if (status.dmarc_verified) verified++
    
    return (verified / total) * 100
  }

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-600'
    if (progress >= 50) return 'bg-yellow-600'
    return 'bg-red-600'
  }

  if (statusError || configError) {
    return (
      <Alert className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar dados de verificação. Tente novamente.
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2"
            onClick={() => {
              fetchVerificationStatus()
              fetchDNSConfig()
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar Novamente
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Verificação DNS - {domainName}
                {getStatusIcon(verificationStatus?.status.overall_verified || false, statusLoading)}
              </CardTitle>
              <CardDescription>
                Configure os registros DNS para ativar a verificação completa do domínio
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Auto-atualizar
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 mr-2" />
                    Ativar Auto-atualizar
                  </>
                )}
              </Button>
              <Button
                onClick={verifyDomain}
                disabled={verifyLoading}
                size="sm"
              >
                {verifyLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Verificar Agora
                  </>
                )}
              </Button>
            </div>
          </div>

          {verificationStatus && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progresso da Verificação</span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(calculateProgress())}% concluído
                </span>
              </div>
              <Progress 
                value={calculateProgress()} 
                className="h-2"
              />
            </div>
          )}
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="dns-config">Configuração DNS</TabsTrigger>
              <TabsTrigger value="instructions">Instruções</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="space-y-4 mt-4">
              {verificationStatus && (
                <>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(verificationStatus.status.ownership_verified)}
                        <div>
                          <h4 className="font-medium">Propriedade do Domínio</h4>
                          <p className="text-sm text-muted-foreground">
                            Verificação de que você possui o domínio
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(verificationStatus.status.ownership_verified)}
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(verificationStatus.status.spf_verified)}
                        <div>
                          <h4 className="font-medium">Registro SPF</h4>
                          <p className="text-sm text-muted-foreground">
                            Autorização para envio de emails
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(verificationStatus.status.spf_verified)}
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(verificationStatus.status.dkim_verified)}
                        <div>
                          <h4 className="font-medium">Registro DKIM</h4>
                          <p className="text-sm text-muted-foreground">
                            Assinatura digital de emails
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(verificationStatus.status.dkim_verified)}
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(verificationStatus.status.dmarc_verified)}
                        <div>
                          <h4 className="font-medium">Registro DMARC</h4>
                          <p className="text-sm text-muted-foreground">
                            Política de autenticação de email
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(verificationStatus.status.dmarc_verified)}
                    </div>
                  </div>

                  {verificationStatus.verification.errors && 
                   verificationStatus.verification.errors.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Erros encontrados:</strong>
                        <ul className="list-disc list-inside mt-2">
                          {verificationStatus.verification.errors.map((error, index) => (
                            <li key={index} className="text-sm">{error}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {verificationStatus.verification.last_attempt && (
                    <div className="text-sm text-muted-foreground">
                      Última verificação: {new Date(verificationStatus.verification.last_attempt).toLocaleString('pt-BR')}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="dns-config" className="space-y-4 mt-4">
              {dnsConfig && (
                <div className="space-y-4">
                  {dnsConfig.dns_records.map((record, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            Registro {record.type}
                            {getStatusBadge(record.status === 'verified')}
                          </CardTitle>
                        </div>
                        <CardDescription>{record.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <label className="text-sm font-medium">Nome:</label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 p-2 bg-muted rounded text-sm">
                              {record.name}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(record.name, 'Nome do registro')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">Valor:</label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                              {record.value}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(record.value, 'Valor do registro')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {record.note && (
                          <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>{record.note}</AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="instructions" className="space-y-4 mt-4">
              {dnsConfig && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>{dnsConfig.instructions.pt.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Passos para configuração:</h4>
                        <ol className="list-decimal list-inside space-y-2">
                          {dnsConfig.instructions.pt.steps.map((step, index) => (
                            <li key={index} className="text-sm">{step}</li>
                          ))}
                        </ol>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-2">Notas importantes:</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {dnsConfig.instructions.pt.notes.map((note, index) => (
                            <li key={index} className="text-sm text-muted-foreground">{note}</li>
                          ))}
                        </ul>
                      </div>

                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          A propagação DNS pode levar até 24 horas. Recomendamos aguardar pelo menos 
                          15 minutos antes de tentar a verificação.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {verifyError && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Erro durante a verificação: {verifyError}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}