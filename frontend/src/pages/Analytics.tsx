import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity,
  ArrowUpRight,
  Eye,
  Globe,
  Mail,
  MousePointer,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react'
import { analyticsApi } from '@/lib/api'
import { getEmailStatusLabel } from '@/lib/emailEngagement'
import { useSettingsStore } from '@/lib/store'
import { cn, formatNumber, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const chartColors = {
  sent: '#0f766e',
  delivered: '#2563eb',
  opened: '#d97706',
  clicked: '#db2777',
}

const analyticsRanges: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d']

const metricStyles = {
  sent: {
    surface: 'border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50',
    icon: 'bg-teal-500/15 text-teal-700',
    bar: 'from-teal-500 to-cyan-500',
  },
  delivered: {
    surface: 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50',
    icon: 'bg-blue-500/15 text-blue-700',
    bar: 'from-blue-500 to-indigo-500',
  },
  opened: {
    surface: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    icon: 'bg-amber-500/15 text-amber-700',
    bar: 'from-amber-500 to-orange-500',
  },
  clicked: {
    surface: 'border-pink-100 bg-gradient-to-br from-pink-50 via-white to-rose-50',
    icon: 'bg-pink-500/15 text-pink-700',
    bar: 'from-pink-500 to-rose-500',
  },
  bounced: {
    surface: 'border-red-100 bg-gradient-to-br from-red-50 via-white to-rose-50',
    icon: 'bg-red-500/15 text-red-700',
    bar: 'from-red-500 to-rose-500',
  },
} as const

const toNumber = (value: unknown) => Number(value || 0)
const clampPercentage = (value: number) => Math.max(0, Math.min(100, value))

const formatChange = (value: number, suffix: '%' | 'pp', invertMeaning = false) => {
  const safeValue = Number.isFinite(value) ? value : 0
  const positive = safeValue >= 0
  const improved = invertMeaning ? !positive : positive
  const label = safeValue === 0 ? 'Estável' : `${positive ? '+' : ''}${safeValue.toFixed(1)} ${suffix}`

  return {
    label,
    className: safeValue === 0
      ? 'border-slate-200 bg-slate-100 text-slate-700'
      : improved
        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
        : 'border-rose-200 bg-rose-100 text-rose-700',
  }
}

const renderPercentageBar = (value: number, gradient: string) => (
  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
    <div
      className={cn('h-full rounded-full bg-gradient-to-r transition-all', gradient)}
      style={{ width: `${clampPercentage(value)}%` }}
    />
  </div>
)

export function Analytics() {
  const analyticsDefaultTimeRange = useSettingsStore((state) => state.settings.analyticsDefaultTimeRange)
  const [searchParams] = useSearchParams()
  const [timeRange, setTimeRange] = useState(analyticsDefaultTimeRange)
  const domainId = searchParams.get('domainId') || searchParams.get('domain') || undefined

  useEffect(() => {
    setTimeRange(analyticsDefaultTimeRange)
  }, [analyticsDefaultTimeRange])

  const { data: analyticsResponse, isLoading, refetch: refetchAnalytics, isFetching } = useQuery({
    queryKey: ['analytics', timeRange, domainId],
    queryFn: () => analyticsApi.getAnalytics({ timeRange, domainId }),
  })

  const { data: chartResponse, refetch: refetchChart } = useQuery({
    queryKey: ['analytics', 'chart', timeRange, domainId],
    queryFn: () => analyticsApi.getAnalyticsChart({ timeRange, domainId }),
  })

  const { data: topEmailsResponse, refetch: refetchTopEmails } = useQuery({
    queryKey: ['analytics', 'top-emails', timeRange, domainId],
    queryFn: () => analyticsApi.getTopEmails({ timeRange, domainId }),
  })

  const { data: domainsResponse, refetch: refetchDomains } = useQuery({
    queryKey: ['analytics', 'domains', timeRange, domainId],
    queryFn: () => analyticsApi.getDomains({ timeRange, domainId }),
  })

  const { data: activityResponse, refetch: refetchActivity } = useQuery({
    queryKey: ['analytics', 'recent-activity', timeRange, domainId],
    queryFn: () => analyticsApi.getRecentActivity({ timeRange, domainId }),
  })

  const handleRefresh = async () => {
    await Promise.all([refetchAnalytics(), refetchChart(), refetchTopEmails(), refetchDomains(), refetchActivity()])
  }

  const overview = analyticsResponse?.data || {}
  const chart = chartResponse?.data?.chart || []
  const topEmails = topEmailsResponse?.data?.emails || []
  const topDomains = domainsResponse?.data?.domains || []
  const activities = activityResponse?.data?.activities || []

  const totalSent = toNumber(overview.total_sent)
  const deliveredCount = toNumber(overview.delivered_count)
  const openedCount = toNumber(overview.opened_count)
  const clickedCount = toNumber(overview.clicked_count)
  const bouncedCount = toNumber(overview.bounced_count)
  const uniqueRecipients = toNumber(overview.unique_recipients)
  const deliveryRate = toNumber(overview.delivery_rate)
  const openRate = toNumber(overview.open_rate)
  const clickRate = toNumber(overview.click_rate)
  const bounceRate = toNumber(overview.bounce_rate)

  const bestEmail = topEmails[0]
  const strongestDomain = topDomains[0]
  const latestChartPoint = chart[chart.length - 1]
  const totalChartVolume = chart.reduce((acc: number, row: any) => acc + toNumber(row.sent), 0)

  const cards = [
    {
      key: 'sent',
      title: 'Emails enviados',
      value: formatNumber(totalSent),
      highlight: `${formatNumber(uniqueRecipients)} destinatários únicos`,
      detail: 'Base do funil no período',
      change: formatChange(toNumber(overview.sent_change), '%'),
      icon: Mail,
      progress: 100,
    },
    {
      key: 'delivered',
      title: 'Aceite SMTP',
      value: `${deliveryRate.toFixed(1)}%`,
      highlight: `${formatNumber(deliveredCount)} aceitos pelo servidor`,
      detail: 'Saúde técnica da entrega',
      change: formatChange(toNumber(overview.delivery_change), 'pp'),
      icon: TrendingUp,
      progress: deliveryRate,
    },
    {
      key: 'opened',
      title: 'Abertura',
      value: `${openRate.toFixed(1)}%`,
      highlight: `${formatNumber(openedCount)} aberturas`,
      detail: 'Leitura rastreada do email',
      change: formatChange(toNumber(overview.open_change), 'pp'),
      icon: Eye,
      progress: openRate,
    },
    {
      key: 'clicked',
      title: 'Clique',
      value: `${clickRate.toFixed(1)}%`,
      highlight: `${formatNumber(clickedCount)} cliques`,
      detail: 'Sinal mais forte de interesse',
      change: formatChange(toNumber(overview.click_change), 'pp'),
      icon: MousePointer,
      progress: clickRate,
    },
    {
      key: 'bounced',
      title: 'Bounce',
      value: `${bounceRate.toFixed(1)}%`,
      highlight: `${formatNumber(bouncedCount)} falhas ou rejeições`,
      detail: 'Quanto menor, melhor',
      change: formatChange(toNumber(overview.bounce_change), 'pp', true),
      icon: XCircle,
      progress: bounceRate,
    },
  ] as const

  const funnelSteps = [
    { label: 'Enviados', count: totalSent, percentage: 100, tone: metricStyles.sent.bar },
    { label: 'Aceitos SMTP', count: deliveredCount, percentage: totalSent > 0 ? (deliveredCount / totalSent) * 100 : 0, tone: metricStyles.delivered.bar },
    { label: 'Abertos', count: openedCount, percentage: totalSent > 0 ? (openedCount / totalSent) * 100 : 0, tone: metricStyles.opened.bar },
    { label: 'Clicados', count: clickedCount, percentage: totalSent > 0 ? (clickedCount / totalSent) * 100 : 0, tone: metricStyles.clicked.bar },
  ]

  const formatActivityLabel = (activity: any) => getEmailStatusLabel(activity.status || activity.event_type)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-teal-900 to-cyan-800 text-white shadow-xl">
        <CardContent className="relative p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_24%)]" />
          <div className="relative grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-white/20 bg-white/12 text-white">Painel vivo</Badge>
                <Badge className="border-white/20 bg-white/12 text-white">{timeRange}</Badge>
                {domainId && <Badge className="border-white/20 bg-white/12 text-white">Domínio filtrado</Badge>}
                {isFetching && <Badge className="border-white/20 bg-amber-400/20 text-amber-100">Atualizando</Badge>}
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Analytics</h1>
                <p className="max-w-2xl text-sm text-cyan-50/80 lg:text-base">
                  Visual mais direto para entender volume, aceite SMTP, abertura, clique e risco operacional sem precisar escavar tabelas.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-100/70">Volume</div>
                  <div className="text-3xl font-semibold">{formatNumber(totalSent)}</div>
                  <div className="mt-1 text-sm text-cyan-50/75">emails no período</div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-100/70">Melhor assunto</div>
                  <div className="line-clamp-2 text-base font-semibold">{bestEmail?.subject || 'Sem histórico suficiente'}</div>
                  <div className="mt-1 text-sm text-cyan-50/75">
                    {bestEmail ? `${Number(bestEmail.open_rate || 0).toFixed(1)}% abertura` : 'Envie campanhas para comparar'}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-100/70">Domínio líder</div>
                  <div className="text-base font-semibold">{strongestDomain?.domain || 'Sem domínio líder'}</div>
                  <div className="mt-1 text-sm text-cyan-50/75">
                    {strongestDomain ? `${Number(strongestDomain.delivery_rate || 0).toFixed(1)}% aceite SMTP` : 'Sem volume suficiente'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/15 bg-slate-950/25 p-5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Leitura rápida</div>
                  <div className="mt-2 text-xl font-semibold">Pulso do funil</div>
                </div>
                <Sparkles className="h-5 w-5 text-cyan-100/80" />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-cyan-50/80">Aceite SMTP</span>
                    <span className="font-medium text-white">{deliveryRate.toFixed(1)}%</span>
                  </div>
                  {renderPercentageBar(deliveryRate, metricStyles.delivered.bar)}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-cyan-50/80">Abertura</span>
                    <span className="font-medium text-white">{openRate.toFixed(1)}%</span>
                  </div>
                  {renderPercentageBar(openRate, metricStyles.opened.bar)}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-cyan-50/80">Clique</span>
                    <span className="font-medium text-white">{clickRate.toFixed(1)}%</span>
                  </div>
                  {renderPercentageBar(clickRate, metricStyles.clicked.bar)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {analyticsRanges.map((range) => (
                  <Button
                    key={range}
                    size="sm"
                    variant="ghost"
                    className={cn(
                      'rounded-full border border-white/15 px-4 text-white hover:bg-white/15 hover:text-white',
                      timeRange === range && 'bg-white text-slate-950 hover:bg-white hover:text-slate-950'
                    )}
                    onClick={() => setTimeRange(range)}
                  >
                    {range}
                  </Button>
                ))}
                <Button variant="secondary" className="rounded-full" onClick={() => handleRefresh()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="animate-pulse border-slate-200">
              <CardContent className="space-y-4 p-6">
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="h-8 w-20 rounded bg-slate-200" />
                <div className="h-2 w-full rounded bg-slate-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon
            const style = metricStyles[card.key]

            return (
              <Card key={card.key} className={cn('overflow-hidden shadow-sm', style.surface)}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className={cn('rounded-2xl p-3', style.icon)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge className={cn('rounded-full border px-3 py-1', card.change.className)}>
                      {card.change.label}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-600">{card.title}</div>
                    <div className="text-3xl font-semibold tracking-tight text-slate-950">{card.value}</div>
                    <div className="text-sm text-slate-700">{card.highlight}</div>
                    <div className="text-xs text-slate-500">{card.detail}</div>
                  </div>

                  <div className="space-y-2">
                    {renderPercentageBar(card.progress, style.bar)}
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Intensidade visual</span>
                      <span>{clampPercentage(card.progress).toFixed(0)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-xl">Ritmo do período</CardTitle>
                <CardDescription>Envio, aceite SMTP e engajamento na mesma linha do tempo.</CardDescription>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Último dia</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(toNumber(latestChartPoint?.sent))}</div>
                  <div className="text-xs text-slate-500">envios registrados</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Aberturas</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(openedCount)}</div>
                  <div className="text-xs text-slate-500">no recorte atual</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Volume total</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(totalChartVolume)}</div>
                  <div className="text-xs text-slate-500">somando todos os dias</div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap gap-2">
              <Badge className="border-teal-200 bg-teal-50 text-teal-700">Envios</Badge>
              <Badge className="border-blue-200 bg-blue-50 text-blue-700">Aceite SMTP</Badge>
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">Aberturas</Badge>
              <Badge className="border-pink-200 bg-pink-50 text-pink-700">Cliques</Badge>
            </div>

            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={chart} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.sent} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={chartColors.sent} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="deliveredGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.delivered} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={chartColors.delivered} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="openedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.opened} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={chartColors.opened} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="clickedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.clicked} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={chartColors.clicked} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 18px 48px rgba(15, 23, 42, 0.14)' }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                  formatter={(value: number, name: string) => [
                    formatNumber(Number(value || 0)),
                    name === 'sent' ? 'Enviados' : name === 'delivered' ? 'Aceitos SMTP' : name === 'opened' ? 'Abertos' : 'Cliques',
                  ]}
                />
                <Area type="monotone" dataKey="sent" stroke={chartColors.sent} strokeWidth={2.4} fill="url(#sentGradient)" />
                <Area type="monotone" dataKey="delivered" stroke={chartColors.delivered} strokeWidth={2.4} fill="url(#deliveredGradient)" />
                <Area type="monotone" dataKey="opened" stroke={chartColors.opened} strokeWidth={2.4} fill="url(#openedGradient)" />
                <Area type="monotone" dataKey="clicked" stroke={chartColors.clicked} strokeWidth={2.4} fill="url(#clickedGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <CardTitle className="text-xl">Funil visual</CardTitle>
            <CardDescription>Mostra a compressão natural do engajamento em cada etapa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {funnelSteps.map((step) => (
              <div key={step.label} className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{step.label}</div>
                    <div className="text-sm text-slate-500">{formatNumber(step.count)} registros</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-slate-900">{step.percentage.toFixed(1)}%</div>
                    <div className="text-xs text-slate-500">sobre enviados</div>
                  </div>
                </div>
                {renderPercentageBar(step.percentage, step.tone)}
              </div>
            ))}

            <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4">
              <div className="mb-2 flex items-center gap-2 text-cyan-800">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">Leitura operacional</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Se o aceite SMTP estiver alto e a abertura baixa, o gargalo tende a ser caixa de spam, assunto ou falta de pixel HTML.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-amber-50">
            <CardTitle className="text-xl">Atividade recente</CardTitle>
            <CardDescription>Eventos mais novos, em ordem de impacto visual e tempo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-muted-foreground">
                <Activity className="mx-auto mb-3 h-8 w-8" />
                Sem atividade recente.
              </div>
            ) : (
              activities.slice(0, 8).map((activity: any, index: number) => (
                <div
                  key={activity.id || `${activity.event_type}-${activity.created_at || activity.timestamp}-${index}`}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" />
                        <span className="font-medium text-slate-900">{formatActivityLabel(activity)}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {activity.email_subject || activity.subject || activity.email_to || activity.email}
                      </div>
                      <div className="text-xs text-slate-500">{activity.email_to || activity.email}</div>
                    </div>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50">
                      {formatRelativeTime(activity.created_at || activity.timestamp)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-pink-50">
              <CardTitle className="text-xl">Top emails</CardTitle>
              <CardDescription>Assuntos com maior resposta no período.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              {topEmails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-muted-foreground">
                  Nenhum email encontrado no período.
                </div>
              ) : (
                topEmails.slice(0, 5).map((email: any) => (
                  <div key={email.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{email.subject}</div>
                        <div className="text-xs text-slate-500">{formatRelativeTime(email.sent_at)}</div>
                      </div>
                      <Badge className="border-pink-200 bg-pink-50 text-pink-700">
                        {Number(email.open_rate || 0).toFixed(1)}% abertura
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
                      <div>{formatNumber(toNumber(email.sent_count))} enviados</div>
                      <div>{Number(email.click_rate || 0).toFixed(1)}% clique</div>
                      <div>{Number(email.bounce_rate || 0).toFixed(1)}% bounce</div>
                    </div>
                    {renderPercentageBar(toNumber(email.open_rate), metricStyles.opened.bar)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-blue-50">
              <CardTitle className="text-xl">Top domínios</CardTitle>
              <CardDescription>Leitura rápida de volume e saúde por remetente autenticado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              {topDomains.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-muted-foreground">
                  <Globe className="mx-auto mb-3 h-8 w-8" />
                  Nenhum domínio com dados no período.
                </div>
              ) : (
                topDomains.slice(0, 5).map((domain: any, index: number) => (
                  <div key={domain.domain_id || `${domain.domain}-${index}`} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{domain.domain}</div>
                        <div className="text-xs text-slate-500">{formatNumber(toNumber(domain.sent_count || domain.total_emails))} envios</div>
                      </div>
                      <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                        {Number(domain.delivery_rate || 0).toFixed(1)}% aceite SMTP
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
                      <div>{Number(domain.open_rate || 0).toFixed(1)}% abertura</div>
                      <div>{Number(domain.click_rate || 0).toFixed(1)}% clique</div>
                      <div>{Number(domain.bounce_rate || 0).toFixed(1)}% bounce</div>
                    </div>
                    {renderPercentageBar(toNumber(domain.delivery_rate), metricStyles.delivered.bar)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 bg-gradient-to-br from-teal-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Destinatários únicos</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(uniqueRecipients)}</div>
              <div className="mt-1 text-xs text-slate-500">Tamanho real da audiência atingida</div>
            </div>
            <Users className="h-5 w-5 text-teal-600" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-amber-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Leitura do momento</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">
                {latestChartPoint ? formatNumber(toNumber(latestChartPoint.opened)) : '0'}
              </div>
              <div className="mt-1 text-xs text-slate-500">aberturas no último ponto do gráfico</div>
            </div>
            <Activity className="h-5 w-5 text-amber-600" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Próximo foco</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">
                {deliveryRate >= 90 && openRate < 20 ? 'Melhorar abertura' : bounceRate > 5 ? 'Reduzir bounce' : 'Escalar volume com segurança'}
              </div>
              <div className="mt-1 text-xs text-slate-500">Recomendação visual baseada no funil atual</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-slate-700" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-amber-50">
            <CardTitle className="text-xl">Atividade recente</CardTitle>
            <CardDescription>Eventos mais novos, em ordem de impacto visual e tempo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-muted-foreground">
                <Activity className="mx-auto mb-3 h-8 w-8" />
                Sem atividade recente.
              </div>
            ) : (
              activities.slice(0, 8).map((activity: any, index: number) => (
                <div
                  key={activity.id || `${activity.event_type}-${activity.created_at || activity.timestamp}-${index}`}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" />
                        <span className="font-medium text-slate-900">{formatActivityLabel(activity)}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {activity.email_subject || activity.subject || activity.email_to || activity.email}
                      </div>
                      <div className="text-xs text-slate-500">{activity.email_to || activity.email}</div>
                    </div>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50">
                      {formatRelativeTime(activity.created_at || activity.timestamp)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-pink-50">
              <CardTitle className="text-xl">Top emails</CardTitle>
              <CardDescription>Assuntos com maior resposta no período.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              {topEmails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-muted-foreground">
                  Nenhum email encontrado no período.
                </div>
              ) : (
                topEmails.slice(0, 5).map((email: any) => (
                  <div key={email.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-900">{email.subject}</div>
                        <div className="text-xs text-slate-500">{formatRelativeTime(email.sent_at)}</div>
                      </div>
                      <Badge className="border-pink-200 bg-pink-50 text-pink-700">
                        {Number(email.open_rate || 0).toFixed(1)}% abertura
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <div>{formatNumber(toNumber(email.sent_count))} enviados</div>
                      <div>{Number(email.click_rate || 0).toFixed(1)}% clique</div>
                      <div>{Number(email.bounce_rate || 0).toFixed(1)}% bounce</div>
                    </div>
                    {renderPercentageBar(toNumber(email.open_rate), metricStyles.opened.bar)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-blue-50">
              <CardTitle className="text-xl">Top domínios</CardTitle>
              <CardDescription>Leitura rápida de volume e saúde por remetente autenticado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              {topDomains.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-muted-foreground">
                  <Globe className="mx-auto mb-3 h-8 w-8" />
                  Nenhum domínio com dados no período.
                </div>
              ) : (
                topDomains.slice(0, 5).map((domain: any, index: number) => (
                  <div key={domain.domain_id || `${domain.domain}-${index}`} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-900">{domain.domain}</div>
                        <div className="text-xs text-slate-500">{formatNumber(toNumber(domain.sent_count || domain.total_emails))} envios</div>
                      </div>
                      <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                        {Number(domain.delivery_rate || 0).toFixed(1)}% aceite SMTP
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <div>{Number(domain.open_rate || 0).toFixed(1)}% abertura</div>
                      <div>{Number(domain.click_rate || 0).toFixed(1)}% clique</div>
                      <div>{Number(domain.bounce_rate || 0).toFixed(1)}% bounce</div>
                    </div>
                    {renderPercentageBar(toNumber(domain.delivery_rate), metricStyles.delivered.bar)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 bg-gradient-to-br from-teal-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Destinatários únicos</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(uniqueRecipients)}</div>
              <div className="mt-1 text-xs text-slate-500">Tamanho real da audiência atingida</div>
            </div>
            <Users className="h-5 w-5 text-teal-600" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-amber-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Leitura do momento</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">
                {latestChartPoint ? formatNumber(toNumber(latestChartPoint.opened)) : '0'}
              </div>
              <div className="mt-1 text-xs text-slate-500">aberturas no último ponto do gráfico</div>
            </div>
            <Activity className="h-5 w-5 text-amber-600" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Próximo foco</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">
                {deliveryRate >= 90 && openRate < 20 ? 'Melhorar abertura' : bounceRate > 5 ? 'Reduzir bounce' : 'Escalar volume com segurança'}
              </div>
              <div className="mt-1 text-xs text-slate-500">Recomendação visual baseada no funil atual</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-slate-700" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
