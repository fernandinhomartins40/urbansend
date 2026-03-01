import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Globe,
  Plus,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { DomainList } from '@/components/domain/DomainList'
import { DomainSetupWizard } from '@/components/domain/DomainSetupWizard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDomainSetup } from '@/hooks/useDomainSetup'
import { analyticsApi } from '@/lib/api'

interface DomainStatsProps {
  domains: Array<{
    id: number
    status: 'pending' | 'partial' | 'verified' | 'failed'
    is_verified: boolean
  }>
}

interface DomainAnalyticsRow {
  domain_id: number
  domain: string
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  delivery_rate: number
  open_rate: number
  click_rate: number
  bounce_rate: number
}

const DomainStats: React.FC<DomainStatsProps> = ({ domains }) => {
  const totalDomains = domains.length
  const verifiedDomains = domains.filter((domain) => domain.status === 'verified').length
  const pendingDomains = domains.filter((domain) => domain.status === 'pending' || domain.status === 'partial').length
  const failedDomains = domains.filter((domain) => domain.status === 'failed').length

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Globe className="h-5 w-5 text-blue-600" />
            <div>
              <div className="text-2xl font-bold">{totalDomains}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <div className="text-2xl font-bold">{verifiedDomains}</div>
              <div className="text-sm text-gray-600">Verificados</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5 text-amber-600" />
            <div>
              <div className="text-2xl font-bold">{pendingDomains}</div>
              <div className="text-sm text-gray-600">Em ajuste</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <div className="text-2xl font-bold">{failedDomains}</div>
              <div className="text-sm text-gray-600">Com falha</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const DomainMonitoring: React.FC<{ domains: ReturnType<typeof useDomainSetup>['domains'] }> = ({ domains }) => {
  if (domains.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">Nenhum dominio configurado</h3>
          <p className="text-muted-foreground">Adicione um dominio para acompanhar o status dos registros.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Status de autenticacao
        </CardTitle>
        <CardDescription>Leitura direta do estado atual de SPF, DKIM e DMARC.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {domains.map((domain) => (
          <div key={domain.id} className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{domain.name}</div>
                <div className="text-sm text-muted-foreground">{domain.completion_percentage}% concluido</div>
              </div>
              <Badge variant={domain.is_verified ? 'default' : 'outline'}>
                {domain.is_verified ? 'Pronto para envio' : 'Aguardando verificacao'}
              </Badge>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              {[
                { label: 'SPF', state: domain.dns_status.spf },
                { label: 'DKIM', state: domain.dns_status.dkim },
                { label: 'DMARC', state: domain.dns_status.dmarc },
              ].map((item) => (
                <div key={item.label} className="rounded-md bg-gray-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{item.label}</span>
                    <Badge variant={item.state.valid ? 'default' : 'destructive'}>
                      {item.state.valid ? 'Valido' : 'Ajustar'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {item.state.configured ? 'Registro publicado' : 'Registro ausente'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

type ViewMode = 'list' | 'setup'

interface DomainsPageProps {
  initialMode?: ViewMode
}

export const Domains: React.FC<DomainsPageProps> = ({ initialMode = 'list' }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState<ViewMode>(searchParams.get('mode') === 'setup' ? 'setup' : initialMode)
  const [editingDomainId, setEditingDomainId] = useState<number | null>(
    searchParams.get('domainId') ? Number(searchParams.get('domainId')) : null
  )
  const [analyticsRange, setAnalyticsRange] = useState('30d')
  const { domains, loadDomains } = useDomainSetup()

  useEffect(() => {
    loadDomains()
  }, [loadDomains])

  useEffect(() => {
    const mode = searchParams.get('mode')
    const domainId = searchParams.get('domainId')

    setViewMode(mode === 'setup' ? 'setup' : 'list')
    setEditingDomainId(domainId ? Number(domainId) : null)
  }, [searchParams])

  const { data: analyticsResponse, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ['analytics', 'domains', analyticsRange],
    queryFn: () => analyticsApi.getDomains({ timeRange: analyticsRange }),
  })

  const domainAnalytics: DomainAnalyticsRow[] = analyticsResponse?.data?.domains || []

  const summary = useMemo(
    () => ({
      sent: domainAnalytics.reduce((total, domain) => total + Number(domain.sent_count || 0), 0),
      delivered: domainAnalytics.reduce((total, domain) => total + Number(domain.delivered_count || 0), 0),
      opened: domainAnalytics.reduce((total, domain) => total + Number(domain.opened_count || 0), 0),
      clicked: domainAnalytics.reduce((total, domain) => total + Number(domain.clicked_count || 0), 0),
    }),
    [domainAnalytics]
  )

  const handleSetupComplete = () => {
    setViewMode('list')
    setEditingDomainId(null)
    setSearchParams({})
    loadDomains()
    refetchAnalytics()
  }

  const handleSetupCancel = () => {
    setViewMode('list')
    setEditingDomainId(null)
    setSearchParams({})
  }

  const handleAddDomain = () => {
    setViewMode('setup')
    setEditingDomainId(null)
    setSearchParams({ mode: 'setup' })
  }

  const handleEditDomain = (domainId: number) => {
    setViewMode('setup')
    setEditingDomainId(domainId)
    setSearchParams({ mode: 'setup', domainId: String(domainId) })
  }

  if (viewMode === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="mx-auto max-w-4xl px-4">
          <div className="mb-6">
            <Button variant="ghost" onClick={handleSetupCancel} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para lista
            </Button>
          </div>

          <DomainSetupWizard
            onComplete={handleSetupComplete}
            onCancel={handleSetupCancel}
            editDomainId={editingDomainId || undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dominios</h1>
          <p className="text-muted-foreground">Feche a autenticacao do dominio antes de abrir o envio em producao.</p>
        </div>
        <Button onClick={handleAddDomain}>
          <Plus className="mr-2 h-4 w-4" />
          Novo dominio
        </Button>
      </div>

      <DomainStats domains={domains} />

      <Tabs defaultValue="domains" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="domains" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>Meus dominios</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Monitoramento</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Analises</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="domains" className="mt-6">
          <DomainList onAddDomain={handleAddDomain} onEditDomain={handleEditDomain} />
        </TabsContent>

        <TabsContent value="monitoring" className="mt-6">
          <DomainMonitoring domains={domains} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Performance por dominio</h2>
              <p className="text-sm text-muted-foreground">Metricas reais consolidadas a partir do historico de envio.</p>
            </div>
            <div className="flex items-center gap-2">
              {['7d', '30d', '90d'].map((range) => (
                <Button
                  key={range}
                  size="sm"
                  variant={analyticsRange === range ? 'default' : 'outline'}
                  onClick={() => setAnalyticsRange(range)}
                >
                  {range}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => refetchAnalytics()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Enviados</div>
                <div className="text-2xl font-bold">{summary.sent}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Entregues</div>
                <div className="text-2xl font-bold">{summary.delivered}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Abertos</div>
                <div className="text-2xl font-bold">{summary.opened}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Cliques</div>
                <div className="text-2xl font-bold">{summary.clicked}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalhamento</CardTitle>
              <CardDescription>Entregabilidade e engajamento consolidados por dominio.</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="py-8 text-center text-muted-foreground">Carregando metricas...</div>
              ) : domainAnalytics.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">Ainda nao ha dados suficientes para este periodo.</div>
              ) : (
                <div className="space-y-3">
                  {domainAnalytics.map((domain) => (
                    <div key={domain.domain_id} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{domain.domain}</div>
                          <div className="text-sm text-muted-foreground">{domain.sent_count} emails enviados</div>
                        </div>
                        <Badge variant="outline">{domain.delivery_rate.toFixed(1)}% entrega</Badge>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-md bg-gray-50 p-3">
                          <div className="text-sm text-muted-foreground">Entregues</div>
                          <div className="text-lg font-semibold">{domain.delivered_count}</div>
                        </div>
                        <div className="rounded-md bg-gray-50 p-3">
                          <div className="text-sm text-muted-foreground">Abertura</div>
                          <div className="text-lg font-semibold">{domain.open_rate.toFixed(1)}%</div>
                        </div>
                        <div className="rounded-md bg-gray-50 p-3">
                          <div className="text-sm text-muted-foreground">Clique</div>
                          <div className="text-lg font-semibold">{domain.click_rate.toFixed(1)}%</div>
                        </div>
                        <div className="rounded-md bg-gray-50 p-3">
                          <div className="text-sm text-muted-foreground">Bounce</div>
                          <div className="text-lg font-semibold">{domain.bounce_rate.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
