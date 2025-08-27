import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { webhookApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import {
  Webhook, Plus, Activity, Play, Pause, Trash2,
  CheckCircle, XCircle, Clock, Copy, Eye,
  Send, RefreshCw, Code
} from 'lucide-react'
import toast from 'react-hot-toast'

const createWebhookSchema = z.object({
  webhook_url: z.string().url('URL inválida'),
  events: z.array(z.string()).min(1, 'Selecione pelo menos um evento'),
  secret: z.string().min(8, 'Secret deve ter pelo menos 8 caracteres').optional(),
})

type CreateWebhookForm = z.infer<typeof createWebhookSchema>

interface WebhookConfig {
  id: number
  webhook_url: string
  events: string[]
  secret?: string
  is_active: boolean
  created_at: string
  updated_at: string
  last_delivery_at?: string
  delivery_success_rate: number
}

interface WebhookLog {
  id: number
  webhook_id: number
  event_type: string
  status: 'success' | 'failed' | 'pending' | 'retry'
  http_status?: number
  request_body: string
  response_body?: string
  response_time_ms?: number
  attempts: number
  next_retry_at?: string
  created_at: string
  error_message?: string
}

const WEBHOOK_EVENTS = [
  { value: 'email.sent', label: 'Email Enviado', description: 'Disparado quando um email é enviado' },
  { value: 'email.delivered', label: 'Email Entregue', description: 'Disparado quando um email é entregue' },
  { value: 'email.bounced', label: 'Email Bounced', description: 'Disparado quando um email falha na entrega' },
  { value: 'email.opened', label: 'Email Aberto', description: 'Disparado quando um email é aberto' },
  { value: 'email.clicked', label: 'Link Clicado', description: 'Disparado quando um link é clicado' },
  { value: 'email.unsubscribed', label: 'Descadastrado', description: 'Disparado quando alguém se descadastra' },
  { value: 'email.spam_complaint', label: 'Reclamação Spam', description: 'Disparado em reclamações de spam' },
]

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'retry':
      return <RefreshCw className="h-4 w-4 text-yellow-500" />
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-gray-500" />
  }
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Sucesso</Badge>
    case 'failed':
      return <Badge variant="destructive">Falha</Badge>
    case 'retry':
      return <Badge variant="outline" className="border-yellow-300 text-yellow-700">Retry</Badge>
    case 'pending':
    default:
      return <Badge variant="outline">Pendente</Badge>
  }
}

export function Webhooks() {
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [activeTab, setActiveTab] = useState('webhooks')
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)
  const [logFilters, setLogFilters] = useState({
    status: 'all',
    event_type: 'all',
  })
  const queryClient = useQueryClient()

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<CreateWebhookForm>({
    resolver: zodResolver(createWebhookSchema),
    defaultValues: {
      webhook_url: '',
      events: [],
      secret: '',
    },
  })

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => webhookApi.getWebhooks(),
  })

  const { data: logs } = useQuery({
    queryKey: ['webhook-logs', selectedWebhook?.id, logFilters],
    queryFn: () => webhookApi.getWebhookLogs(selectedWebhook!.id.toString(), logFilters),
    enabled: !!selectedWebhook,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateWebhookForm) => {
      const webhookData = {
        webhook_url: data.webhook_url,
        events: data.events,
        ...(data.secret && { secret: data.secret })
      }
      return webhookApi.createWebhook(webhookData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      setIsCreating(false)
      reset()
      toast.success('Webhook criado com sucesso!')
    },
    onError: () => toast.error('Erro ao criar webhook'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWebhookForm> }) => 
      webhookApi.updateWebhook(id.toString(), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      toast.success('Webhook atualizado com sucesso!')
    },
    onError: () => toast.error('Erro ao atualizar webhook'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => webhookApi.deleteWebhook(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      setSelectedWebhook(null)
      toast.success('Webhook deletado com sucesso!')
    },
    onError: () => toast.error('Erro ao deletar webhook'),
  })

  const testMutation = useMutation({
    mutationFn: (id: number) => webhookApi.testWebhook(id.toString()),
    onSuccess: () => {
      toast.success('Teste de webhook enviado!')
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] })
    },
    onError: () => toast.error('Erro ao testar webhook'),
  })

  const webhookList = webhooks?.data?.webhooks || []
  const logList = logs?.data?.logs || []

  const onSubmit = (data: CreateWebhookForm) => {
    if (selectedWebhook) {
      updateMutation.mutate({ id: selectedWebhook.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleWebhookSelect = (webhook: WebhookConfig) => {
    setSelectedWebhook(webhook)
    setIsCreating(false)
    setValue('webhook_url', webhook.webhook_url)
    setValue('events', webhook.events)
    setValue('secret', webhook.secret || '')
  }

  const handleNewWebhook = () => {
    setIsCreating(true)
    setSelectedWebhook(null)
    reset()
  }

  const handleDeleteWebhook = (webhook: WebhookConfig) => {
    if (confirm(`Tem certeza que deseja deletar este webhook?`)) {
      deleteMutation.mutate(webhook.id)
    }
  }

  const handleToggleWebhook = (webhook: WebhookConfig) => {
    updateMutation.mutate({
      id: webhook.id,
      data: { webhook_url: webhook.webhook_url, events: webhook.events, secret: webhook.secret }
    })
  }

  const handleTestWebhook = (webhook: WebhookConfig) => {
    testMutation.mutate(webhook.id)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a área de transferência!')
  }

  const handleEventToggle = (eventValue: string) => {
    const currentEvents = watch('events') || []
    if (currentEvents.includes(eventValue)) {
      setValue('events', currentEvents.filter(e => e !== eventValue))
    } else {
      setValue('events', [...currentEvents, eventValue])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">
            Configure endpoints para receber notificações em tempo real
          </p>
        </div>
        <Button onClick={handleNewWebhook}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Webhook
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="docs">
            <Code className="h-4 w-4 mr-2" />
            Documentação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Webhook List */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Seus Webhooks</CardTitle>
                  <CardDescription>
                    {webhookList.length} webhook{webhookList.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="p-3 border rounded animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : isCreating ? (
                    <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
                      <div className="text-center">
                        <Webhook className="h-8 w-8 text-primary mx-auto mb-2" />
                        <div className="font-medium text-primary">Criando Webhook</div>
                        <div className="text-sm text-muted-foreground">Configure no painel ao lado</div>
                      </div>
                    </div>
                  ) : webhookList.length === 0 ? (
                    <div className="text-center py-6">
                      <Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground mb-4">Nenhum webhook configurado</p>
                      <Button variant="outline" onClick={handleNewWebhook}>
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Primeiro Webhook
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {webhookList.map((webhook: WebhookConfig) => (
                        <div
                          key={webhook.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedWebhook?.id === webhook.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-gray-300'
                          }`}
                          onClick={() => handleWebhookSelect(webhook)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="font-medium truncate text-sm">
                                  {new URL(webhook.webhook_url).hostname}
                                </span>
                                <Badge 
                                  variant={webhook.is_active ? 'default' : 'outline'}
                                  className="text-xs"
                                >
                                  {webhook.is_active ? 'Ativo' : 'Inativo'}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {webhook.events.length} evento{webhook.events.length !== 1 ? 's' : ''}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {webhook.delivery_success_rate.toFixed(1)}% sucesso
                              </div>
                            </div>
                            
                            <div className="flex flex-col space-y-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTestWebhook(webhook)
                                }}
                                disabled={testMutation.isPending}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleWebhook(webhook)
                                }}
                              >
                                {webhook.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Webhook Configuration */}
            <div className="lg:col-span-2">
              {selectedWebhook || isCreating ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>
                          {isCreating ? 'Novo Webhook' : 'Configurar Webhook'}
                        </CardTitle>
                        <CardDescription>
                          {isCreating ? 'Configure seu novo webhook' : 'Edite as configurações do webhook'}
                        </CardDescription>
                      </div>
                      
                      {selectedWebhook && (
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestWebhook(selectedWebhook)}
                            disabled={testMutation.isPending}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {testMutation.isPending ? 'Testando...' : 'Testar'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteWebhook(selectedWebhook)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                      <div>
                        <Label htmlFor="webhook_url">URL do Webhook</Label>
                        <Input
                          id="webhook_url"
                          placeholder="https://sua-api.com/webhooks"
                          {...register('webhook_url')}
                        />
                        {errors.webhook_url && (
                          <p className="text-sm text-destructive mt-1">{errors.webhook_url.message}</p>
                        )}
                      </div>

                      <div>
                        <Label>Eventos</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                          {WEBHOOK_EVENTS.map((event) => (
                            <div
                              key={event.value}
                              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                watch('events')?.includes(event.value)
                                  ? 'border-primary bg-primary/5'
                                  : 'hover:border-gray-300'
                              }`}
                              onClick={() => handleEventToggle(event.value)}
                            >
                              <div className="flex items-center space-x-2">
                                <div className={`w-4 h-4 border rounded ${
                                  watch('events')?.includes(event.value) 
                                    ? 'bg-primary border-primary' 
                                    : 'border-gray-300'
                                }`}>
                                  {watch('events')?.includes(event.value) && (
                                    <CheckCircle className="h-4 w-4 text-white" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{event.label}</div>
                                  <div className="text-xs text-muted-foreground">{event.description}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {errors.events && (
                          <p className="text-sm text-destructive mt-1">{errors.events.message}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="secret">Secret (Opcional)</Label>
                        <Input
                          id="secret"
                          type="password"
                          placeholder="Secret para verificação da assinatura"
                          {...register('secret')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Usado para verificar a autenticidade dos webhooks via HMAC SHA-256
                        </p>
                        {errors.secret && (
                          <p className="text-sm text-destructive mt-1">{errors.secret.message}</p>
                        )}
                      </div>

                      <div className="flex space-x-2">
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                          {createMutation.isPending || updateMutation.isPending
                            ? 'Salvando...'
                            : isCreating
                            ? 'Criar Webhook'
                            : 'Salvar Alterações'
                          }
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsCreating(false)
                            setSelectedWebhook(null)
                            reset()
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <div className="h-96 flex items-center justify-center">
                  <div className="text-center">
                    <Webhook className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">Selecione um webhook</h3>
                    <p className="text-muted-foreground mb-4">
                      Escolha um webhook para configurar ou crie um novo
                    </p>
                    <Button onClick={handleNewWebhook}>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Webhook
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <div className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filtros de Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <Label>Webhook</Label>
                    <Select
                      value={selectedWebhook?.id.toString() || ''}
                      onValueChange={(value) => {
                        const webhook = webhookList.find((w: WebhookConfig) => w.id.toString() === value)
                        setSelectedWebhook(webhook || null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um webhook" />
                      </SelectTrigger>
                      <SelectContent>
                        {webhookList.map((webhook: WebhookConfig) => (
                          <SelectItem key={webhook.id} value={webhook.id.toString()}>
                            {new URL(webhook.webhook_url).hostname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Select
                      value={logFilters.status}
                      onValueChange={(value) => setLogFilters(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="success">Sucesso</SelectItem>
                        <SelectItem value="failed">Falha</SelectItem>
                        <SelectItem value="retry">Retry</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Evento</Label>
                    <Select
                      value={logFilters.event_type}
                      onValueChange={(value) => setLogFilters(prev => ({ ...prev, event_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {WEBHOOK_EVENTS.map((event) => (
                          <SelectItem key={event.value} value={event.value}>
                            {event.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logs */}
            {selectedWebhook ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Logs de Delivery</CardTitle>
                      <CardDescription>
                        Histórico de entregas do webhook {new URL(selectedWebhook.webhook_url).hostname}
                      </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['webhook-logs'] })}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {logList.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Activity className="h-8 w-8 mx-auto mb-2" />
                        <p>Nenhum log encontrado</p>
                      </div>
                    ) : (
                      logList.map((log: WebhookLog) => (
                        <div
                          key={log.id}
                          className="p-4 border rounded-lg cursor-pointer hover:border-gray-300"
                          onClick={() => setSelectedLog(log)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              {getStatusIcon(log.status)}
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{log.event_type}</span>
                                  {getStatusBadge(log.status)}
                                  {log.http_status && (
                                    <Badge variant="outline" className="text-xs">
                                      {log.http_status}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {formatRelativeTime(log.created_at)} • {log.attempts} tentativa{log.attempts !== 1 ? 's' : ''}
                                  {log.response_time_ms && ` • ${log.response_time_ms}ms`}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              {log.next_retry_at && (
                                <Badge variant="outline" className="text-xs">
                                  Retry {formatRelativeTime(log.next_retry_at)}
                                </Badge>
                              )}
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {log.error_message && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                              {log.error_message}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-12">
                <Webhook className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-medium mb-2">Selecione um webhook</h3>
                <p className="text-muted-foreground">
                  Escolha um webhook para ver os logs de delivery
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Como funciona</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">1. Configure seu endpoint</h4>
                  <p className="text-sm text-muted-foreground">
                    Adicione a URL do seu servidor que receberá as notificações webhook.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">2. Selecione os eventos</h4>
                  <p className="text-sm text-muted-foreground">
                    Escolha quais eventos você deseja receber: envios, entregas, aberturas, etc.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">3. Configure segurança</h4>
                  <p className="text-sm text-muted-foreground">
                    Use um secret para verificar a autenticidade das requisições via HMAC.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">4. Teste e monitore</h4>
                  <p className="text-sm text-muted-foreground">
                    Use nossos logs para monitorar entregas e diagnosticar problemas.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Exemplo de Payload</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto">
{`{
  "event": "email.delivered",
  "timestamp": "2023-12-07T10:30:00Z",
  "data": {
    "email_id": "abc123",
    "to": "usuario@exemplo.com",
    "subject": "Bem-vindo!",
    "status": "delivered",
    "delivery_time_ms": 1250
  }
}`}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(`{
  "event": "email.delivered",
  "timestamp": "2023-12-07T10:30:00Z",
  "data": {
    "email_id": "abc123",
    "to": "usuario@exemplo.com",
    "subject": "Bem-vindo!",
    "status": "delivered",
    "delivery_time_ms": 1250
  }
}`)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Verificação de Assinatura</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Verifique a autenticidade dos webhooks usando o header <code>X-Webhook-Signature</code>:
                  </p>
                  
                  <div className="relative">
                    <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto">
{`const crypto = require('crypto');

const verifySignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
};`}
                    </pre>
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(`const crypto = require('crypto');

const verifySignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
};`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Retries e Timeouts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Política de Retry</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Timeout: 30 segundos por tentativa</li>
                      <li>• Máximo: 5 tentativas</li>
                      <li>• Intervalo: Exponential backoff (1min, 5min, 25min, 125min)</li>
                      <li>• Códigos HTTP 2xx = sucesso</li>
                      <li>• Códigos HTTP 4xx = falha permanente</li>
                      <li>• Códigos HTTP 5xx = retry</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Endpoint Requirements</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Deve responder com HTTP 200-299</li>
                      <li>• Deve responder em menos de 30s</li>
                      <li>• Deve aceitar POST com JSON</li>
                      <li>• HTTPS recomendado</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Detalhes do Log</h3>
              <Button variant="ghost" onClick={() => setSelectedLog(null)}>
                ×
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Evento</Label>
                  <p className="text-sm">{selectedLog.event_type}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedLog.status)}
                    <span className="text-sm">{selectedLog.status}</span>
                  </div>
                </div>
                <div>
                  <Label>HTTP Status</Label>
                  <p className="text-sm">{selectedLog.http_status || 'N/A'}</p>
                </div>
                <div>
                  <Label>Tempo de Resposta</Label>
                  <p className="text-sm">{selectedLog.response_time_ms ? `${selectedLog.response_time_ms}ms` : 'N/A'}</p>
                </div>
              </div>

              <div>
                <Label>Request Body</Label>
                <Textarea
                  value={selectedLog.request_body}
                  readOnly
                  className="font-mono text-xs h-32"
                />
              </div>

              {selectedLog.response_body && (
                <div>
                  <Label>Response Body</Label>
                  <Textarea
                    value={selectedLog.response_body}
                    readOnly
                    className="font-mono text-xs h-32"
                  />
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <Label>Error Message</Label>
                  <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}