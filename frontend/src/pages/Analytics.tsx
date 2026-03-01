import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Eye, Globe, Mail, MousePointer, RefreshCw, TrendingUp, XCircle } from 'lucide-react'
import { analyticsApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const chartColors = {
  sent: '#2563eb',
  delivered: '#16a34a',
  opened: '#d97706',
  clicked: '#9333ea',
}

export function Analytics() {
  const [timeRange, setTimeRange] = useState('30d')

  const { data: analyticsResponse, isLoading, refetch } = useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: () => analyticsApi.getAnalytics({ timeRange }),
  })

  const { data: chartResponse } = useQuery({
    queryKey: ['analytics', 'chart', timeRange],
    queryFn: () => analyticsApi.getAnalyticsChart({ timeRange }),
  })

  const { data: topEmailsResponse } = useQuery({
    queryKey: ['analytics', 'top-emails', timeRange],
    queryFn: () => analyticsApi.getTopEmails({ timeRange }),
  })

  const { data: domainsResponse } = useQuery({
    queryKey: ['analytics', 'domains', timeRange],
    queryFn: () => analyticsApi.getDomains({ timeRange }),
  })

  const { data: activityResponse } = useQuery({
    queryKey: ['analytics', 'recent-activity'],
    queryFn: () => analyticsApi.getRecentActivity(),
  })

  const overview = analyticsResponse?.data || {}
  const chart = chartResponse?.data?.chart || []
  const topEmails = topEmailsResponse?.data?.emails || []
  const topDomains = domainsResponse?.data?.domains || []
  const activities = activityResponse?.data?.activities || []

  const cards = [
    {
      title: 'Emails enviados',
      value: overview.total_sent || 0,
      description: `${Number(overview.sent_change || 0).toFixed(1)}% vs periodo anterior`,
      icon: Mail,
    },
    {
      title: 'Entrega',
      value: `${Number(overview.delivery_rate || 0).toFixed(1)}%`,
      description: `${overview.delivered_count || 0} entregues`,
      icon: TrendingUp,
    },
    {
      title: 'Abertura',
      value: `${Number(overview.open_rate || 0).toFixed(1)}%`,
      description: `${overview.opened_count || 0} aberturas`,
      icon: Eye,
    },
    {
      title: 'Clique',
      value: `${Number(overview.click_rate || 0).toFixed(1)}%`,
      description: `${overview.clicked_count || 0} cliques`,
      icon: MousePointer,
    },
    {
      title: 'Bounce',
      value: `${Number(overview.bounce_rate || 0).toFixed(1)}%`,
      description: `${overview.bounced_count || 0} bounces`,
      icon: XCircle,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Painel consolidado de envio, entrega e engajamento.</p>
        </div>

        <div className="flex items-center gap-2">
          {['7d', '30d', '90d'].map((range) => (
            <Button key={range} size="sm" variant={timeRange === range ? 'default' : 'outline'} onClick={() => setTimeRange(range)}>
              {range}
            </Button>
          ))}
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardContent className="p-6">
                <div className="mb-3 h-4 w-24 rounded bg-gray-200" />
                <div className="h-8 w-20 rounded bg-gray-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.title}>
                <CardContent className="p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">{card.title}</div>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="text-xs text-muted-foreground">{card.description}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Volume de emails</CardTitle>
            <CardDescription>Evolucao do envio e do engajamento no periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                  formatter={(value: any, name: string) => [
                    value,
                    name === 'sent' ? 'Enviados' : name === 'delivered' ? 'Entregues' : name === 'opened' ? 'Abertos' : 'Cliques',
                  ]}
                />
                <Area type="monotone" dataKey="sent" stroke={chartColors.sent} fill={chartColors.sent} fillOpacity={0.18} />
                <Area type="monotone" dataKey="delivered" stroke={chartColors.delivered} fill={chartColors.delivered} fillOpacity={0.12} />
                <Area type="monotone" dataKey="opened" stroke={chartColors.opened} fill={chartColors.opened} fillOpacity={0.12} />
                <Area type="monotone" dataKey="clicked" stroke={chartColors.clicked} fill={chartColors.clicked} fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Ultimos eventos consolidados da conta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activities.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Activity className="mx-auto mb-3 h-8 w-8" />
                Sem atividade recente.
              </div>
            ) : (
              activities.slice(0, 8).map((activity: any) => (
                <div key={activity.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{activity.event_type}</div>
                      <div className="text-sm text-muted-foreground">{activity.email_subject || activity.email_to}</div>
                    </div>
                    <Badge variant="outline">{formatRelativeTime(activity.created_at)}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top emails</CardTitle>
            <CardDescription>Assuntos com melhor desempenho no periodo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topEmails.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Nenhum email encontrado no periodo.</div>
            ) : (
              topEmails.slice(0, 6).map((email: any) => (
                <div key={email.id} className="rounded-lg border p-4">
                  <div className="mb-2 font-medium">{email.subject}</div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                    <div>{email.sent_count} enviados</div>
                    <div>{Number(email.open_rate || 0).toFixed(1)}% abertura</div>
                    <div>{Number(email.click_rate || 0).toFixed(1)}% clique</div>
                    <div>{formatRelativeTime(email.sent_at)}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top dominios</CardTitle>
            <CardDescription>Deliverability por dominio autenticado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topDomains.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Globe className="mx-auto mb-3 h-8 w-8" />
                Nenhum dominio com dados no periodo.
              </div>
            ) : (
              topDomains.slice(0, 6).map((domain: any) => (
                <div key={domain.domain_id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium">{domain.domain}</div>
                    <Badge variant="outline">{Number(domain.delivery_rate || 0).toFixed(1)}% entrega</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                    <div>{domain.sent_count} enviados</div>
                    <div>{Number(domain.open_rate || 0).toFixed(1)}% abertura</div>
                    <div>{Number(domain.click_rate || 0).toFixed(1)}% clique</div>
                    <div>{Number(domain.bounce_rate || 0).toFixed(1)}% bounce</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
