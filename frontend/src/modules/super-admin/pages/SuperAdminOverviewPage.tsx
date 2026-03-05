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
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-cyan-50 to-emerald-50 p-5">
        <h2 className="text-xl font-semibold text-slate-900">Resumo da plataforma</h2>
        <p className="mt-1 text-sm text-slate-600">
          Métricas globais de contas, entregabilidade e integridade operacional.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-sky-200 bg-sky-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Contas ativas</CardDescription>
            <CardTitle>{overview?.accounts.active || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-sky-800">
            <Users className="mr-2 inline h-4 w-4" />
            Total: {overview?.accounts.total || 0}
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Entrega (24h)</CardDescription>
            <CardTitle>{overview?.deliverability.success_rate_24h || 0}%</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-emerald-800">
            <Activity className="mr-2 inline h-4 w-4" />
            Falhas: {overview?.deliverability.failed_last_24h || 0}
          </CardContent>
        </Card>

        <Card className="border-violet-200 bg-violet-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Domínios verificados</CardDescription>
            <CardTitle>{overview?.deliverability.verified_domains || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-violet-800">
            <ShieldCheck className="mr-2 inline h-4 w-4" />
            Total: {overview?.deliverability.total_domains || 0}
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Alertas ativos</CardDescription>
            <CardTitle>{overview?.alerts.active || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-800">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Emails 24h: {overview?.deliverability.emails_last_24h || 0}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription>Webhooks</CardDescription>
            <CardTitle>{integrations?.webhooks_total || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            <Link2 className="mr-2 inline h-4 w-4" />
            Endpoints cadastrados
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/70">
          <CardHeader className="pb-2">
            <CardDescription>Falhas webhook (24h)</CardDescription>
            <CardTitle>{integrations?.webhook_failures_24h || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-700">
            Volume alto requer investigação em integrações dos clientes.
          </CardContent>
        </Card>

        <Card className="border-cyan-200 bg-cyan-50/70">
          <CardHeader className="pb-2">
            <CardDescription>Chaves de API ativas</CardDescription>
            <CardTitle>{integrations?.active_api_keys || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-cyan-700">
            <Badge variant="outline">Controle de superfície de acesso</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
