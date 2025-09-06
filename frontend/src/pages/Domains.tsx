import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DomainVerification } from '@/components/domains/DomainVerification'
import { domainApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import { 
  Globe, Plus, CheckCircle, AlertCircle, Clock, Copy, 
  RefreshCw, Settings, Shield, ExternalLink, Info,
  Trash2, Eye, ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'

const addDomainSchema = z.object({
  domain_name: z
    .string()
    .min(1, 'Domínio é obrigatório')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.([a-zA-Z]{2,}\.)*[a-zA-Z]{2,}$/, 'Formato de domínio inválido'),
})

type AddDomainForm = z.infer<typeof addDomainSchema>

interface Domain {
  id: number
  domain_name: string
  verification_status: 'pending' | 'verified' | 'failed'
  dkim_status: 'pending' | 'verified' | 'failed' 
  spf_status: 'pending' | 'verified' | 'failed'
  dmarc_status: 'pending' | 'verified' | 'failed'
  created_at: string
  updated_at: string
}

interface DNSRecord {
  type: 'TXT' | 'CNAME' | 'MX'
  name: string
  value: string
  ttl: number
  description: string
  status: 'pending' | 'verified' | 'failed'
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'verified':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />
  }
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'verified':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Verificado</Badge>
    case 'failed':
      return <Badge variant="destructive">Falha</Badge>
    case 'pending':
    default:
      return <Badge variant="outline" className="border-yellow-300 text-yellow-700">Pendente</Badge>
  }
}

export function Domains() {
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const queryClient = useQueryClient()

  const { register, handleSubmit, formState: { errors }, reset } = useForm<AddDomainForm>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: {
      domain_name: '',
    },
  })

  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainApi.getDomains(),
  })

  const { data: domainDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['domains', selectedDomain?.id, 'details'],
    queryFn: () => domainApi.getDomainDetails(selectedDomain!.id.toString()),
    enabled: !!selectedDomain,
  })

  const addMutation = useMutation({
    mutationFn: (data: AddDomainForm) => {
      // Ensure required fields are present
      if (!data.domain_name) {
        throw new Error('Nome do domínio é obrigatório')
      }
      return domainApi.addDomain({
        domain_name: data.domain_name
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      setIsAdding(false)
      reset()
      toast.success('Domínio adicionado com sucesso!')
    },
    onError: () => toast.error('Erro ao adicionar domínio'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => domainApi.deleteDomain(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      setSelectedDomain(null)
      toast.success('Domínio removido com sucesso!')
    },
    onError: () => toast.error('Erro ao remover domínio'),
  })

  const verifyMutation = useMutation({
    mutationFn: (id: number) => domainApi.verifyDomain(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['domains', selectedDomain?.id, 'details'] })
      toast.success('Verificação iniciada!')
    },
    onError: () => toast.error('Erro na verificação'),
  })

  const domainList = domains?.data?.domains || []

  const onSubmit = (data: AddDomainForm) => {
    addMutation.mutate(data)
  }

  const handleDomainSelect = (domain: Domain) => {
    setSelectedDomain(domain)
    setIsAdding(false)
    setActiveTab('overview')
  }

  const handleAddDomain = () => {
    setIsAdding(true)
    setSelectedDomain(null)
    reset()
  }

  const handleDeleteDomain = (domain: Domain) => {
    if (confirm(`Tem certeza que deseja remover o domínio "${domain.domain_name}"?`)) {
      deleteMutation.mutate(domain.id)
    }
  }

  const handleVerifyDomain = (domain: Domain) => {
    verifyMutation.mutate(domain.id)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a área de transferência!')
  }

  const generateDNSRecords = (domain: Domain): DNSRecord[] => {
    return [
      {
        type: 'TXT',
        name: domain.domain_name,
        value: `ultrazend-verification=${Math.random().toString(36).substring(2, 15)}`,
        ttl: 3600,
        description: 'Registro de verificação do domínio',
        status: domain.verification_status,
      },
      {
        type: 'CNAME',
        name: `ultrazend._domainkey.${domain.domain_name}`,
        value: `ultrazend._domainkey.ultrazend.com.br`,
        ttl: 3600,
        description: 'Chave DKIM para autenticação de emails',
        status: domain.dkim_status,
      },
      {
        type: 'TXT',
        name: domain.domain_name,
        value: `v=spf1 include:ultrazend.com.br ~all`,
        ttl: 3600,
        description: 'Registro SPF para autorização de envio',
        status: domain.spf_status,
      },
      {
        type: 'TXT',
        name: `_dmarc.${domain.domain_name}`,
        value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@ultrazend.com.br',
        ttl: 3600,
        description: 'Política DMARC para proteção contra spoofing',
        status: domain.dmarc_status,
      },
    ]
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Domínios</h1>
          <p className="text-muted-foreground">
            Gerencie e configure seus domínios para envio de emails
          </p>
        </div>
        <Button onClick={handleAddDomain}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Domínio
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Domain List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Seus Domínios</CardTitle>
              <CardDescription>
                {domainList.length} domínio{domainList.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-3 border rounded animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : isAdding ? (
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="text-lg">Adicionar Domínio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                      <div>
                        <Label htmlFor="domain_name">Domínio</Label>
                        <Input
                          id="domain_name"
                          placeholder="exemplo.com"
                          {...register('domain_name')}
                        />
                        {errors.domain_name && (
                          <p className="text-sm text-destructive mt-1">{errors.domain_name.message}</p>
                        )}
                      </div>

                      <div className="flex space-x-2">
                        <Button type="submit" disabled={addMutation.isPending}>
                          {addMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsAdding(false)
                            reset()
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              ) : domainList.length === 0 ? (
                <div className="text-center py-6">
                  <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">Nenhum domínio configurado</p>
                  <Button variant="outline" onClick={handleAddDomain}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Primeiro Domínio
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {domainList.map((domain: Domain) => (
                    <div
                      key={domain.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedDomain?.id === domain.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-gray-300'
                      }`}
                      onClick={() => handleDomainSelect(domain)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium truncate">{domain.domain_name}</div>
                          <div className="flex items-center mt-1 space-x-2">
                            {getStatusIcon(domain.verification_status)}
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(domain.created_at)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Domain Details */}
        <div className="lg:col-span-2">
          {selectedDomain ? (
            <div className="space-y-6">
              {/* Domain Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">{selectedDomain.domain_name}</CardTitle>
                      <CardDescription>
                        Configurado em {formatRelativeTime(selectedDomain.created_at)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(selectedDomain.verification_status)}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab('verification')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Verificar DNS
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteDomain(selectedDomain)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Status Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedDomain.verification_status)}
                      <div>
                        <div className="text-sm font-medium">Verificação</div>
                        <div className="text-xs text-muted-foreground">Domínio</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedDomain.dkim_status)}
                      <div>
                        <div className="text-sm font-medium">DKIM</div>
                        <div className="text-xs text-muted-foreground">Autenticação</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedDomain.spf_status)}
                      <div>
                        <div className="text-sm font-medium">SPF</div>
                        <div className="text-xs text-muted-foreground">Autorização</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedDomain.dmarc_status)}
                      <div>
                        <div className="text-sm font-medium">DMARC</div>
                        <div className="text-xs text-muted-foreground">Política</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* DNS Configuration */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="overview">
                    <Eye className="h-4 w-4 mr-2" />
                    Visão Geral
                  </TabsTrigger>
                  <TabsTrigger value="verification">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Verificação DNS
                  </TabsTrigger>
                  <TabsTrigger value="dns">
                    <Settings className="h-4 w-4 mr-2" />
                    DNS Setup
                  </TabsTrigger>
                  <TabsTrigger value="security">
                    <Shield className="h-4 w-4 mr-2" />
                    Segurança
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Status do Domínio</CardTitle>
                      <CardDescription>
                        Resumo da configuração e saúde do seu domínio
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Globe className="h-5 w-5 text-blue-500" />
                            <div>
                              <div className="font-medium">Domínio Principal</div>
                              <div className="text-sm text-muted-foreground">
                                {selectedDomain.domain_name}
                              </div>
                            </div>
                          </div>
                          {getStatusBadge(selectedDomain.verification_status)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-3 border rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              {getStatusIcon(selectedDomain.dkim_status)}
                              <span className="font-medium">DKIM</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Autentica emails enviados do seu domínio
                            </p>
                          </div>

                          <div className="p-3 border rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              {getStatusIcon(selectedDomain.spf_status)}
                              <span className="font-medium">SPF</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Autoriza servidores para envio de emails
                            </p>
                          </div>

                          <div className="p-3 border rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              {getStatusIcon(selectedDomain.dmarc_status)}
                              <span className="font-medium">DMARC</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Define política de tratamento de emails
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="verification" className="mt-6">
                  <DomainVerification
                    domainId={selectedDomain.id}
                    domainName={selectedDomain.domain_name}
                    onVerificationComplete={(success) => {
                      // Atualizar dados após verificação
                      queryClient.invalidateQueries({ queryKey: ['domains'] })
                      queryClient.invalidateQueries({ queryKey: ['domains', selectedDomain.id, 'details'] })
                      
                      if (success) {
                        toast.success('Verificação DNS concluída com sucesso!')
                      }
                    }}
                  />
                </TabsContent>

                <TabsContent value="dns" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Configuração DNS</CardTitle>
                      <CardDescription>
                        Adicione estes registros DNS ao seu provedor de domínio
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoadingDetails ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                          Carregando detalhes...
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {generateDNSRecords(domainDetails?.data || selectedDomain).map((record, index) => (
                          <div key={index} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline">{record.type}</Badge>
                                {getStatusIcon(record.status)}
                                <span className="font-medium truncate">{record.name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(record.value)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="text-sm">
                                <span className="text-muted-foreground">Valor:</span>
                                <code className="ml-2 p-1 bg-muted rounded text-xs break-all">
                                  {record.value}
                                </code>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">TTL:</span>
                                <span className="ml-2">{record.ttl}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {record.description}
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-blue-900">Como configurar DNS</h4>
                              <p className="text-sm text-blue-700 mt-1">
                                1. Acesse seu provedor de domínio (GoDaddy, Namecheap, etc.)
                                <br />
                                2. Vá para a seção de gerenciamento DNS
                                <br />
                                3. Adicione os registros DNS listados acima
                                <br />
                                4. Aguarde a propagação (pode levar até 48h)
                                <br />
                                5. Clique em "Verificar" para confirmar a configuração
                              </p>
                              <Button variant="link" className="p-0 h-auto text-blue-600 mt-2">
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Ver guias detalhados
                              </Button>
                            </div>
                          </div>
                        </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="security" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Configurações de Segurança</CardTitle>
                      <CardDescription>
                        Proteja seu domínio contra spoofing e phishing
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center space-x-2 mb-3">
                            <Shield className="h-5 w-5 text-green-500" />
                            <h4 className="font-medium">DKIM (DomainKeys Identified Mail)</h4>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Adiciona assinatura criptográfica aos seus emails para verificar autenticidade.
                          </p>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(selectedDomain.dkim_status)}
                            {selectedDomain.dkim_status === 'verified' && (
                              <span className="text-sm text-green-600">✓ Configurado corretamente</span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center space-x-2 mb-3">
                            <Shield className="h-5 w-5 text-blue-500" />
                            <h4 className="font-medium">SPF (Sender Policy Framework)</h4>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Especifica quais servidores têm permissão para enviar emails em nome do seu domínio.
                          </p>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(selectedDomain.spf_status)}
                            {selectedDomain.spf_status === 'verified' && (
                              <span className="text-sm text-blue-600">✓ Autorizado para envio</span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center space-x-2 mb-3">
                            <Shield className="h-5 w-5 text-purple-500" />
                            <h4 className="font-medium">DMARC (Domain-based Message Authentication)</h4>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Define como tratar emails que falham nas verificações SPF e DKIM.
                          </p>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(selectedDomain.dmarc_status)}
                            {selectedDomain.dmarc_status === 'verified' && (
                              <span className="text-sm text-purple-600">✓ Política ativa</span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-yellow-900">Importante</h4>
                              <p className="text-sm text-yellow-800 mt-1">
                                Todos os três protocolos (DKIM, SPF e DMARC) devem estar configurados
                                corretamente para garantir a máxima entregabilidade dos seus emails.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center">
              <div className="text-center">
                <Globe className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-medium mb-2">Selecione um domínio</h3>
                <p className="text-muted-foreground mb-4">
                  Escolha um domínio para ver detalhes e configurar DNS
                </p>
                <Button onClick={handleAddDomain}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Domínio
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}