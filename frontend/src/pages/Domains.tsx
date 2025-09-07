import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DomainSetupWizard } from '@/components/domain/DomainSetupWizard'
import { DomainList } from '@/components/domain/DomainList'
import { useDomainSetup } from '@/hooks/useDomainSetup'
import { 
  Globe, Plus, Settings, Users, BarChart3, ArrowLeft
} from 'lucide-react'

interface DomainStatsProps {
  domains: any[]
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
  const { loading, domains } = useDomainSetup()

  const handleSetupComplete = (domainId: number) => {
    setViewMode('list')
    setSelectedDomainId(domainId)
  }

  const handleSetupCancel = () => {
    setViewMode('list')
  }

  const handleAddDomain = () => {
    setViewMode('setup')
  }

  const handleViewDomain = (domainId: number) => {
    setSelectedDomainId(domainId)
    // Pode navegar para uma página de detalhes se necessário
  }

  const handleEditDomain = (domainId: number) => {
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="domains" className="flex items-center space-x-2">
              <Globe className="w-4 h-4" />
              <span>Meus Domínios</span>
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