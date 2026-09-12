import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, KeyRound, Link2, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { superAdminApi } from '@/lib/api'
import type { IntegrationOverview } from '../types'

export function SuperAdminIntegrationsPage() {
  const query = useQuery({
    queryKey: ['super-admin', 'integrations'],
    queryFn: async () => (await superAdminApi.getIntegrations()).data.data as IntegrationOverview
  })

  const data = query.data

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Integracoes</CardTitle>
          <CardDescription>Saúde operacional de webhooks e API keys.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Webhooks ativos</CardDescription>
            <CardTitle>{data?.webhooks_total || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Link2 className="mr-2 inline h-4 w-4" />
            Endpoints cadastrados
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Falhas webhook (24h)</CardDescription>
            <CardTitle>{data?.webhook_failures_24h || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Verificar retry e URLs inválidas
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Chaves de API ativas</CardDescription>
            <CardTitle>{data?.active_api_keys || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <KeyRound className="mr-2 inline h-4 w-4" />
            Revisar permissões periodicamente
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boas práticas obrigatórias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Revogar API keys sem uso e limitar escopos.</p>
          <p><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Monitorar aumento de falhas webhook por tenant.</p>
          <p><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Aplicar rotação de segredos de integração regularmente.</p>
        </CardContent>
      </Card>
    </div>
  )
}
