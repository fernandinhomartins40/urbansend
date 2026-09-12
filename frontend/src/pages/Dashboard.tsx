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
    surface: 'border-border bg-card',
    icon: 'bg-primary/10 text-primary',
    bar: 'from-primary to-primary',
  },
  delivery: {
    surface: 'border-border bg-card',
    icon: 'bg-primary/10 text-primary',
    bar: 'from-primary to-primary',
  },
  open: {
    surface: 'border-border bg-card',
    icon: 'bg-primary/10 text-primary',
    bar: 'from-primary to-primary',
  },
  bounce: {
    surface: 'border-border bg-card',
    icon: 'bg-destructive/10 text-destructive',
    bar: 'from-destructive to-destructive',
  },
} as const

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value))

const renderPercentageBar = (value: number, gradient: string) => (
  <div className="h-2 overflow-hidden rounded-full bg-muted">
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
      ? 'vm-status vm-status-neutral'
      : improved
        ? 'vm-status vm-status-success'
        : 'vm-status vm-status-danger',
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
      <section className="vm-page-hero">
        <div className="relative grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="vm-status vm-status-info">Resumo operacional</span>
              <span className="vm-status vm-status-neutral">{formatPollingLabel(currentInterval)}</span>
              {isError && <span className="vm-status vm-status-danger">Com falha recente</span>}
            </div>

            <div className="space-y-2">
              <h1 className="vm-page-title">Dashboard</h1>
              <p className="vm-page-description">
                Leitura rápida do que importa agora: volume, aceite SMTP, abertura, bounce e o próximo foco operacional.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="vm-hero-card">
                <div className="vm-hero-label">Volume</div>
                <div className="vm-hero-value">{formatNumber(safeStats.totalEmails)}</div>
                <div className="mt-1 text-sm text-muted-foreground">base do período atual</div>
              </div>
              <div className="vm-hero-card">
                <div className="vm-hero-label">Saúde</div>
                <div className="vm-hero-value">{safeStats.deliveryRate.toFixed(1)}%</div>
                <div className="mt-1 text-sm text-muted-foreground">aceite SMTP consolidado</div>
              </div>
              <div className="vm-hero-card">
                <div className="vm-hero-label">Próximo passo</div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {safeStats.deliveryRate >= 90 && safeStats.openRate < 20
                    ? 'melhorar abertura'
                    : safeStats.bounceRate > 5
                      ? 'reduzir bounce'
                      : 'escalar com segurança'}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">ação sugerida pelo funil</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="vm-hero-label">Pulso do dia</div>
                <div className="mt-2 text-xl font-semibold text-foreground">Indicadores vivos</div>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Aceite SMTP</span>
                  <span className="font-medium text-foreground">{safeStats.deliveryRate.toFixed(1)}%</span>
                </div>
                {renderPercentageBar(safeStats.deliveryRate, metricStyles.delivery.bar)}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Abertura</span>
                  <span className="font-medium text-foreground">{safeStats.openRate.toFixed(1)}%</span>
                </div>
                {renderPercentageBar(safeStats.openRate, metricStyles.open.bar)}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Intenção de clique</span>
                  <span className="font-medium text-foreground">{clickEstimate.toFixed(1)}%</span>
                </div>
                {renderPercentageBar(clickEstimate, 'from-primary to-primary')}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleRefresh()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
              <Button variant="outline" onClick={() => navigate('/app/analytics')}>
                Ver analytics
              </Button>
            </div>
          </div>
        </div>
      </section>

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
                  <div className="text-sm font-medium text-muted-foreground">{card.title}</div>
                  <div className="text-3xl font-semibold tracking-tight text-foreground">{card.value}</div>
                  <div className="text-sm text-muted-foreground">{card.subtitle}</div>
                </div>

                <div className="space-y-2">
                  {renderPercentageBar(card.progress, style.bar)}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
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
        <Card className="overflow-hidden border-border shadow-sm">
          <CardHeader className="border-b bg-muted/35">
            <CardTitle className="text-xl">Atividade recente</CardTitle>
            <CardDescription>Os eventos mais novos da conta, com leitura direta do status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {recentActivity.length > 0 ? (
              recentActivity.slice(0, 6).map((item, index) => (
                <div
                  key={`${item.email}-${item.timestamp}-${index}`}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                        <span className="font-medium text-foreground">{getEmailStatusLabel(item.status)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">{item.email}</div>
                    </div>
                    <Badge variant="outline" className="rounded-full border-border bg-muted/50">
                      {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: ptBR })}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                <Activity className="mx-auto mb-3 h-8 w-8" />
                Nenhuma atividade recente encontrada.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-border shadow-sm">
            <CardHeader className="border-b bg-muted/35">
              <CardTitle className="text-xl">Leitura operacional</CardTitle>
              <CardDescription>Resumo rápido do que merece atenção agora.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="rounded-xl border border-border bg-muted/45 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">Aceite SMTP</div>
                {renderPercentageBar(safeStats.deliveryRate, metricStyles.delivery.bar)}
                <div className="mt-2 text-xs text-muted-foreground">Entrega técnica aceita pelos servidores remotos.</div>
              </div>

              <div className="rounded-xl border border-border bg-muted/45 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">Abertura</div>
                {renderPercentageBar(safeStats.openRate, metricStyles.open.bar)}
                <div className="mt-2 text-xs text-muted-foreground">Rastreada por HTML/pixel ou clique em link.</div>
              </div>

              <div className="rounded-xl border border-border bg-muted/45 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">Bounce</div>
                {renderPercentageBar(safeStats.bounceRate, metricStyles.bounce.bar)}
                <div className="mt-2 text-xs text-muted-foreground">Falhas permanentes ou temporárias do envio.</div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border shadow-sm">
            <CardHeader className="border-b bg-muted/35">
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
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Aceite x abertura</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{Math.max(0, safeStats.deliveryRate - safeStats.openRate).toFixed(1)} pp</div>
              <div className="mt-1 text-xs text-muted-foreground">Diferença entre chegada técnica e engajamento.</div>
            </div>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Indicador de clique</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{clickEstimate.toFixed(1)}%</div>
              <div className="mt-1 text-xs text-muted-foreground">Estimativa visual para intensidade de ação.</div>
            </div>
            <MousePointer className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex h-full items-start justify-between gap-4 p-5">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Próximo foco</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {safeStats.deliveryRate >= 90 && safeStats.openRate < 20
                  ? 'trabalhar assunto e caixa de entrada'
                  : safeStats.bounceRate > 5
                    ? 'limpar base e autenticação'
                    : 'aumentar volume com controle'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Orientação automática a partir dos indicadores.</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
