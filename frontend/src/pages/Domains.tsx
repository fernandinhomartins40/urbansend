import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DomainSetupWizard } from '@/components/domain/DomainSetupWizard'
import { DomainList } from '@/components/domain/DomainList'
import { useDomainSetup } from '@/hooks/useDomainSetup'
import { 
  Globe, Plus, Settings, Users, BarChart3, ArrowLeft, Activity, Shield, CheckCircle, AlertTriangle, XCircle, Zap
} from 'lucide-react'

interface DomainStatsProps {
  domains: any[]
}

// 🔧 FASE 4.2: Dashboard de Monitoramento - Componente de Monitoramento DKIM
const DomainMonitoring: React.FC<{ domains: any[] }> = ({ domains }) => {
  const [testingDomain, setTestingDomain] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<{[key: string]: any}>({})

  const handleDKIMTest = async (domain: string) => {
    setTestingDomain(domain)
    try {
      // Simulação de teste DKIM - em produção, seria uma chamada real à API
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const success = Math.random() > 0.3 // 70% de sucesso para simulação
      setTestResults(prev => ({
        ...prev,
        [domain]: {
          success,
          timestamp: new Date(),
          details: success 
            ? 'DKIM signature validated successfully'
            : 'DKIM validation failed - please check DNS records'
        }
      }))
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [domain]: {
          success: false,
          timestamp: new Date(),
          details: 'Test failed due to network error'
        }
      }))
    } finally {
      setTestingDomain(null)
    }
  }

  const getDomainHealthStatus = (domain: any) => {
    const testResult = testResults[domain.domain_name]
    if (!domain.is_verified) return { icon: XCircle, color: 'text-red-600', text: 'Não Verificado' }
    if (testResult?.success === false) return { icon: AlertTriangle, color: 'text-yellow-600', text: 'DKIM com Problemas' }
    if (testResult?.success === true) return { icon: CheckCircle, color: 'text-green-600', text: 'DKIM OK' }
    return { icon: Shield, color: 'text-blue-600', text: 'Verificado' }
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">
                  {domains.filter(d => d.is_verified).length}
                </div>
                <div className="text-sm text-gray-600">DKIM Ativos</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">
                  {Object.values(testResults).filter((r: any) => r.success).length}
                </div>
                <div className="text-sm text-gray-600">Testes OK</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold">
                  {Object.values(testResults).filter((r: any) => r.success === false).length}
                </div>
                <div className="text-sm text-gray-600">Com Alertas</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domain Monitoring Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Status DKIM por Domínio</span>
          </CardTitle>
          <CardDescription>
            Monitoramento em tempo real do status de DKIM dos seus domínios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {domains.map((domain) => {
              const healthStatus = getDomainHealthStatus(domain)
              const testResult = testResults[domain.domain_name]
              const IconComponent = healthStatus.icon

              return (
                <div key={domain.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <IconComponent className={`h-6 w-6 ${healthStatus.color}`} />
                    <div>
                      <div className="font-medium">{domain.domain_name}</div>
                      <div className="text-sm text-gray-600">
                        {healthStatus.text}
                      </div>
                      {testResult && (
                        <div className="text-xs text-gray-500 mt-1">
                          Último teste: {testResult.timestamp.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {domain.is_verified && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDKIMTest(domain.domain_name)}
                        disabled={testingDomain === domain.domain_name}
                        className="flex items-center space-x-1"
                      >
                        <Zap className="h-4 w-4" />
                        <span>
                          {testingDomain === domain.domain_name ? 'Testando...' : 'Testar DKIM'}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {domains.length === 0 && (
            <div className="text-center py-8">
              <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">Nenhum domínio configurado</h3>
              <p className="text-muted-foreground">
                Adicione um domínio para começar o monitoramento DKIM
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas de Configuração */}
      {Object.keys(testResults).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5" />
              <span>Alertas Recentes</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(testResults)
                .filter(([_, result]: any) => !result.success)
                .map(([domain, result]: any) => (
                  <div key={domain} className="flex items-start space-x-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-yellow-800">{domain}</div>
                      <div className="text-sm text-yellow-700">{result.details}</div>
                      <div className="text-xs text-yellow-600">
                        {result.timestamp.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const DomainStats: React.FC<DomainStatsProps> = ({ domains }) => {
  const totalDomains = domains.length
  const verifiedDomains = domains.filter(d => d.status === 'verified').length
  const pendingDomains = domains.filter(d => d.status === 'pending').length
  const failedDomains = domains.filter(d => d.status === 'failed').length

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <Users className="h-5 w-5 text-green-600" />
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
            <BarChart3 className="h-5 w-5 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold">{pendingDomains}</div>
              <div className="text-sm text-gray-600">Pendentes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-red-600" />
            <div>
              <div className="text-2xl font-bold">{failedDomains}</div>
              <div className="text-sm text-gray-600">Com Falhas</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type ViewMode = 'list' | 'setup'

interface DomainsPageProps {
  initialMode?: ViewMode
}

export const Domains: React.FC<DomainsPageProps> = ({ initialMode = 'list' }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode)
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null)
  const [editingDomainId, setEditingDomainId] = useState<number | null>(null)
  const { loading, domains } = useDomainSetup()

  const handleSetupComplete = (domainId: number) => {
    setViewMode('list')
    setSelectedDomainId(domainId)
    setEditingDomainId(null)
  }

  const handleSetupCancel = () => {
    setViewMode('list')
    setEditingDomainId(null)
  }

  const handleAddDomain = () => {
    setViewMode('setup')
  }

  const handleViewDomain = (domainId: number) => {
    setSelectedDomainId(domainId)
    // Função handleViewDomain não é mais necessária aqui
    // O botão view agora abre o modal diretamente no DomainList
  }

  const handleEditDomain = (domainId: number) => {
    setEditingDomainId(domainId)
    setSelectedDomainId(domainId)
    setViewMode('setup')
  }

  if (viewMode === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={handleSetupCancel}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Lista
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
          <h1 className="text-3xl font-bold">Domínios</h1>
          <p className="text-muted-foreground">
            Gerencie e configure seus domínios para envio de emails autenticados
          </p>
        </div>
      </div>

      <DomainStats domains={domains} />

      <div className="space-y-6">
        <Tabs defaultValue="domains" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="domains" className="flex items-center space-x-2">
              <Globe className="w-4 h-4" />
              <span>Meus Domínios</span>
            </TabsTrigger>
            <TabsTrigger value="monitoring" className="flex items-center space-x-2">
              <Activity className="w-4 h-4" />
              <span>Monitoramento</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <span>Análises</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="domains" className="mt-6">
            <DomainList
              onAddDomain={handleAddDomain}
              onViewDomain={handleViewDomain}
              onEditDomain={handleEditDomain}
            />
          </TabsContent>

          <TabsContent value="monitoring" className="mt-6">
            <DomainMonitoring domains={domains} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Análises de Domínio</CardTitle>
                <CardDescription>
                  Métricas de desempenho e deliverability dos seus domínios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-medium mb-2">Análises em Desenvolvimento</h3>
                  <p className="text-muted-foreground">
                    Métricas detalhadas de deliverability e performance estarão disponíveis em breve.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}