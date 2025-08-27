import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { analyticsApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  TrendingUp, Mail, Eye, MousePointer, XCircle,
  Download, RefreshCw, ArrowUp, ArrowDown,
  Users, Globe, AlertTriangle, Shield
} from 'lucide-react'

interface MetricCard {
  title: string
  value: string
  change: number
  changeType: 'increase' | 'decrease'
  icon: React.ReactNode
  description: string
}

interface TopEmail {
  id: number
  subject: string
  sent_count: number
  open_rate: number
  click_rate: number
  bounce_rate: number
  sent_at: string
}

const COLORS = {
  sent: '#3b82f6',
  delivered: '#10b981',
  opened: '#f59e0b',
  clicked: '#8b5cf6',
  bounced: '#ef4444',
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

export function Analytics() {
  const [timeRange, setTimeRange] = useState('7d')
  const [selectedMetric, setSelectedMetric] = useState('overview')

  const { data: analytics, isLoading, refetch } = useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: () => analyticsApi.getAnalytics({ timeRange }),
  })

  const { data: chartData } = useQuery({
    queryKey: ['analytics', 'chart', timeRange],
    queryFn: () => analyticsApi.getAnalyticsChart({ timeRange }),
  })

  const { data: topEmails } = useQuery({
    queryKey: ['analytics', 'top-emails', timeRange],
    queryFn: () => analyticsApi.getTopEmails({ timeRange }),
  })

  const data = analytics?.data || {}
  const chart = chartData?.data?.chart || []
  const emails = topEmails?.data?.emails || []

  const metrics: MetricCard[] = [
    {
      title: 'Total de Emails',
      value: data.total_sent?.toLocaleString() || '0',
      change: data.sent_change || 0,
      changeType: (data.sent_change || 0) >= 0 ? 'increase' : 'decrease',
      icon: <Mail className="h-4 w-4" />,
      description: 'Emails enviados no período',
    },
    {
      title: 'Taxa de Entrega',
      value: `${data.delivery_rate?.toFixed(1) || '0'}%`,
      change: data.delivery_change || 0,
      changeType: (data.delivery_change || 0) >= 0 ? 'increase' : 'decrease',
      icon: <TrendingUp className="h-4 w-4" />,
      description: 'Emails entregues com sucesso',
    },
    {
      title: 'Taxa de Abertura',
      value: `${data.open_rate?.toFixed(1) || '0'}%`,
      change: data.open_change || 0,
      changeType: (data.open_change || 0) >= 0 ? 'increase' : 'decrease',
      icon: <Eye className="h-4 w-4" />,
      description: 'Emails abertos pelos destinatários',
    },
    {
      title: 'Taxa de Clique',
      value: `${data.click_rate?.toFixed(1) || '0'}%`,
      change: data.click_change || 0,
      changeType: (data.click_change || 0) >= 0 ? 'increase' : 'decrease',
      icon: <MousePointer className="h-4 w-4" />,
      description: 'Links clicados nos emails',
    },
    {
      title: 'Taxa de Bounce',
      value: `${data.bounce_rate?.toFixed(1) || '0'}%`,
      change: data.bounce_change || 0,
      changeType: (data.bounce_change || 0) <= 0 ? 'increase' : 'decrease',
      icon: <XCircle className="h-4 w-4" />,
      description: 'Emails que falharam na entrega',
    },
    {
      title: 'Destinatários Únicos',
      value: data.unique_recipients?.toLocaleString() || '0',
      change: data.recipients_change || 0,
      changeType: (data.recipients_change || 0) >= 0 ? 'increase' : 'decrease',
      icon: <Users className="h-4 w-4" />,
      description: 'Endereços únicos que receberam emails',
    },
  ]

  const pieData = [
    { name: 'Entregues', value: data.delivered_count || 0, color: COLORS.delivered },
    { name: 'Abertos', value: data.opened_count || 0, color: COLORS.opened },
    { name: 'Clicados', value: data.clicked_count || 0, color: COLORS.clicked },
    { name: 'Bounced', value: data.bounced_count || 0, color: COLORS.bounced },
  ]

  const timeRanges = [
    { value: '24h', label: 'Últimas 24h' },
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '90d', label: 'Últimos 90 dias' },
  ]

  const getChangeIcon = (change: number, type: 'increase' | 'decrease') => {
    if (change === 0) return null
    
    const isPositive = type === 'increase' ? change > 0 : change < 0
    return isPositive ? (
      <ArrowUp className="h-3 w-3 text-green-500" />
    ) : (
      <ArrowDown className="h-3 w-3 text-red-500" />
    )
  }

  const getChangeColor = (change: number, type: 'increase' | 'decrease') => {
    if (change === 0) return 'text-muted-foreground'
    
    const isPositive = type === 'increase' ? change > 0 : change < 0
    return isPositive ? 'text-green-600' : 'text-red-600'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Análises detalhadas de desempenho dos seus emails
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 border rounded-lg p-1">
            {timeRanges.map((range) => (
              <Button
                key={range.value}
                variant={timeRange === range.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>
          
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Metrics Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {metrics.map((metric, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between space-y-0 pb-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      {metric.title}
                    </div>
                    {metric.icon}
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                      {getChangeIcon(metric.change, metric.changeType)}
                      <span className={getChangeColor(metric.change, metric.changeType)}>
                        {metric.change !== 0 && `${Math.abs(metric.change).toFixed(1)}%`}
                      </span>
                      <span>em relação ao período anterior</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs value={selectedMetric} onValueChange={setSelectedMetric}>
            <TabsList>
              <TabsTrigger value="overview">
                <TrendingUp className="h-4 w-4 mr-2" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="performance">
                <Mail className="h-4 w-4 mr-2" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="engagement">
                <Eye className="h-4 w-4 mr-2" />
                Engajamento
              </TabsTrigger>
              <TabsTrigger value="deliverability">
                <Globe className="h-4 w-4 mr-2" />
                Entregabilidade
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Email Volume Chart */}
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Volume de Emails</CardTitle>
                    <CardDescription>
                      Histórico de emails enviados, entregues e abertos
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={chart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                          formatter={(value, name) => [
                            value.toLocaleString(),
                            name === 'sent' ? 'Enviados' : 
                            name === 'delivered' ? 'Entregues' :
                            name === 'opened' ? 'Abertos' :
                            name === 'clicked' ? 'Clicados' : 'Bounced'
                          ]}
                        />
                        <Legend 
                          formatter={(value) => 
                            value === 'sent' ? 'Enviados' : 
                            value === 'delivered' ? 'Entregues' :
                            value === 'opened' ? 'Abertos' :
                            value === 'clicked' ? 'Clicados' : 'Bounced'
                          }
                        />
                        <Area 
                          type="monotone" 
                          dataKey="sent" 
                          stackId="1" 
                          stroke={COLORS.sent} 
                          fill={COLORS.sent} 
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="delivered" 
                          stackId="2" 
                          stroke={COLORS.delivered} 
                          fill={COLORS.delivered} 
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="opened" 
                          stackId="3" 
                          stroke={COLORS.opened} 
                          fill={COLORS.opened} 
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Distribution Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Distribuição de Status</CardTitle>
                    <CardDescription>
                      Proporção de emails por status final
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => value.toLocaleString()} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Top Performing Emails */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Emails</CardTitle>
                    <CardDescription>
                      Emails com melhor performance no período
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {emails.slice(0, 5).map((email: TopEmail, index: number) => (
                        <div key={email.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-medium">#{index + 1}</span>
                              <span className="font-medium truncate">{email.subject}</span>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <span>{email.sent_count.toLocaleString()} enviados</span>
                              <span>{formatRelativeTime(email.sent_at)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-1">
                            <Badge variant="outline" className="text-xs">
                              {email.open_rate.toFixed(1)}% abertura
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {email.click_rate.toFixed(1)}% clique
                            </Badge>
                          </div>
                        </div>
                      ))}
                      
                      {emails.length === 0 && (
                        <div className="text-center py-6 text-muted-foreground">
                          <Mail className="h-8 w-8 mx-auto mb-2" />
                          <p>Nenhum email encontrado no período</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="mt-6">
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance por Período</CardTitle>
                    <CardDescription>
                      Análise detalhada das taxas de entrega, abertura e clique
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={chart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date"
                          tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                          formatter={(value: any, name) => [
                            `${((value / chart.find((item: any) => item.date === chart[0]?.date)?.sent || 1) * 100).toFixed(2)}%`,
                            name === 'delivered' ? 'Taxa de Entrega' :
                            name === 'opened' ? 'Taxa de Abertura' :
                            name === 'clicked' ? 'Taxa de Clique' : name
                          ]}
                        />
                        <Legend 
                          formatter={(value) => 
                            value === 'delivered' ? 'Taxa de Entrega' :
                            value === 'opened' ? 'Taxa de Abertura' :
                            value === 'clicked' ? 'Taxa de Clique' : value
                          }
                        />
                        <Line 
                          type="monotone" 
                          dataKey="delivered" 
                          stroke={COLORS.delivered} 
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="opened" 
                          stroke={COLORS.opened} 
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="clicked" 
                          stroke={COLORS.clicked} 
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="engagement" className="mt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Horários de Maior Engajamento</CardTitle>
                    <CardDescription>
                      Melhores horários para envio baseado em aberturas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { hour: '09:00', rate: 28.5, bar: 85 },
                        { hour: '14:00', rate: 24.2, bar: 72 },
                        { hour: '11:00', rate: 22.8, bar: 68 },
                        { hour: '16:00', rate: 20.1, bar: 60 },
                        { hour: '10:00', rate: 18.9, bar: 56 },
                      ].map((time, index) => (
                        <div key={index} className="flex items-center space-x-4">
                          <div className="w-16 text-sm font-mono">{time.hour}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="h-2 bg-blue-200 rounded-full flex-1 mr-4">
                                <div 
                                  className="h-2 bg-blue-500 rounded-full" 
                                  style={{ width: `${time.bar}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-medium">{time.rate}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Dias da Semana</CardTitle>
                    <CardDescription>
                      Performance por dia da semana
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={[
                          { day: 'Seg', opens: 234, clicks: 45 },
                          { day: 'Ter', opens: 298, clicks: 67 },
                          { day: 'Qua', opens: 276, clicks: 58 },
                          { day: 'Qui', opens: 312, clicks: 72 },
                          { day: 'Sex', opens: 189, clicks: 34 },
                          { day: 'Sáb', opens: 98, clicks: 15 },
                          { day: 'Dom', opens: 87, clicks: 12 },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="opens" fill={COLORS.opened} name="Aberturas" />
                        <Bar dataKey="clicks" fill={COLORS.clicked} name="Cliques" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="deliverability" className="mt-6">
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Reputação do IP</p>
                          <p className="text-2xl font-bold text-green-600">Excelente</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                          <TrendingUp className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Score de Domínio</p>
                          <p className="text-2xl font-bold">95/100</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <Globe className="h-6 w-6 text-blue-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Blacklist Status</p>
                          <p className="text-2xl font-bold text-green-600">Limpo</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                          <Shield className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Bounce Analysis</CardTitle>
                    <CardDescription>
                      Análise detalhada dos motivos de bounce
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { reason: 'Caixa de entrada cheia', count: 23, percentage: 45.1 },
                        { reason: 'Email inexistente', count: 15, percentage: 29.4 },
                        { reason: 'Bloqueio temporário', count: 8, percentage: 15.7 },
                        { reason: 'Filtro de spam', count: 5, percentage: 9.8 },
                      ].map((bounce, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            <div>
                              <div className="font-medium">{bounce.reason}</div>
                              <div className="text-sm text-muted-foreground">
                                {bounce.count} ocorrências
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{bounce.percentage}%</div>
                            <div className="text-sm text-muted-foreground">do total</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}