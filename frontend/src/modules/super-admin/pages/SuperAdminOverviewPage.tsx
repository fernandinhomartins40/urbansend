import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Link2, ShieldCheck, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { superAdminApi } from '@/lib/api'
import type { IntegrationOverview, OverviewData } from '../types'

export function SuperAdminOverviewPage() {
  const overviewQuery = useQuery({
    queryKey: ['super-admin', 'overview'],
    queryFn: async () => (await superAdminApi.getOverview()).data.data as OverviewData
  })

  const integrationsQuery = useQuery({
    queryKey: ['super-admin', 'integrations'],
    queryFn: async () => (await superAdminApi.getIntegrations()).data.data as IntegrationOverview
  })

  const overview = overviewQuery.data
  const integrations = integrationsQuery.data

  return (
    <div className="space-y-4">
      <section className="vm-page-hero">
        <h2 className="vm-page-title">Resumo da plataforma</h2>
        <p className="vm-page-description">
          Métricas globais de contas, entregabilidade e integridade operacional.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contas ativas</CardDescription>
            <CardTitle>{overview?.accounts.active || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Users className="mr-2 inline h-4 w-4 text-primary" />
            Total: {overview?.accounts.total || 0}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entrega (24h)</CardDescription>
            <CardTitle>{overview?.deliverability.success_rate_24h || 0}%</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Activity className="mr-2 inline h-4 w-4 text-[hsl(var(--success))]" />
            Falhas: {overview?.deliverability.failed_last_24h || 0}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Domínios verificados</CardDescription>
            <CardTitle>{overview?.deliverability.verified_domains || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />
            Total: {overview?.deliverability.total_domains || 0}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alertas ativos</CardDescription>
            <CardTitle>{overview?.alerts.active || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <AlertTriangle className="mr-2 inline h-4 w-4 text-[hsl(var(--warning))]" />
            Emails 24h: {overview?.deliverability.emails_last_24h || 0}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Webhooks</CardDescription>
            <CardTitle>{integrations?.webhooks_total || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Link2 className="mr-2 inline h-4 w-4 text-primary" />
            Endpoints cadastrados
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Falhas webhook (24h)</CardDescription>
            <CardTitle>{integrations?.webhook_failures_24h || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Volume alto requer investigação em integrações dos clientes.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Chaves de API ativas</CardDescription>
            <CardTitle>{integrations?.active_api_keys || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Badge variant="outline">Controle de superfície de acesso</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
