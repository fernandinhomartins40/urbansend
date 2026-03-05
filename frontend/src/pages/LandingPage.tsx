import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Code2,
  Globe2,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  apiEndpointCatalog,
  apiKeyPresets,
  getSwaggerDocsUrl,
  webhookEventCatalog,
} from '@/lib/developerPortal'

const pillars = [
  {
    title: 'Envio transacional por API',
    description:
      'Dispare emails via API key com permissões granulares, observando cada mensagem no painel.',
    icon: Mail,
    surface: 'border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50',
    iconTone: 'bg-teal-500/15 text-teal-700',
  },
  {
    title: 'Autenticação de domínio guiada',
    description:
      'Fluxo em 4 etapas com MAIL FROM técnico, SPF, DKIM e DMARC para melhorar entregabilidade.',
    icon: ShieldCheck,
    surface: 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50',
    iconTone: 'bg-blue-500/15 text-blue-700',
  },
  {
    title: 'Templates e biblioteca',
    description:
      'Editor rico, coleções, biblioteca compartilhada e modelos reutilizáveis para escalar operação.',
    icon: Workflow,
    surface: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    iconTone: 'bg-amber-500/15 text-amber-700',
  },
  {
    title: 'Analytics e eventos',
    description:
      'Painel de aceite SMTP, abertura, clique e falhas, com webhooks assinados para automação.',
    icon: Webhook,
    surface: 'border-pink-100 bg-gradient-to-br from-pink-50 via-white to-rose-50',
    iconTone: 'bg-pink-500/15 text-pink-700',
  },
] as const

const onboardingSteps = [
  {
    title: '1. Gere API key com escopo',
    description: 'Use presets prontos e habilite apenas as permissões necessárias para seu backend.',
    icon: KeyRound,
    tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  },
  {
    title: '2. Autentique domínio',
    description: 'Publique MAIL FROM, SPF, DKIM e DMARC com o assistente de domínio da plataforma.',
    icon: Globe2,
    tone: 'border-blue-100 bg-blue-50 text-blue-700',
  },
  {
    title: '3. Configure templates',
    description: 'Crie templates no editor rico ou clone modelos da biblioteca para acelerar entregas.',
    icon: Workflow,
    tone: 'border-amber-100 bg-amber-50 text-amber-700',
  },
  {
    title: '4. Feche o loop com webhooks',
    description: 'Valide assinatura HMAC e processe eventos de entrega, abertura e clique em tempo real.',
    icon: Webhook,
    tone: 'border-pink-100 bg-pink-50 text-pink-700',
  },
] as const

const methodTone: Record<string, string> = {
  GET: 'border-blue-200 bg-blue-100 text-blue-700',
  POST: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  PUT: 'border-amber-200 bg-amber-100 text-amber-700',
  DELETE: 'border-rose-200 bg-rose-100 text-rose-700',
}

export function LandingPage() {
  const liveEvents = webhookEventCatalog.filter((event) => event.availability === 'live')
  const plannedEvents = webhookEventCatalog.filter((event) => event.availability === 'planned')
  const endpointPreview = apiEndpointCatalog.slice(0, 6)
  const swaggerDocsUrl = getSwaggerDocsUrl()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-500">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold text-white">UltraZend</div>
              <div className="text-xs text-slate-300">Email transacional para SaaS</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
            <a href="#plataforma" className="transition hover:text-white">Plataforma</a>
            <a href="#onboarding" className="transition hover:text-white">Onboarding</a>
            <a href="#integracao" className="transition hover:text-white">Integração</a>
            <a href="#api" className="transition hover:text-white">API</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700">
              <Link to="/login">Acessar painel</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.2),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(251,113,133,0.18),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8 lg:pb-24 lg:pt-20">
          <div className="space-y-6">
            <Badge className="border-cyan-300/40 bg-cyan-500/15 text-cyan-200">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Infraestrutura pronta para escalar envios
            </Badge>
            <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Envie emails transacionais com
              <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 bg-clip-text text-transparent"> velocidade, controle e alta confiança</span>
            </h1>
            <p className="max-w-3xl text-lg text-slate-200">
              UltraZend centraliza tudo que seu SaaS precisa para operação de email: API de envio,
              autenticação de domínio, templates profissionais, analytics e webhooks em tempo real.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700">
                <Link to="/login">
                  Começar no painel
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10">
                <a href={swaggerDocsUrl} target="_blank" rel="noreferrer">
                  API docs
                  <BookOpen className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <Card className="border-white/10 bg-white/5 text-white shadow-2xl backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Capacidades ativas na plataforma</CardTitle>
              <CardDescription className="text-slate-300">
                Recursos disponíveis para sua operação de envio hoje.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-4">
                <div className="text-2xl font-semibold">{liveEvents.length}</div>
                <div className="text-sm text-cyan-100">eventos de webhook em produção</div>
              </div>
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                <div className="text-2xl font-semibold">{apiKeyPresets.length}</div>
                <div className="text-sm text-emerald-100">presets de API key no painel</div>
              </div>
              <div className="rounded-xl border border-blue-300/30 bg-blue-500/10 p-4">
                <div className="text-2xl font-semibold">{apiEndpointCatalog.length}</div>
                <div className="text-sm text-blue-100">rotas-chave mapeadas na documentação</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="plataforma" className="bg-slate-50 py-20 text-slate-900">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-3xl">
            <Badge className="border-slate-200 bg-white text-slate-700">Plataforma</Badge>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Tudo que seu SaaS precisa para email transacional</h2>
            <p className="mt-3 text-slate-600">
              Concentre envio, autenticação, conteúdo e observabilidade em um único fluxo operacional.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {pillars.map((pillar) => (
              <Card key={pillar.title} className={pillar.surface}>
                <CardHeader>
                  <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${pillar.iconTone}`}>
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="pt-2 text-xl">{pillar.title}</CardTitle>
                  <CardDescription className="text-slate-700">{pillar.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="onboarding" className="bg-white py-20 text-slate-900">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex items-center gap-3">
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">
              <Globe2 className="mr-2 h-3.5 w-3.5" />
              Time-to-value rápido
            </Badge>
            <p className="text-sm text-slate-500">Do cadastro ao envio em produção em poucos passos</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {onboardingSteps.map((step) => (
              <Card key={step.title} className="border-slate-200">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${step.tone}`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="integracao" className="bg-slate-50 py-20 text-slate-900">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Webhook className="h-5 w-5 text-pink-600" />
                Eventos de webhook
              </CardTitle>
              <CardDescription>
                Receba eventos de entrega e engajamento para automatizar seu backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {webhookEventCatalog.slice(0, 6).map((event) => (
                <div key={event.value} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{event.value}</div>
                    <div className="text-xs text-slate-600">{event.deliveryMeaning}</div>
                  </div>
                  <Badge
                    className={event.availability === 'live'
                      ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                      : 'border-amber-200 bg-amber-100 text-amber-700'}
                  >
                    {event.availability === 'live' ? 'live' : 'planned'}
                  </Badge>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <div className="text-xl font-semibold text-emerald-700">{liveEvents.length}</div>
                  <div className="text-xs text-emerald-700">eventos live</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <div className="text-xl font-semibold text-amber-700">{plannedEvents.length}</div>
                  <div className="text-xs text-amber-700">eventos planejados</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Code2 className="h-5 w-5 text-blue-600" />
                Endpoints principais
              </CardTitle>
              <CardDescription>
                API objetiva para envio, rastreamento, templates e integrações.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {endpointPreview.map((endpoint) => (
                <div key={`${endpoint.method}-${endpoint.path}`} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge className={methodTone[endpoint.method] || 'border-slate-200 bg-slate-100 text-slate-700'}>
                      {endpoint.method}
                    </Badge>
                    <code className="text-xs text-slate-700">{endpoint.path}</code>
                  </div>
                  <p className="text-xs text-slate-600">{endpoint.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="api" className="bg-white py-20 text-slate-900">
        <div className="mx-auto w-full max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <Badge className="border-slate-200 bg-slate-100 text-slate-700">
            <BadgeCheck className="mr-2 h-3.5 w-3.5" />
            Pronto para crescer com seu volume
          </Badge>
          <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Comece rápido e evolua com segurança</h2>
          <p className="mx-auto mt-3 max-w-3xl text-slate-600">
            Estruture sua operação de email em uma plataforma pensada para times de produto,
            engenharia e growth que precisam entregar com previsibilidade.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700">
              <Link to="/login">
                Começar agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={swaggerDocsUrl} target="_blank" rel="noreferrer">
                Ver API docs
                <BookOpen className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950 py-10 text-slate-300">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 text-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="inline-flex items-center gap-2">
            <Mail className="h-4 w-4 text-cyan-300" />
            <span>UltraZend</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#plataforma" className="transition hover:text-white">Plataforma</a>
            <a href="#onboarding" className="transition hover:text-white">Onboarding</a>
            <a href="#integracao" className="transition hover:text-white">Integração</a>
            <a href="#api" className="transition hover:text-white">API</a>
          </div>
          <div>(c) 2026 UltraZend. Todos os direitos reservados.</div>
        </div>
      </footer>
    </div>
  )
}
