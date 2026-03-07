import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, BookOpen, Copy, Download, ExternalLink, KeyRound, ServerCog, Sparkles, Wand2, Workflow } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { aiApi } from '@/lib/api'
import { apiPermissionCatalog } from '@/lib/developerPortal'
import { copyToClipboard, formatRelativeTime } from '@/lib/utils'
import { CodeSnippetCard } from '@/components/developer/CodeSnippetCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AiDescriptor {
  name?: string
  uri?: string
  title: string
  description: string
  required_permissions?: string[]
}

interface AgentKey {
  id: number
  key_name: string
  description: string | null
  key_type: 'standard' | 'ai_agent'
  permissions: string[]
  created_at: string
  last_used_at: string | null
  is_active: boolean
  api_key_preview: string
}

interface OnboardingPayload {
  mcp_endpoint: string
  docs_url: string
  workspace_scope?: {
    organization_id: number | null
    organization_name: string | null
  }
  quickstart_markdown: string
  prompt_template: string
  cursor_mcp_json: string
  vscode_mcp_json: string
  cursor_mcp_json_with_key: string | null
  vscode_mcp_json_with_key: string | null
  recommended_permissions: string[]
  tools: AiDescriptor[]
  resources: AiDescriptor[]
  prompts: AiDescriptor[]
}

interface AiOverviewResponse {
  overview: OnboardingPayload
  account_summary: {
    accountName: string
    accountEmail: string
    organizationName?: string | null
    domainsTotal: number
    domainsVerified: number
    webhooksTotal: number
    aiAgentKeysTotal: number
  }
  agent_keys: AgentKey[]
}

const downloadTextFile = (filename: string, content: string) => {
  const contentType = filename.endsWith('.json')
    ? 'application/json;charset=utf-8'
    : 'text/plain;charset=utf-8'
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function AiIntegration() {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [keyName, setKeyName] = useState('UltraZend AI Agent')
  const [description, setDescription] = useState('Chave dedicada para agentes em Cursor, VS Code e IDEs com IA.')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [latestKey, setLatestKey] = useState<string | null>(null)
  const [latestBundle, setLatestBundle] = useState<OnboardingPayload | null>(null)

  const overviewQuery = useQuery({
    queryKey: ['ai-overview'],
    queryFn: async () => {
      const response = await aiApi.getOverview()
      return response.data as AiOverviewResponse
    }
  })

  useEffect(() => {
    const recommended = overviewQuery.data?.overview?.recommended_permissions || []
    if (recommended.length > 0 && selectedPermissions.length === 0) {
      setSelectedPermissions(recommended)
    }
  }, [overviewQuery.data, selectedPermissions.length])

  const createMutation = useMutation({
    mutationFn: (payload: { key_name: string; description?: string; permissions?: string[] }) =>
      aiApi.createAgentKey(payload),
    onSuccess: (response) => {
      const data = response.data as {
        key: string
        onboarding: OnboardingPayload
      }

      setLatestKey(data.key)
      setLatestBundle(data.onboarding)
      setIsDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['ai-overview'] })
      toast.success('AI Agent Key criada com sucesso')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao criar AI Agent Key')
    }
  })

  const onboarding = latestBundle || overviewQuery.data?.overview || null
  const agentKeys = overviewQuery.data?.agent_keys || []
  const accountSummary = overviewQuery.data?.account_summary

  const visiblePermissionCatalog = useMemo(
    () => apiPermissionCatalog.filter((permission) => onboarding?.recommended_permissions.includes(permission.id)),
    [onboarding]
  )

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions((current) =>
      current.includes(permissionId)
        ? current.filter((item) => item !== permissionId)
        : [...current, permissionId]
    )
  }

  const handleCreateAgentKey = () => {
    if (!keyName.trim()) {
      toast.error('Informe um nome para a AI Agent Key')
      return
    }

    if (selectedPermissions.length === 0) {
      toast.error('Selecione pelo menos uma permissao')
      return
    }

    createMutation.mutate({
      key_name: keyName.trim(),
      description: description.trim() || undefined,
      permissions: selectedPermissions
    })
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-cyan-100 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.16),_transparent_42%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_38%),linear-gradient(135deg,#ecfeff,_#f8fafc_52%,#fef3c7)] p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="bg-cyan-600 text-white hover:bg-cyan-600">Integracao com IA</Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Conecte Cursor e VS Code direto na UltraZend</h1>
              <p className="text-sm leading-6 text-slate-600">
                Gere uma AI Agent Key dedicada, entregue um `mcp.json` pronto para a IDE e use um prompt padrao para
                o agente consultar docs, validar dominio, configurar webhooks, ajustar settings e executar o primeiro envio.
              </p>
              {onboarding?.workspace_scope?.organization_id ? (
                <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-900">
                  Workspace alvo: {onboarding.workspace_scope.organization_name || 'Workspace ativo'} #{onboarding.workspace_scope.organization_id}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/app/developers">
                <BookOpen className="mr-2 h-4 w-4" />
                Developers
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={onboarding?.docs_url || '/api-docs'} target="_blank" rel="noreferrer">
                OpenAPI
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Nova AI Agent Key
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Card className="border-white/70 bg-white/80 shadow-sm backdrop-blur">
            <CardContent className="p-5">
              <div className="text-sm text-slate-500">AI Agent Keys</div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{accountSummary?.aiAgentKeysTotal || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80 shadow-sm backdrop-blur">
            <CardContent className="p-5">
              <div className="text-sm text-slate-500">Dominios verificados</div>
              <div className="mt-2 text-3xl font-bold text-emerald-700">{accountSummary?.domainsVerified || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80 shadow-sm backdrop-blur">
            <CardContent className="p-5">
              <div className="text-sm text-slate-500">Webhooks ativos</div>
              <div className="mt-2 text-3xl font-bold text-sky-700">{accountSummary?.webhooksTotal || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80 shadow-sm backdrop-blur">
            <CardContent className="p-5">
              <div className="text-sm text-slate-500">Endpoint MCP</div>
              <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                {onboarding?.mcp_endpoint || 'Carregando...'}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Fluxo recomendado</CardTitle>
            <CardDescription>O caminho mais curto para deixar uma integracao pronta em uma IDE com IA.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <KeyRound className="h-4 w-4 text-cyan-600" />
                1. Gere a chave
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Crie uma AI Agent Key dedicada para onboarding tecnico. Ela deve ser separada da chave usada pela aplicacao.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ServerCog className="h-4 w-4 text-sky-600" />
                2. Conecte o MCP
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Salve o `mcp.json` no Cursor ou no VS Code e conecte a IDE direto ao servidor MCP remoto da UltraZend.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Wand2 className="h-4 w-4 text-amber-600" />
                3. Cole o prompt
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use o prompt padrao para o agente ler docs, validar DNS, criar webhooks e testar o primeiro envio.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Capacidades expostas</CardTitle>
            <CardDescription>O que o agente enxerga no MCP da UltraZend hoje.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Bot className="h-4 w-4 text-cyan-700" />
                  {onboarding?.tools.length || 0} tools
                </div>
                <p className="mt-2 text-sm text-slate-600">Acoes para dominio, settings, webhooks, envio de teste e criacao de chave.</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Workflow className="h-4 w-4 text-amber-700" />
                  {onboarding?.prompts.length || 0} prompts
                </div>
                <p className="mt-2 text-sm text-slate-600">Prompts padrao para onboarding tecnico, dominio e webhooks.</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <BookOpen className="h-4 w-4 text-sky-700" />
                  {onboarding?.resources.length || 0} resources
                </div>
                <p className="mt-2 text-sm text-slate-600">Quickstart, docs de DNS, webhooks, MCP e resumo real da conta.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <CardDescription>Acoes reais que o agente pode executar na conta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(onboarding?.tools || []).map((tool) => (
              <div key={tool.name} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-medium text-slate-900">{tool.title}</div>
                <div className="mt-1 text-xs font-mono text-slate-500">{tool.name}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{tool.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <CardDescription>Documentacao e contexto vivo expostos ao agente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(onboarding?.resources || []).map((resource) => (
              <div key={resource.uri} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-medium text-slate-900">{resource.title}</div>
                <div className="mt-1 text-xs font-mono text-slate-500">{resource.uri}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{resource.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Prompts</CardTitle>
            <CardDescription>Entradas guiadas para onboarding tecnico rapido.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(onboarding?.prompts || []).map((prompt) => (
              <div key={prompt.name} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-medium text-slate-900">{prompt.title}</div>
                <div className="mt-1 text-xs font-mono text-slate-500">{prompt.name}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{prompt.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {latestKey ? (
        <Card className="border-emerald-200 bg-emerald-50/70 shadow-sm">
          <CardHeader>
            <CardTitle>AI Agent Key gerada agora</CardTitle>
            <CardDescription>Copie a chave agora. Ela nao sera exibida novamente depois que voce sair desta pagina.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-2xl bg-slate-950 p-4 font-mono text-sm text-slate-100">
              {latestKey}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => copyToClipboard(latestKey).then(() => toast.success('AI Agent Key copiada'))}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar chave
              </Button>
              {latestBundle?.cursor_mcp_json_with_key ? (
                <Button
                  variant="outline"
                  onClick={() => downloadTextFile('cursor-mcp.json', latestBundle.cursor_mcp_json_with_key || '')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Cursor config
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Snippets de conexao</h2>
              <p className="text-sm text-slate-500">Arquivos prontos para conectar a IDE ao servidor MCP remoto.</p>
            </div>
            <div className="flex gap-2">
              {onboarding?.cursor_mcp_json ? (
                <Button variant="outline" size="sm" onClick={() => downloadTextFile('cursor-mcp.json', onboarding.cursor_mcp_json)}>
                  <Download className="mr-2 h-4 w-4" />
                  Cursor
                </Button>
              ) : null}
              {onboarding?.vscode_mcp_json ? (
                <Button variant="outline" size="sm" onClick={() => downloadTextFile('vscode-mcp.json', onboarding.vscode_mcp_json)}>
                  <Download className="mr-2 h-4 w-4" />
                  VS Code
                </Button>
              ) : null}
            </div>
          </div>

          {onboarding?.cursor_mcp_json ? (
            <CodeSnippetCard
              title=".cursor/mcp.json"
              description="Config padrao para Cursor usando a AI Agent Key no header x-api-key."
              code={latestBundle?.cursor_mcp_json_with_key || onboarding.cursor_mcp_json}
              language="json"
            />
          ) : null}

          {onboarding?.vscode_mcp_json ? (
            <CodeSnippetCard
              title=".vscode/mcp.json"
              description="Config equivalente para VS Code com transporte HTTP remoto."
              code={latestBundle?.vscode_mcp_json_with_key || onboarding.vscode_mcp_json}
              language="json"
            />
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {onboarding?.prompt_template ? (
              <Button variant="outline" size="sm" onClick={() => downloadTextFile('ultrazend-ai-prompt.md', onboarding.prompt_template)}>
                <Download className="mr-2 h-4 w-4" />
                Prompt
              </Button>
            ) : null}
            {onboarding?.quickstart_markdown ? (
              <Button variant="outline" size="sm" onClick={() => downloadTextFile('ultrazend-ai-quickstart.md', onboarding.quickstart_markdown)}>
                <Download className="mr-2 h-4 w-4" />
                Quickstart
              </Button>
            ) : null}
          </div>

          {onboarding?.prompt_template ? (
            <CodeSnippetCard
              title="Prompt padrao"
              description="Cole este prompt na IDE para orientar o agente no onboarding completo."
              code={onboarding.prompt_template}
              language="md"
            />
          ) : null}

          {onboarding?.quickstart_markdown ? (
            <CodeSnippetCard
              title="Quickstart"
              description="Resumo operacional para quem vai integrar a UltraZend com ajuda de IA."
              code={onboarding.quickstart_markdown}
              language="md"
            />
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Permissoes recomendadas</CardTitle>
            <CardDescription>Preset que permite ao agente fazer onboarding tecnico sem depender de prompt manual longo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visiblePermissionCatalog.map((permission) => (
              <div key={permission.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{permission.label}</div>
                    <div className="text-xs font-mono text-slate-500">{permission.id}</div>
                  </div>
                  <Badge variant="outline">{permission.category}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{permission.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>AI Agent Keys da conta</CardTitle>
            <CardDescription>Credenciais dedicadas para Cursor, VS Code e outros agentes compativeis com MCP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overviewQuery.isLoading ? (
              <div className="py-10 text-center text-muted-foreground">Carregando AI Agent Keys...</div>
            ) : agentKeys.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Nenhuma AI Agent Key criada ainda.
              </div>
            ) : (
              agentKeys.map((agentKey) => (
                <div key={agentKey.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">{agentKey.key_name}</div>
                        <Badge className="bg-cyan-600 text-white hover:bg-cyan-600">AI Agent</Badge>
                      </div>
                      {agentKey.description ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{agentKey.description}</p>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {agentKey.last_used_at ? `Ultimo uso ${formatRelativeTime(agentKey.last_used_at)}` : 'Ainda sem uso'}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700">
                    {agentKey.api_key_preview}...
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {agentKey.permissions.map((permission) => (
                      <Badge key={permission} variant="outline">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova AI Agent Key</DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-key-name">Nome</Label>
                <Input id="ai-key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-key-description">Descricao</Label>
                <Input id="ai-key-description" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Use esta chave apenas para agentes de IDE. O ideal e revogar ou rotacionar a credencial depois que o onboarding tecnico terminar.
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">Escopos da AI Agent Key</div>
                  <div className="text-sm text-slate-500">Comece com o preset recomendado e ajuste so se necessario.</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPermissions(onboarding?.recommended_permissions || [])}
                >
                  Aplicar recomendado
                </Button>
              </div>

              <div className="grid gap-3 max-h-[28rem] overflow-y-auto pr-1">
                {apiPermissionCatalog.map((permission) => {
                  const selected = selectedPermissions.includes(permission.id)

                  return (
                    <button
                      key={permission.id}
                      type="button"
                      onClick={() => handlePermissionToggle(permission.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? 'border-cyan-400 bg-cyan-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{permission.label}</div>
                          <div className="text-xs font-mono text-slate-500">{permission.id}</div>
                        </div>
                        <Badge variant="outline">{permission.category}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{permission.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAgentKey} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando...' : 'Criar AI Agent Key'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
