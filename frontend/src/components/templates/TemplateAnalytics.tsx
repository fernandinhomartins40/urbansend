import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp,
  Users,
  Heart,
  Copy,
  Star,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Award,
  FileText,
  Eye
} from 'lucide-react'
import { sharedTemplateApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'

interface TemplateAnalyticsProps {
  templateId?: number
  className?: string
}

export const TemplateAnalytics: React.FC<TemplateAnalyticsProps> = ({
  templateId,
  className
}) => {
  const [trendingPeriod, setTrendingPeriod] = useState<'day' | 'week' | 'month'>('week')

  // Analytics específicas de um template
  const { data: templateAnalytics, isLoading: templateLoading } = useQuery({
    queryKey: ['template-analytics', templateId],
    queryFn: async () => {
      const response = await sharedTemplateApi.getTemplateAnalytics(templateId)
      return response.data
    },
    enabled: !!templateId,
    staleTime: 5 * 60 * 1000
  })

  // Analytics gerais (quando templateId não é fornecido)
  const { data: generalAnalytics, isLoading: generalLoading } = useQuery({
    queryKey: ['general-analytics'],
    queryFn: async () => {
      const response = await sharedTemplateApi.getTemplateAnalytics()
      return response.data
    },
    enabled: !templateId,
    staleTime: 5 * 60 * 1000
  })

  // Templates em tendência
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending-templates', trendingPeriod],
    queryFn: async () => {
      const response = await sharedTemplateApi.getTrendingTemplates(trendingPeriod)
      return response.data
    },
    staleTime: 5 * 60 * 1000
  })

  const isLoading = templateLoading || generalLoading || trendingLoading
  const analytics = templateId ? templateAnalytics : generalAnalytics
  const trending = trendingData?.templates || []

  // Componente para métricas individuais
  const MetricCard = ({
    title,
    value,
    icon: Icon,
    description,
    trend,
    color = 'blue'
  }: {
    title: string
    value: string | number
    icon: any
    description?: string
    trend?: string
    color?: 'blue' | 'green' | 'purple' | 'orange' | 'red'
  }) => {
    const colorClasses = {
      blue: 'text-blue-600 bg-blue-100',
      green: 'text-green-600 bg-green-100',
      purple: 'text-purple-600 bg-purple-100',
      orange: 'text-orange-600 bg-orange-100',
      red: 'text-red-600 bg-red-100'
    }

    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              {description && (
                <p className="text-xs text-gray-500 mt-1">{description}</p>
              )}
            </div>
            <div className={`p-3 rounded-full ${colorClasses[color]}`}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
          {trend && (
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600 font-medium">{trend}</span>
              <span className="text-gray-600 ml-1">vs período anterior</span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className={className}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {templateId ? 'Analytics do Template' : 'Analytics Geral'}
        </h1>
        <p className="text-gray-600">
          {templateId
            ? 'Métricas detalhadas de performance e engajamento'
            : 'Visão geral do seu desempenho com templates'
          }
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="trending">Em Tendência</TabsTrigger>
          {templateId && <TabsTrigger value="usage">Histórico de Uso</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {templateId && analytics?.template ? (
            // Analytics específicas do template
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                  title="Visualizações"
                  value={analytics.template.usage_count || 0}
                  icon={Eye}
                  color="blue"
                  description="Total de visualizações"
                />

                <MetricCard
                  title="Clonagens"
                  value={analytics.template.clone_count || 0}
                  icon={Copy}
                  color="green"
                  description="Templates clonados"
                />

                <MetricCard
                  title="Avaliação"
                  value={analytics.ratings?.average || 0}
                  icon={Star}
                  color="orange"
                  description={`${analytics.ratings?.total || 0} avaliações`}
                />

                <MetricCard
                  title="Satisfação"
                  value={`${analytics.ratings?.satisfaction || 0}%`}
                  icon={Award}
                  color="purple"
                  description="Avaliações 4+ estrelas"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Informações do Template
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">Nome</h4>
                      <p className="text-gray-600">{analytics.template.template_name}</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Criado em</h4>
                      <p className="text-gray-600">
                        {formatRelativeTime(analytics.template.created_at)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : analytics?.user_stats ? (
            // Analytics gerais do usuário
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                  title="Templates Criados"
                  value={analytics.user_stats.total_templates}
                  icon={FileText}
                  color="blue"
                  description="Total de templates"
                />

                <MetricCard
                  title="Templates Públicos"
                  value={analytics.user_stats.public_templates}
                  icon={Users}
                  color="green"
                  description="Disponíveis na biblioteca"
                />

                <MetricCard
                  title="Total de Usos"
                  value={analytics.user_stats.total_usage}
                  icon={Activity}
                  color="purple"
                  description="Soma de todas as visualizações"
                />

                <MetricCard
                  title="Avaliação Média"
                  value={analytics.user_stats.avg_rating.toFixed(1)}
                  icon={Star}
                  color="orange"
                  description={`${analytics.user_stats.total_ratings} avaliações`}
                />
              </div>

              {analytics.top_categories && analytics.top_categories.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart className="h-5 w-5" />
                      Principais Categorias
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analytics.top_categories.map((category: any, index: number) => (
                        <div key={category.category} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-medium">
                              {index + 1}
                            </div>
                            <span className="font-medium capitalize">{category.category}</span>
                          </div>
                          <Badge variant="secondary">
                            {category.count} template{category.count !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="trending" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Templates em Tendência</h2>
            <Select value={trendingPeriod} onValueChange={(value: any) => setTrendingPeriod(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Hoje</SelectItem>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4">
            {trending.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-8 w-8 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum template em tendência encontrado para este período</p>
                </CardContent>
              </Card>
            ) : (
              trending.map((template: any, index: number) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold">
                          #{index + 1}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{template.template_name}</h3>
                          <p className="text-gray-600 text-sm">{template.subject}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Eye className="h-4 w-4" />
                            {template.usage_count}
                          </div>
                          <p className="text-xs text-gray-500">visualizações</p>
                        </div>

                        <div className="text-center">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Copy className="h-4 w-4" />
                            {template.clone_count}
                          </div>
                          <p className="text-xs text-gray-500">clones</p>
                        </div>

                        <div className="text-center">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            {template.avg_rating}
                          </div>
                          <p className="text-xs text-gray-500">({template.rating_count})</p>
                        </div>

                        <Badge variant="outline" className="capitalize">
                          {template.category}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {templateId && (
          <TabsContent value="usage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Histórico de Uso (30 dias)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  Gráfico de uso será implementado com biblioteca de charts
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export default TemplateAnalytics