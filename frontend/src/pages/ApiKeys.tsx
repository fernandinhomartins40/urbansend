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
import { apiKeyApi } from '@/lib/api'
import { formatRelativeTime, copyToClipboard } from '@/lib/utils'
import { Key, Plus, Copy, Eye, EyeOff, Trash2, RotateCcw, Settings, AlertTriangle, MoreVertical } from 'lucide-react'
import toast from 'react-hot-toast'

const createApiKeySchema = z.object({
  key_name: z.string().min(1, 'Nome é obrigatório').max(100),
  permissions: z.array(z.string()).min(1, 'Selecione pelo menos uma permissão'),
})

type CreateApiKeyForm = z.infer<typeof createApiKeySchema>

interface ApiKey {
  id: number
  key_name: string
  permissions: string[]
  created_at: string
  last_used_at: string | null
  is_active: boolean
  api_key_preview: string
}

const availablePermissions = [
  { id: 'email:send', label: 'Enviar emails', description: 'Permite enviar emails individuais e em lote' },
  { id: 'email:read', label: 'Ler emails', description: 'Permite visualizar histórico e detalhes dos emails' },
  { id: 'template:read', label: 'Ler templates', description: 'Permite visualizar templates de email' },
  { id: 'template:write', label: 'Gerenciar templates', description: 'Permite criar, editar e deletar templates' },
  { id: 'domain:read', label: 'Ler domínios', description: 'Permite visualizar domínios configurados' },
  { id: 'analytics:read', label: 'Ler analytics', description: 'Permite acessar métricas e relatórios' },
  { id: 'webhook:read', label: 'Ler webhooks', description: 'Permite visualizar webhooks configurados' },
  { id: 'webhook:write', label: 'Gerenciar webhooks', description: 'Permite criar, editar e deletar webhooks' },
]

export function ApiKeys() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set())
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<CreateApiKeyForm>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      key_name: '',
      permissions: [],
    },
  })

  const selectedPermissions = watch('permissions') || []

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => apiKeyApi.getApiKeys(),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateApiKeyForm) => {
      // Ensure required fields are present
      if (!data.key_name || !data.permissions || data.permissions.length === 0) {
        throw new Error('Nome e permissões são obrigatórios')
      }
      return apiKeyApi.createApiKey({
        key_name: data.key_name,
        permissions: data.permissions
      })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      setNewlyCreatedKey(response.data.key)
      setShowCreateDialog(false)
      reset()
      toast.success('API Key criada com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao criar API Key')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiKeyApi.deleteApiKey(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      toast.success('API Key deletada com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao deletar API Key')
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: (id: number) => apiKeyApi.regenerateApiKey(id.toString()),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      setNewlyCreatedKey(response.data.key)
      toast.success('API Key regenerada com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao regenerar API Key')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiKeyApi.toggleApiKey(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      toast.success('Status da API Key atualizado!')
    },
    onError: () => {
      toast.error('Erro ao atualizar status da API Key')
    },
  })

  const onSubmit = (data: CreateApiKeyForm) => {
    createMutation.mutate(data)
  }

  const handlePermissionToggle = (permission: string) => {
    const current = selectedPermissions || []
    const updated = current.includes(permission)
      ? current.filter(p => p !== permission)
      : [...current, permission]
    setValue('permissions', updated)
  }

  const toggleKeyVisibility = (keyId: number) => {
    const newVisibleKeys = new Set(visibleKeys)
    if (newVisibleKeys.has(keyId)) {
      newVisibleKeys.delete(keyId)
    } else {
      newVisibleKeys.add(keyId)
    }
    setVisibleKeys(newVisibleKeys)
  }

  const handleCopyKey = async (key: string) => {
    try {
      await copyToClipboard(key)
      toast.success('API Key copiada para a área de transferência!')
    } catch {
      toast.error('Erro ao copiar API Key')
    }
  }

  const handleDeleteKey = (id: number, name: string) => {
    if (confirm(`Tem certeza que deseja deletar a API Key "${name}"? Esta ação não pode ser desfeita.`)) {
      deleteMutation.mutate(id)
    }
  }

  const handleRegenerateKey = (id: number, name: string) => {
    if (confirm(`Tem certeza que deseja regenerar a API Key "${name}"? A chave atual será invalidada.`)) {
      regenerateMutation.mutate(id)
    }
  }

  const handleToggleKey = (id: number) => {
    toggleMutation.mutate(id)
  }

  const keys = apiKeys?.data?.api_keys || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Gerencie suas chaves de API para integração com aplicações externas
          </p>
        </div>
        
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova API Key
        </Button>
      </div>

      {/* Warning Card */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="flex items-start space-x-3 pt-6">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">Importante sobre API Keys</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Por motivos de segurança, as API Keys são mostradas apenas uma vez durante a criação. 
              Certifique-se de copiar e armazenar suas chaves em um local seguro.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Newly Created Key Alert */}
      {newlyCreatedKey && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-green-800 mb-2">Nova API Key criada com sucesso!</h3>
                <p className="text-sm text-green-700 mb-3">
                  Copie esta chave agora. Ela não será mostrada novamente por motivos de segurança.
                </p>
                <div className="flex items-center space-x-2 bg-white p-3 rounded border">
                  <code className="flex-1 text-sm font-mono">{newlyCreatedKey}</code>
                  <Button
                    size="sm"
                    onClick={() => handleCopyKey(newlyCreatedKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewlyCreatedKey(null)}
              >
                ✕
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create API Key Dialog */}
      {showCreateDialog && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Criar nova API Key</CardTitle>
            <CardDescription>
              Configure as permissões e o nome para sua nova API Key
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key_name">Nome da API Key</Label>
                <Input
                  id="key_name"
                  placeholder="Ex: Aplicação de produção"
                  {...register('key_name')}
                />
                {errors.key_name && (
                  <p className="text-sm text-destructive">{errors.key_name.message}</p>
                )}
              </div>

              <div className="space-y-3">
                <Label>Permissões</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availablePermissions.map((permission) => (
                    <div
                      key={permission.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        selectedPermissions.includes(permission.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handlePermissionToggle(permission.id)}
                    >
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.includes(permission.id)}
                          onChange={() => handlePermissionToggle(permission.id)}
                          className="mt-1"
                        />
                        <div>
                          <div className="font-medium text-sm">{permission.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {permission.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {errors.permissions && (
                  <p className="text-sm text-destructive">{errors.permissions.message}</p>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false)
                    reset()
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Criando...' : 'Criar API Key'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      <div className="space-y-4">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma API Key encontrada</h3>
                <p className="text-muted-foreground mb-4">
                  Crie sua primeira API Key para começar a integrar com aplicações externas.
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar primeira API Key
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          keys.map((apiKey: ApiKey) => (
            <Card key={apiKey.id} className={!apiKey.is_active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Key className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">{apiKey.key_name}</CardTitle>
                      <CardDescription>
                        Criada {formatRelativeTime(apiKey.created_at)}
                        {apiKey.last_used_at && (
                          <> • Último uso {formatRelativeTime(apiKey.last_used_at)}</>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Badge variant={apiKey.is_active ? 'success' : 'secondary'}>
                      {apiKey.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate(apiKey.id)}
                      disabled={toggleMutation.isPending}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRegenerateKey(apiKey.id, apiKey.key_name)}
                      disabled={regenerateMutation.isPending}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="sm"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      
                      <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                        <div className="p-2 space-y-1">
                          <button
                            onClick={() => handleToggleKey(apiKey.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                            disabled={toggleMutation.isPending}
                          >
                            <Settings className="h-4 w-4" />
                            {apiKey.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                          
                          <button
                            onClick={() => handleRegenerateKey(apiKey.id, apiKey.key_name)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                            disabled={regenerateMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Regenerar
                          </button>
                          
                          <button
                            onClick={() => handleDeleteKey(apiKey.id, apiKey.key_name)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2 text-red-600"
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            Deletar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* API Key Display */}
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="flex items-center space-x-2 bg-gray-50 p-3 rounded border">
                    <code className="flex-1 text-sm font-mono">
                      {visibleKeys.has(apiKey.id) 
                        ? apiKey.api_key_preview.replace(/\*/g, 'x') // Show actual key if available
                        : apiKey.api_key_preview
                      }
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleKeyVisibility(apiKey.id)}
                    >
                      {visibleKeys.has(apiKey.id) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyKey(apiKey.api_key_preview)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Permissions */}
                <div className="space-y-2">
                  <Label>Permissões</Label>
                  <div className="flex flex-wrap gap-2">
                    {apiKey.permissions.map((permission) => {
                      const permissionInfo = availablePermissions.find(p => p.id === permission)
                      return (
                        <Badge key={permission} variant="outline">
                          {permissionInfo?.label || permission}
                        </Badge>
                      )
                    })}
                  </div>
                </div>

                {/* Usage Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-gray-50 rounded">
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="font-medium">
                      {apiKey.is_active ? 'Ativa' : 'Inativa'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Criada</div>
                    <div className="font-medium">
                      {formatRelativeTime(apiKey.created_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Último uso</div>
                    <div className="font-medium">
                      {apiKey.last_used_at ? formatRelativeTime(apiKey.last_used_at) : 'Nunca'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Permissões</div>
                    <div className="font-medium">{apiKey.permissions.length}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}