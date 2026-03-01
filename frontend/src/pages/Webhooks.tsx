import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Activity, CheckCircle, Clock, Code, Copy, Eye, Pause, Play, Plus, RefreshCw, Send, Trash2, Webhook, XCircle } from 'lucide-react'
import { webhookApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

const webhookSchema = z.object({
  webhook_url: z.string().url('URL invalida'),
  events: z.array(z.string()).min(1, 'Selecione pelo menos um evento'),
  secret: z.string().optional(),
})

type WebhookForm = z.infer<typeof webhookSchema>

interface WebhookConfig {
  id: number
  name: string
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

const webhookEvents = [
  { value: 'email.sent', label: 'Email enviado' },
  { value: 'email.delivered', label: 'Email entregue' },
  { value: 'email.bounced', label: 'Email bounce' },
  { value: 'email.opened', label: 'Email aberto' },
  { value: 'email.clicked', label: 'Link clicado' },
  { value: 'email.unsubscribed', label: 'Descadastro' },
  { value: 'email.spam_complaint', label: 'Spam complaint' },
]

const getStatusBadge = (status: WebhookLog['status']) => {
  switch (status) {
    case 'success':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Sucesso</Badge>
    case 'failed':
      return <Badge variant="destructive">Falha</Badge>
    case 'retry':
      return <Badge variant="outline">Retry</Badge>
    default:
      return <Badge variant="outline">Pendente</Badge>
  }
}

const getStatusIcon = (status: WebhookLog['status']) => {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'retry':
      return <RefreshCw className="h-4 w-4 text-amber-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-500" />
  }
}

export function Webhooks() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('webhooks')
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null)
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WebhookConfig | null>(null)
  const [logFilters, setLogFilters] = useState({ status: 'all', event_type: 'all' })

  const form = useForm<WebhookForm>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      webhook_url: '',
      events: [],
      secret: '',
    },
  })

  const { data: webhooksResponse, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: webhookApi.getWebhooks,
  })

  const webhookList: WebhookConfig[] = webhooksResponse?.data?.webhooks || []

  const { data: logsResponse } = useQuery({
    queryKey: ['webhook-logs', selectedWebhook?.id, logFilters],
    queryFn: () => webhookApi.getWebhookLogs(String(selectedWebhook?.id), logFilters),
    enabled: Boolean(selectedWebhook),
  })

  const logList: WebhookLog[] = logsResponse?.data?.logs || []

  const createMutation = useMutation({
    mutationFn: (data: WebhookForm) =>
      webhookApi.createWebhook({
        webhook_url: data.webhook_url,
        events: data.events,
        secret: data.secret,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      setIsCreating(false)
      form.reset()
      toast.success('Webhook criado')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar webhook')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WebhookForm> & { is_active?: boolean } }) =>
      webhookApi.updateWebhook(String(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      toast.success('Webhook atualizado')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar webhook')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => webhookApi.deleteWebhook(String(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      setSelectedWebhook(null)
      setDeleteTarget(null)
      toast.success('Webhook removido')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao remover webhook')
    },
  })

  const testMutation = useMutation({
    mutationFn: (id: number) => webhookApi.testWebhook(String(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] })
      toast.success('Webhook de teste enviado')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao testar webhook')
    },
  })

  const selectedEvents = form.watch('events') || []

  const docsPayload = useMemo(
    () => `{
  "event": "email.delivered",
  "timestamp": "2026-03-01T12:00:00Z",
  "data": {
    "email_id": "abc123",
    "to": "cliente@empresa.com",
    "subject": "Bem-vindo",
    "status": "delivered"
  }
}`,
    []
  )

  const handleSelectWebhook = (webhook: WebhookConfig) => {
    setSelectedWebhook(webhook)
    setIsCreating(false)
    form.reset({
      webhook_url: webhook.webhook_url,
      events: webhook.events,
      secret: webhook.secret || '',
    })
  }

  const handleNewWebhook = () => {
    setSelectedWebhook(null)
    setIsCreating(true)
    form.reset({
      webhook_url: '',
      events: [],
      secret: '',
    })
  }

  const handleSubmit = (data: WebhookForm) => {
    if (selectedWebhook && !isCreating) {
      updateMutation.mutate({ id: selectedWebhook.id, data })
      return
    }

    createMutation.mutate(data)
  }

  const handleToggleWebhook = (webhook: WebhookConfig) => {
    updateMutation.mutate({
      id: webhook.id,
      data: {
        webhook_url: webhook.webhook_url,
        events: webhook.events,
        secret: webhook.secret,
        is_active: !webhook.is_active,
      },
    })
  }

  const handleEventToggle = (eventValue: string) => {
    const currentEvents = form.getValues('events') || []
    form.setValue(
      'events',
      currentEvents.includes(eventValue)
        ? currentEvents.filter((event) => event !== eventValue)
        : [...currentEvents, eventValue]
    )
  }

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Copiado')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">Configure endpoints reais para receber eventos da plataforma.</p>
        </div>
        <Button onClick={handleNewWebhook}>
          <Plus className="mr-2 h-4 w-4" />
          Novo webhook
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="webhooks">
            <Webhook className="mr-2 h-4 w-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="mr-2 h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="docs">
            <Code className="mr-2 h-4 w-4" />
            Docs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Seus endpoints</CardTitle>
                <CardDescription>{webhookList.length} webhook(s) configurado(s)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-lg border p-3 animate-pulse">
                      <div className="mb-2 h-4 rounded bg-gray-200" />
                      <div className="h-3 w-24 rounded bg-gray-200" />
                    </div>
                  ))
                ) : webhookList.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Webhook className="mx-auto mb-3 h-10 w-10" />
                    Nenhum webhook configurado.
                  </div>
                ) : (
                  webhookList.map((webhook) => (
                    <div
                      key={webhook.id}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        selectedWebhook?.id === webhook.id ? 'border-primary bg-primary/5' : 'hover:border-gray-300'
                      }`}
                      onClick={() => handleSelectWebhook(webhook)}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{webhook.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{webhook.webhook_url}</div>
                        </div>
                        <Badge variant={webhook.is_active ? 'default' : 'outline'}>
                          {webhook.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {webhook.events.length} evento(s) • {webhook.delivery_success_rate.toFixed(1)}% sucesso
                      </div>
                      {webhook.last_delivery_at && (
                        <div className="text-xs text-muted-foreground">Ultima entrega {formatRelativeTime(webhook.last_delivery_at)}</div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>{isCreating ? 'Novo webhook' : selectedWebhook ? 'Editar webhook' : 'Selecione um webhook'}</CardTitle>
                    <CardDescription>
                      {isCreating || selectedWebhook
                        ? 'Defina a URL, os eventos e o segredo de assinatura.'
                        : 'Escolha um webhook existente ou crie um novo endpoint.'}
                    </CardDescription>
                  </div>
                  {selectedWebhook && !isCreating && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => testMutation.mutate(selectedWebhook.id)}>
                        <Send className="mr-2 h-4 w-4" />
                        Testar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleToggleWebhook(selectedWebhook)}>
                        {selectedWebhook.is_active ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                        {selectedWebhook.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(selectedWebhook)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedWebhook || isCreating ? (
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                    <div>
                      <Label htmlFor="webhook_url">URL do webhook</Label>
                      <Input id="webhook_url" placeholder="https://api.seusistema.com/webhooks" {...form.register('webhook_url')} />
                      {form.formState.errors.webhook_url && (
                        <p className="mt-1 text-sm text-destructive">{form.formState.errors.webhook_url.message}</p>
                      )}
                    </div>

                    <div>
                      <Label>Eventos</Label>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        {webhookEvents.map((event) => (
                          <button
                            key={event.value}
                            type="button"
                            className={`rounded-lg border p-3 text-left transition-colors ${
                              selectedEvents.includes(event.value) ? 'border-primary bg-primary/5' : 'hover:border-gray-300'
                            }`}
                            onClick={() => handleEventToggle(event.value)}
                          >
                            <div className="font-medium">{event.label}</div>
                            <div className="text-xs text-muted-foreground">{event.value}</div>
                          </button>
                        ))}
                      </div>
                      {form.formState.errors.events && (
                        <p className="mt-1 text-sm text-destructive">{form.formState.errors.events.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="secret">Secret</Label>
                      <Input id="secret" type="password" placeholder="Opcional. Usado para assinatura HMAC." {...form.register('secret')} />
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                        {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : isCreating ? 'Criar webhook' : 'Salvar alteracoes'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsCreating(false)
                          setSelectedWebhook(null)
                          form.reset()
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="py-14 text-center text-muted-foreground">
                    <Webhook className="mx-auto mb-4 h-12 w-12" />
                    Selecione um webhook para editar ou criar um novo endpoint.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <Label>Webhook</Label>
                <Select
                  value={selectedWebhook?.id ? String(selectedWebhook.id) : ''}
                  onValueChange={(value) => {
                    const webhook = webhookList.find((item) => String(item.id) === value) || null
                    setSelectedWebhook(webhook)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um webhook" />
                  </SelectTrigger>
                  <SelectContent>
                    {webhookList.map((webhook) => (
                      <SelectItem key={webhook.id} value={String(webhook.id)}>
                        {webhook.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:w-48">
                <Label>Status</Label>
                <Select value={logFilters.status} onValueChange={(value) => setLogFilters((current) => ({ ...current, status: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="failed">Falha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:w-56">
                <Label>Evento</Label>
                <Select value={logFilters.event_type} onValueChange={(value) => setLogFilters((current) => ({ ...current, event_type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {webhookEvents.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Historico de entrega</CardTitle>
                  <CardDescription>Execucoes reais dos webhooks configurados.</CardDescription>
                </div>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['webhook-logs'] })}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedWebhook ? (
                <div className="py-10 text-center text-muted-foreground">Selecione um webhook para ver os logs.</div>
              ) : logList.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">Nenhum log encontrado para os filtros atuais.</div>
              ) : (
                logList.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    className="w-full rounded-lg border p-4 text-left transition-colors hover:border-gray-300"
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(log.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{log.event_type}</span>
                            {getStatusBadge(log.status)}
                            {log.http_status && <Badge variant="outline">{log.http_status}</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatRelativeTime(log.created_at)} • {log.attempts} tentativa(s)
                            {log.response_time_ms ? ` • ${log.response_time_ms}ms` : ''}
                          </div>
                        </div>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {log.error_message && (
                      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{log.error_message}</div>
                    )}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Boas praticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Use HTTPS e responda com status 2xx quando o evento for processado.</p>
              <p>Valide a assinatura do header `X-Webhook-Signature` usando seu secret.</p>
              <p>Implemente idempotencia para suportar retries sem duplicar efeitos colaterais.</p>
              <p>Monitore falhas de entrega para revisar endpoints degradados.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payload exemplo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="overflow-x-auto rounded bg-gray-50 p-4 text-xs">{docsPayload}</pre>
                <Button variant="outline" size="sm" className="absolute right-2 top-2" onClick={() => copyToClipboard(docsPayload)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Remover webhook"
        description={deleteTarget ? `Remover o endpoint ${deleteTarget.name}? Esta acao nao pode ser desfeita.` : ''}
        variant="danger"
      />

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do log</DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Evento</Label>
                  <div className="text-sm">{selectedLog.event_type}</div>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedLog.status)}
                    <span className="text-sm">{selectedLog.status}</span>
                  </div>
                </div>
                <div>
                  <Label>HTTP status</Label>
                  <div className="text-sm">{selectedLog.http_status || 'N/A'}</div>
                </div>
                <div>
                  <Label>Tempo de resposta</Label>
                  <div className="text-sm">{selectedLog.response_time_ms ? `${selectedLog.response_time_ms}ms` : 'N/A'}</div>
                </div>
              </div>

              <div>
                <Label>Request body</Label>
                <Textarea readOnly value={selectedLog.request_body} className="mt-1 h-40 font-mono text-xs" />
              </div>

              {selectedLog.response_body && (
                <div>
                  <Label>Response body</Label>
                  <Textarea readOnly value={selectedLog.response_body} className="mt-1 h-40 font-mono text-xs" />
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <Label>Erro</Label>
                  <div className="mt-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{selectedLog.error_message}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
