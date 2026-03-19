import { BookOpen, ExternalLink, KeyRound, Send, ShieldCheck, Webhook } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CodeSnippetCard } from '@/components/developer/CodeSnippetCard'
import {
  apiEndpointCatalog,
  apiKeyPresets,
  apiPermissionCatalog,
  buildSendEmailCurlExample,
  buildSendEmailFetchExample,
  buildWebhookPayloadExample,
  buildWebhookVerificationExample,
  getSwaggerDocsUrl,
  webhookEventCatalog,
} from '@/lib/developerPortal'

const setupSteps = [
  {
    title: '1. Gere uma API key',
    description: 'Use uma API key padrao `re_...` para a aplicacao cliente e libere apenas o que ela precisa.',
    to: '/app/api-keys',
    icon: KeyRound,
  },
  {
    title: '2. Autentique o dominio',
    description: 'Valide SPF, DKIM, DMARC e o MAIL FROM gerenciado antes de colocar trafego em producao.',
    to: '/app/domains',
    icon: ShieldCheck,
  },
  {
    title: '3. Configure webhooks',
    description: 'Receba aceite SMTP, aberturas, cliques e falhas no seu backend.',
    to: '/app/webhooks',
    icon: Webhook,
  },
]

export function DeveloperDocs() {
  const liveEvents = webhookEventCatalog.filter((event) => event.availability === 'live')
  const plannedEvents = webhookEventCatalog.filter((event) => event.availability === 'planned')

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_45%),linear-gradient(135deg,#eff6ff,_#f8fafc_55%,#fef3c7)] p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="bg-sky-600 text-white hover:bg-sky-600">Developer Portal</Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Integre a UltraZend com menos atrito</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Esta pagina concentra o fluxo recomendado para API keys, envio transacional, autenticacao de dominio
                e webhooks. O objetivo e sair do painel com um backend pronto para enviar, observar e reagir a eventos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/app/api-keys">Criar API key</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={getSwaggerDocsUrl()} target="_blank" rel="noreferrer">
                OpenAPI
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {setupSteps.map((step) => {
            const Icon = step.icon
            return (
              <Card key={step.title} className="border-white/70 bg-white/80 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-900 p-2 text-white">
                      <Icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-slate-600">{step.description}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to={step.to}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Card className="border-sky-200 bg-sky-50 shadow-sm">
        <CardContent className="pt-6 text-sm leading-6 text-sky-950">
          <span className="font-medium">Separacao de credenciais:</span> use <code>ULTRAZEND_API_KEY</code> com uma
          chave padrao <code>re_...</code> para <code>/api/emails/send</code>. A <code>ULTRAZEND_AI_AGENT_KEY</code>
          com prefixo <code>uai_</code> e reservada ao MCP em Cursor/VS Code e nao deve ser usada pela aplicacao cliente.
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Quickstart de envio</CardTitle>
            <CardDescription>Fluxo recomendado para colocar o primeiro email transacional no ar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {apiKeyPresets.map((preset) => (
                <div key={preset.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{preset.label}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{preset.description}</p>
                  {preset.recommendation ? <p className="mt-3 text-xs text-slate-500">{preset.recommendation}</p> : null}
                </div>
              ))}
            </div>

            <Separator />

            <CodeSnippetCard
              title="cURL"
              description="Exemplo minimo para testar a API com uma API key."
              code={buildSendEmailCurlExample()}
              language="bash"
            />
            <CodeSnippetCard
              title="JavaScript / fetch"
              description="Snippet para backend Node, edge function ou worker."
              code={buildSendEmailFetchExample()}
              language="ts"
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Superficie da integracao</CardTitle>
            <CardDescription>O que a plataforma entrega hoje no caminho ativo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {apiEndpointCatalog.map((endpoint) => (
                <div key={endpoint.path} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{endpoint.method}</Badge>
                    <span className="font-mono text-sm text-slate-900">{endpoint.path}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{endpoint.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Permissoes de API key</CardTitle>
            <CardDescription>Use o menor escopo necessario para cada integracao.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {apiPermissionCatalog.map((permission) => (
              <div key={permission.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{permission.label}</div>
                    <div className="text-xs font-mono text-slate-500">{permission.id}</div>
                  </div>
                  <Badge variant="outline">{permission.category}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{permission.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
                  <Webhook className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Eventos de webhook</CardTitle>
                  <CardDescription>Catalogo alinhado ao que o backend emite hoje.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {liveEvents.map((event) => (
                  <div key={event.value} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{event.label}</div>
                        <div className="text-xs font-mono text-slate-500">{event.value}</div>
                      </div>
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Live</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{event.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{event.deliveryMeaning}</p>
                  </div>
                ))}
              </div>

              {plannedEvents.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 font-medium text-amber-900">Eventos planejados</div>
                  <div className="flex flex-wrap gap-2">
                    {plannedEvents.map((event) => (
                      <Badge key={event.value} variant="outline">
                        {event.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <CodeSnippetCard
            title="Validacao de assinatura"
            description="Valide o header X-Webhook-Signature com o corpo bruto da requisicao."
            code={buildWebhookVerificationExample()}
            language="ts"
          />
          <CodeSnippetCard
            title="Payload de exemplo"
            description="Formato base entregue pela UltraZend em webhooks reais."
            code={buildWebhookPayloadExample()}
            language="json"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-sky-600" />
              <CardTitle className="text-base">Envio</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            `email.delivered` representa aceite SMTP do servidor remoto. Para inbox placement e reputacao, acompanhe
            tambem autenticacao de dominio e reputacao do IP de saida.
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Webhook className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">Observabilidade</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            Webhooks de teste, logs de entrega e analytics de mensagem precisam contar a mesma historia. As paginas de
            API Keys e Webhooks agora usam o mesmo catalogo e os mesmos exemplos.
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-violet-600" />
              <CardTitle className="text-base">Documentacao</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <p>Use esta pagina para onboarding e o OpenAPI para exploracao detalhada dos endpoints.</p>
            <Button asChild variant="outline" size="sm">
              <a href={getSwaggerDocsUrl()} target="_blank" rel="noreferrer">
                Abrir OpenAPI
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
