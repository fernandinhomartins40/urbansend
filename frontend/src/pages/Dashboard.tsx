import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle, AlertTriangle, TrendingUp, FileText, Globe, Loader2 } from 'lucide-react'
import { analyticsApi, api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        
        // Fetch overview stats
        const overviewResponse = await analyticsApi.getOverview()
        setStats(overviewResponse.data.stats)
        
        // Check if we have recent activity endpoint
        try {
          const recentResponse = await api.get('/analytics/recent-activity')
          setRecentActivity(recentResponse.data.activities || [])
        } catch (error) {
          // If recent activity endpoint doesn't exist, use empty array
          setRecentActivity([])
        }
        
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const formatChangePercentage = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}% em relação ao mês passado`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral dos seus emails e métricas
          </p>
        </div>
        <Button>Enviar Email</Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEmails?.toLocaleString() || '0'}</div>
            <p className="text-xs text-muted-foreground">
              {stats ? formatChangePercentage(stats.emailsChange) : '+0% em relação ao mês passado'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Entrega</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.deliveryRate?.toFixed(1) || '0'}%</div>
            <p className="text-xs text-muted-foreground">
              {stats ? formatChangePercentage(stats.deliveryChange) : '+0% em relação ao mês passado'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Abertura</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.openRate?.toFixed(1) || '0'}%</div>
            <p className="text-xs text-muted-foreground">
              {stats ? formatChangePercentage(stats.openChange) : '+0% em relação ao mês passado'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Bounce</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.bounceRate?.toFixed(1) || '0'}%</div>
            <p className="text-xs text-muted-foreground">
              {stats ? formatChangePercentage(-stats.bounceChange) : '+0% em relação ao mês passado'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 4).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{item.email}</div>
                      <div className="text-sm text-muted-foreground">{item.status}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(item.timestamp), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma atividade recente encontrada.
                  <br />
                  Envie seus primeiros emails para ver as estatísticas aqui!
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button className="w-full justify-start">
                <Mail className="mr-2 h-4 w-4" />
                Enviar Email
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <FileText className="mr-2 h-4 w-4" />
                Criar Template
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Globe className="mr-2 h-4 w-4" />
                Adicionar Domínio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}