import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { analyticsApi, api } from '@/lib/api'
import { getEmailStatusLabel } from '@/lib/emailEngagement'
import { cn, formatNumber } from '@/lib/utils'
import { useSmartPolling } from '@/hooks/useSmartPolling'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  FileText,
  Globe,
  Loader2,
  Mail,
  MousePointer,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

interface DashboardStats {
  totalEmails: number
  deliveryRate: number
  openRate: number
  bounceRate: number
  emailsChange: number
  deliveryChange: number
  openChange: number
  bounceChange: number
}

interface RecentActivity {
  email: string
  status: string
  timestamp: string
}

const metricStyles = {
  volume: {
    surface: 'border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50',
    icon: 'bg-teal-500/15 text-teal-700',
    bar: 'from-teal-500 to-cyan-500',
  },
  delivery: {
    surface: 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50',
    icon: 'bg-blue-500/15 text-blue-700',
    bar: 'from-blue-500 to-indigo-500',
  },
  open: {
    surface: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    icon: 'bg-amber-500/15 text-amber-700',
    bar: 'from-amber-500 to-orange-500',
  },
  bounce: {
    surface: 'border-red-100 bg-gradient-to-br from-red-50 via-white to-rose-50',
    icon: 'bg-red-500/15 text-red-700',
    bar: 'from-red-500 to-rose-500',
  },
} as const

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value))

const renderPercentageBar = (value: number, gradient: string) => (
  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
    <div
      className={cn('h-full rounded-full bg-gradient-to-r transition-all', gradient)}
      style={{ width: `${clampPercentage(value)}%` }}
    />
  </div>
)

const formatChange = (value: number, invertMeaning = false) => {
  const safeValue = Number.isFinite(value) ? value : 0
  const positive = safeValue >= 0
  const improved = invertMeaning ? !positive : positive
  const label = safeValue === 0 ? 'Estável' : `${positive ? '+' : ''}${safeValue.toFixed(1)}%`

  return {
    label,
    className: safeValue === 0
      ? 'border-slate-200 bg-slate-100 text-slate-700'
      : improved
        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
        : 'border-rose-200 bg-rose-100 text-rose-700',
  }
}

const formatPollingLabel = (interval?: number) => {
  if (!interval) {
    return 'Atualização dinâmica'
  }

  if (interval < 60000) {
    return `Atualiza a cada ${Math.round(interval / 1000)}s`
  }

  return `Atualiza a cada ${Math.round(interval / 60000)}min`
}

export function Dashboard() {
  const navigate = useNavigate()
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])

  const {
    data: stats,
    isLoading: loading,
    isError,
    currentInterval,
    refetch: refetchStats,
  } = useSmartPolling({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const overviewResponse = await analyticsApi.getOverview()
      return overviewResponse.data.stats as DashboardStats
    },
    baseInterval: 30000,
    maxInterval: 300000,
    onError: (error) => {
      console.error('Error fetching dashboard stats:', error)
    }
  })

  const {
    data: activityData,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useSmartPolling({
    queryKey: ['recent-activity'],
    queryFn: async (): Promise<RecentActivity[]> => {
      try {
        const recentResponse = await api.get('/analytics/recent-activity')
        return recentResponse.data.activities || []
      } catch {
        return []
      }
    },
    baseInterval: 60000,
    maxInterval: 600000,
  })

  useEffect(() => {
    if (activityData) {
      setRecentActivity(activityData as RecentActivity[])
    }
  }, [activityData])

  const handleRefresh = async () => {
    await Promise.all([refetchStats(), refetchActivity()])
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  const safeStats: DashboardStats = stats || {
    totalEmails: 0,
    deliveryRate: 0,
    openRate: 0,
    bounceRate: 0,
    emailsChange: 0,
    deliveryChange: 0,
    openChange: 0,
    bounceChange: 0,
  }

  const deliveryBadge = formatChange(safeStats.deliveryChange)
  const openBadge = formatChange(safeStats.openChange)
  const bounceBadge = formatChange(safeStats.bounceChange, true)
  const emailBadge = formatChange(safeStats.emailsChange)
  const clickEstimate = safeStats.deliveryRate > 0 ? Math.max(0, Math.min(100, safeStats.openRate * 0.45)) : 0

  const cards = [
    {
      key: 'volume',
      title: 'Volume total',
      value: formatNumber(safeStats.totalEmails),
      subtitle: 'emails processados no período',
      badge: emailBadge,
      icon: Mail,
      progress: 100,
    },
    {
      key: 'delivery',
      title: 'Aceite SMTP',
      value: `${safeStats.deliveryRate.toFixed(1)}%`,
      subtitle: 'aceitação técnica no servidor remoto',
      badge: deliveryBadge,
      icon: CheckCircle,
      progress: safeStats.deliveryRate,
    },
    {
      key: 'open',
      title: 'Abertura',
      value: `${safeStats.openRate.toFixed(1)}%`,
      subtitle: 'leitura rastreada dos emails',
      badge: openBadge,
      icon: TrendingUp,
      progress: safeStats.openRate,
    },
    {
      key: 'bounce',
      title: 'Bounce',
      value: `${safeStats.bounceRate.toFixed(1)}%`,
      subtitle: 'falhas e rejeições no envio',
      badge: bounceBadge,
      icon: AlertTriangle,
      progress: safeStats.bounceRate,
    },
  ] as const

  const actionCards = [
    {
      title: 'Enviar email',
      description: 'Disparar um novo envio transacional.',
      icon: Mail,
      onClick: () => navigate('/app/emails/send'),
      variant: 'default' as const,
    },
    {
      title: 'Criar template',
      description: 'Preparar conteúdo reutilizável e padronizado.',
      icon: FileText,
      onClick: () => navigate('/app/templates'),
      variant: 'outline' as const,
    },
    {
      title: 'Adicionar domínio',
      description: 'Autenticar SPF, DKIM e DMARC para envio.',
      icon: Globe,
      onClick: () => navigate('/app/domains?mode=setup'),
      variant: 'outline' as const,
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-800 text-white shadow-xl">
        <CardContent className="relative p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_24%)]" />
          <div className="relative grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-white/20 bg-white/12 text-white">Resumo operacional</Badge>
                <Badge className="border-white/20 bg-white/12 text-white">{formatPollingLabel(currentInterval)}</Badge>
                {isError && <Badge className="border-rose-300/30 bg-rose-500/20 text-rose-100">Com falha recente</Badge>}
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Dashboard</h1>
                <p className="max-w-2xl text-sm text-cyan-50/80 lg:text-base">
                  Leitura rápida do que importa agora: volume, aceite SMTP, abertura, bounce e o próximo foco operacional.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-100/70">Volume</div>
                  <div className="text-3xl font-semibold">{formatNumber(safeStats.totalEmails)}</div>
                  <div className="mt-1 text-sm text-cyan-50/75">base do período atual</div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-100/70">Saúde</div>
                  <div className="text-3xl font-semibold">{safeStats.deliveryRate.toFixed(1)}%</div>
                  <div className="mt-1 text-sm text-cyan-50/75">aceite SMTP consolidado</div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-100/70">Próximo passo</div>
                  <div className="text-base font-semibold">
                    {safeStats.deliveryRate >= 90 && safeStats.openRate < 20
                      ? 'melhorar abertura'
                      : safeStats.bounceRate > 5
                        ? 'reduzir bounce'
                        : 'escalar com segurança'}
                  </div>
                  <div className="mt-1 text-sm text-cyan-50/75">ação sugerida pelo funil</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/15 bg-slate-950/25 p-5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Pulso do dia</div>
                  <div className="mt-2 text-xl font-semibold">Indicadores vivos</div>
                </div>
                <Sparkles className="h-5 w-5 text-cyan-100/80" />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-cyan-50/80">Aceite SMTP</span>
                    <span className="font-medium text-white">{safeStats.deliveryRate.toFixed(1)}%</span>
                  </div>
                  {renderPercentageBar(safeStats.deliveryRate, metricStyles.delivery.bar)}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-cyan-50/80">Abertura</span>
                    <span className="font-medium text-white">{safeStats.openRate.toFixed(1)}%</span>
                  </div>
                  {renderPercentageBar(safeStats.openRate, metricStyles.open.bar)}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-cyan-50/80">Intenção de clique</span>
                    <span className="font-medium text-white">{clickEstimate.toFixed(1)}%</span>
                  </div>
                  {renderPercentageBar(clickEstimate, 'from-pink-500 to-rose-500')}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="rounded-full" onClick={() => handleRefresh()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar
                </Button>
                <Button variant="ghost" className="rounded-full border border-white/15 text-white hover:bg-white/15 hover:text-white" onClick={() => navigate('/app/analytics')}>
                  Ver analytics
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const style = metricStyles[card.key]
          const Icon = card.icon

          return (
            <Card key={card.key} className={cn('overflow-hidden shadow-sm', style.surface)}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className={cn('rounded-2xl p-3', style.icon)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge className={cn('rounded-full border px-3 py-1', card.badge.className)}>
                    {card.badge.label}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-600">{card.title}</div>
                  <div className="text-3xl font-semibold tracking-tight text-slate-950">{card.value}</div>
                  <div className="text-sm text-slate-700">{card.subtitle}</div>
                </div>

                <div className="space-y-2">
                  {renderPercentageBar(card.progress, style.bar)}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Leitura visual</span>
                    <span>{clampPercentage(card.progress).toFixed(0)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-amber-50">
            <CardTitle className="text-xl">Atividade recente</CardTitle>
            <CardDescription>Os eventos mais novos da conta, com leitura direta do status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {recentActivity.length > 0 ? (
              recentActivity.slice(0, 6).map((item, index) => (
                <div
                  key={`${item.email}-${item.timestamp}-${index}`}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" />
                        <span className="font-medium text-slate-900">{getEmailStatusLabel(item.status)}</span>
                      </div>
                      <div className="text-sm text-slate-700">{item.email}</div>
                    </div>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50">
                      {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: ptBR })}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-muted-foreground">
                <Activity className="mx-auto mb-3 h-8 w-8" />
                Nenhuma atividade recente encontrada.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-cyan-50">
              <CardTitle className="text-xl">Leitura operacional</CardTitle>
              <CardDescription>Resumo rápido do que merece atenção agora.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-2 text-sm font-medium text-slate-700">Aceite SMTP</div>
                {renderPercentageBar(safeStats.deliveryRate, metricStyles.delivery.bar)}
                <div className="mt-2 text-xs text-slate-500">Entrega técnica aceita pelos servidores remotos.</div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-2 text-sm font-medium text-slate-700">Abertura</div>
                {renderPercentageBar(safeStats.openRate, metricStyles.open.bar)}
                <div className="mt-2 text-xs text-slate-500">Rastreada por HTML/pixel ou clique em link.</div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-2 text-sm font-medium text-slate-700">Bounce</div>
                {renderPercentageBar(safeStats.bounceRate, metricStyles.bounce.bar)}
                <div className="mt-2 text-xs text-slate-500">Falhas permanentes ou temporárias do envio.</div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-teal-50">
              <CardTitle className="text-xl">Ações rápidas</CardTitle>
              <CardDescription>Caminhos mais usados para agir sobre os números.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              {actionCards.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={action.title}
                    variant={action.variant}
                    className="h-auto w-full justify-between rounded-2xl px-4 py-4"
                    onClick={action.onClick}
                  >
                    <div className="flex items-start gap-3 text-left">
                      <Icon className="mt-0.5 h-4 w-4" />
                      <div>
                        <div className="font-medium">{action.title}</div>
                        <div className="text-xs opacity-80">{action.description}</div>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 bg-gradient-to-br from-teal-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Aceite x abertura</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{Math.max(0, safeStats.deliveryRate - safeStats.openRate).toFixed(1)} pp</div>
              <div className="mt-1 text-xs text-slate-500">Diferença entre chegada técnica e engajamento.</div>
            </div>
            <TrendingUp className="h-5 w-5 text-teal-600" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-amber-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Indicador de clique</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{clickEstimate.toFixed(1)}%</div>
              <div className="mt-1 text-xs text-slate-500">Estimativa visual para intensidade de ação.</div>
            </div>
            <MousePointer className="h-5 w-5 text-amber-600" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-600">Próximo foco</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">
                {safeStats.deliveryRate >= 90 && safeStats.openRate < 20
                  ? 'trabalhar assunto e caixa de entrada'
                  : safeStats.bounceRate > 5
                    ? 'limpar base e autenticação'
                    : 'aumentar volume com controle'}
              </div>
              <div className="mt-1 text-xs text-slate-500">Orientação automática a partir dos indicadores.</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-slate-700" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
