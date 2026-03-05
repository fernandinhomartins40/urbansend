import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { superAdminApi } from '@/lib/api'
import type { DeliverabilityRow } from '../types'

export function SuperAdminDeliverabilityPage() {
  const [days, setDays] = useState(30)

  const query = useQuery({
    queryKey: ['super-admin', 'deliverability', days],
    queryFn: async () => (await superAdminApi.getDeliverability(days)).data.data as DeliverabilityRow[]
  })

  const rows = query.data || []

  return (
    <div className="space-y-4">
      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-700" />
            Entregabilidade
          </CardTitle>
          <CardDescription>Análise de entrega por domínio de envio.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Domínio</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Sucesso</th>
                <th className="px-2 py-2">Falhas</th>
                <th className="px-2 py-2">Taxa entrega</th>
                <th className="px-2 py-2">Taxa falha</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Carregando dados...</td>
                </tr>
              )}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Sem dados no período selecionado.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.domain} className="border-t">
                  <td className="px-2 py-3 font-medium">{row.domain}</td>
                  <td className="px-2 py-3">{Number(row.total || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-3 text-emerald-700">{Number(row.successful || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-3 text-red-700">{Number(row.failed || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-3">
                    <Badge variant={row.delivery_rate >= 95 ? 'success' : row.delivery_rate >= 85 ? 'warning' : 'destructive'}>
                      {row.delivery_rate.toFixed(2)}%
                    </Badge>
                  </td>
                  <td className="px-2 py-3">
                    <Badge variant={row.failure_rate <= 5 ? 'success' : row.failure_rate <= 15 ? 'warning' : 'destructive'}>
                      {row.failure_rate.toFixed(2)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
