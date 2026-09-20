import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Copy,
  ExternalLink,
  Info,
  KeyRound,
  Send,
  ShieldCheck,
  Sparkles,
  Webhook,
} from 'lucide-react'
import './PublicDocs.css'
import {
  agentPromptSnippet,
  batchResponseSnippet,
  batchSendSnippet,
  claudeConfigSnippet,
  credentialCatalog,
  curlSendSnippet,
  cursorConfigSnippet,
  dnsRecordsSnippet,
  docsSections,
  errorCatalog,
  getDocsMcpEndpoint,
  getDocsSwaggerUrl,
  mcpHandshakeSnippet,
  mcpPrompts,
  mcpResources,
  mcpTools,
  nodeSendSnippet,
  phpSendSnippet,
  publicEndpointCatalog,
  pythonSendSnippet,
  rateLimitPlans,
  sendEmailFields,
  sendErrorSnippet,
  sendResponseSnippet,
  sessionEndpointCatalog,
  vscodeConfigSnippet,
  webhookEvents,
  webhookHeaders,
  webhookPayloadSnippet,
  webhookPythonVerifySnippet,
  webhookVerifySnippet,
} from '@/lib/publicDocs'

/* ------------------------------------------------------------------ */
/* Blocos reutilizaveis                                                */
/* ------------------------------------------------------------------ */

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button type="button" className={`docs-copy ${copied ? 'is-copied' : ''}`} onClick={copy}>
      {copied ? <Check /> : <Copy />}
      <span>{copied ? 'Copiado' : 'Copiar'}</span>
    </button>
  )
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="docs-code">
      <div className="docs-code-head">
        {label ? <span className="docs-code-label">{label}</span> : null}
        <CopyButton code={code} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function CodeTabs({ samples }: { samples: Record<string, string> }) {
  const languages = Object.keys(samples)
  const [active, setActive] = useState(languages[0])
  const code = samples[active] ?? ''

  return (
    <div className="docs-code">
      <div className="docs-code-head">
        <div className="docs-tabs" role="tablist" aria-label="Linguagem do exemplo">
          {languages.map((language) => (
            <button
              key={language}
              type="button"
              role="tab"
              aria-selected={active === language}
              className={active === language ? 'is-active' : ''}
              onClick={() => setActive(language)}
            >
              {language}
            </button>
          ))}
        </div>
        <CopyButton code={code} />
      </div>
      <pre aria-live="polite">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                              */
/* ------------------------------------------------------------------ */

export function PublicDocs() {
  const [activeSection, setActiveSection] = useState(docsSections[0].id)

  const sendSamples = useMemo(
    () => ({
      cURL: curlSendSnippet(),
      'Node.js': nodeSendSnippet(),
      Python: pythonSendSnippet(),
      PHP: phpSendSnippet(),
    }),
    [],
  )

  const webhookSamples = useMemo(
    () => ({
      'Node.js': webhookVerifySnippet(),
      Python: webhookPythonVerifySnippet(),
    }),
    [],
  )

  const mcpClientSamples = useMemo(
    () => ({
      Cursor: cursorConfigSnippet(),
      'VS Code': vscodeConfigSnippet(),
      'Claude Code': claudeConfigSnippet(),
    }),
    [],
  )

  // Destaca no indice a secao que esta na tela.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (visible) {
          setActiveSection(visible.target.id)
        }
      },
      { rootMargin: '-90px 0px -65% 0px', threshold: 0 },
    )

    docsSections.forEach((section) => {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  const liveEvents = webhookEvents.filter((event) => event.availability === 'live')
  const plannedEvents = webhookEvents.filter((event) => event.availability === 'planned')

  return (
    <div className="docs-page">
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <Link to="/" aria-label="Voltar para a pagina inicial da VeloMail">
            <img src="/landing/logo-white.png" alt="VeloMail" />
          </Link>
          <span className="docs-topbar-tag">Documentacao</span>
          <div className="docs-topbar-actions">
            <a className="docs-topbar-link" href={getDocsSwaggerUrl()} target="_blank" rel="noreferrer">
              Referencia OpenAPI
            </a>
            <Link className="docs-cta" to="/login">
              Criar conta <ArrowRight />
            </Link>
          </div>
        </div>
      </header>

      <div className="docs-shell">
        <nav className="docs-nav" aria-label="Indice da documentacao">
          <p className="docs-nav-title">Nesta pagina</p>
          {docsSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={activeSection === section.id ? 'is-active' : ''}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <main className="docs-content">
          {/* ---------------------------------------------------- */}
          <section id="inicio" className="docs-section docs-hero">
            <p className="docs-eyebrow">
              <Sparkles aria-hidden="true" /> Guia de integracao
            </p>
            <h1>Documentacao da API e do MCP da VeloMail</h1>
            <p>
              A VeloMail entrega email transacional por uma API REST simples e, para quem desenvolve com IA, um
              servidor MCP remoto que deixa o agente configurar dominio, webhook e chaves sozinho. Esta pagina cobre
              os dois caminhos com o comportamento real da plataforma, incluindo codigos de erro e limites.
            </p>

            <div className="docs-cards">
              <article className="docs-card">
                <h4>
                  <KeyRound aria-hidden="true" /> 1. Gere a API key
                </h4>
                <p>
                  Crie uma chave <code>re_...</code> com a permissao <code>email:send</code> em{' '}
                  <code>/app/api-keys</code>. Ela so aparece uma vez.
                </p>
              </article>
              <article className="docs-card">
                <h4>
                  <ShieldCheck aria-hidden="true" /> 2. Autentique o dominio
                </h4>
                <p>
                  Publique SPF, DKIM e DMARC. Sem o dominio verificado, o envio responde{' '}
                  <code>DOMAIN_NOT_VERIFIED</code>.
                </p>
              </article>
              <article className="docs-card">
                <h4>
                  <Send aria-hidden="true" /> 3. Envie o primeiro email
                </h4>
                <p>
                  Um <code>POST</code> em <code>/api/emails/send</code> com o header <code>x-api-key</code> ja
                  coloca a mensagem na fila.
                </p>
              </article>
              <article className="docs-card">
                <h4>
                  <Webhook aria-hidden="true" /> 4. Receba os eventos
                </h4>
                <p>
                  Configure um endpoint HTTPS e valide a assinatura HMAC para saber o que aconteceu com cada
                  mensagem.
                </p>
              </article>
            </div>

            <h3>Base da API</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Recurso</th>
                    <th>Endereco</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>API REST</td>
                    <td className="docs-mono">https://www.velomail.com.br/api</td>
                  </tr>
                  <tr>
                    <td>Servidor MCP</td>
                    <td className="docs-mono">https://www.velomail.com.br/api/ai/mcp</td>
                  </tr>
                  <tr>
                    <td>Referencia OpenAPI</td>
                    <td className="docs-mono">https://www.velomail.com.br/api-docs</td>
                  </tr>
                  <tr>
                    <td>SMTP (submission)</td>
                    <td className="docs-mono">mail.velomail.com.br:587 (STARTTLS)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------- */}
          <section id="autenticacao" className="docs-section">
            <h2>Autenticacao</h2>
            <p>
              Toda chamada da sua aplicacao e autenticada pelo header <code>x-api-key</code>. Existem dois tipos de
              credencial e eles nao sao intercambiaveis: a plataforma rejeita explicitamente o uso cruzado.
            </p>

            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Prefixo</th>
                    <th>Tipo</th>
                    <th>Serve para</th>
                    <th>Nao serve para</th>
                    <th>Onde criar</th>
                  </tr>
                </thead>
                <tbody>
                  {credentialCatalog.map((credential) => (
                    <tr key={credential.prefix}>
                      <td className="docs-mono">{credential.prefix}</td>
                      <td>{credential.name}</td>
                      <td>{credential.usedFor}</td>
                      <td>{credential.notUsedFor}</td>
                      <td className="docs-mono">{credential.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-callout is-warning">
              <AlertTriangle aria-hidden="true" />
              <p>
                Nunca use a AI Agent Key <code>uai_</code> como chave de envio da aplicacao. Ela carrega permissoes
                administrativas para o agente configurar a conta, e o endpoint transacional a recusa com{' '}
                <code>403 AI_AGENT_KEY_NOT_ALLOWED</code>.
              </p>
            </div>

            <h3>Endpoints que aceitam API key</h3>
            <p>
              Hoje a autenticacao por API key vale para o envio transacional. Os demais endpoints do produto exigem
              a sessao autenticada do painel e nao fazem parte da superficie publica.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Metodo</th>
                    <th>Endpoint</th>
                    <th>Permissao</th>
                    <th>Descricao</th>
                  </tr>
                </thead>
                <tbody>
                  {publicEndpointCatalog.map((endpoint) => (
                    <tr key={endpoint.path}>
                      <td>
                        <span className="docs-pill docs-pill-post">{endpoint.method}</span>
                      </td>
                      <td className="docs-mono">{endpoint.path}</td>
                      <td className="docs-mono">{endpoint.permission}</td>
                      <td>{endpoint.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-callout">
              <Info aria-hidden="true" />
              <p>
                Precisa ler historico, dominios ou analytics de forma programatica? Use o servidor MCP, que expoe
                essas leituras como tools autenticadas por chave, sem depender da sessao do navegador.
              </p>
            </div>
          </section>

          {/* ---------------------------------------------------- */}
          <section id="envio" className="docs-section">
            <h2>Enviar um email</h2>
            <p>
              <span className="docs-pill docs-pill-post">POST</span>{' '}
              <code>/api/emails/send</code> — envia uma mensagem para um destinatario. A resposta volta assim que a
              mensagem entra na fila; a entrega em si acontece logo depois e e reportada por webhook.
            </p>

            <CodeTabs samples={sendSamples} />

            <h3>Campos do corpo</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Tipo</th>
                    <th>Obrigatorio</th>
                    <th>Descricao</th>
                  </tr>
                </thead>
                <tbody>
                  {sendEmailFields.map((field) => (
                    <tr key={field.name}>
                      <td className="docs-mono">{field.name}</td>
                      <td className="docs-mono">{field.type}</td>
                      <td>
                        <span className={`docs-pill ${field.required ? 'docs-pill-required' : 'docs-pill-optional'}`}>
                          {field.required ? 'sim' : 'nao'}
                        </span>
                      </td>
                      <td>{field.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-callout">
              <Info aria-hidden="true" />
              <p>
                A mensagem precisa ter conteudo: informe pelo menos um entre <code>html</code>, <code>text</code> e{' '}
                <code>template_id</code>. Se nenhum for enviado, a API responde 400 com erro de validacao.
              </p>
            </div>

            <h3>Resposta de sucesso</h3>
            <CodeBlock code={sendResponseSnippet()} label="200 OK" />

            <h3>Resposta de erro</h3>
            <p>
              Toda falha traz <code>success: false</code> e um campo <code>code</code> estavel, feito para ser tratado
              no seu codigo em vez do texto da mensagem.
            </p>
            <CodeBlock code={sendErrorSnippet()} label="400 Bad Request" />
          </section>

          {/* ---------------------------------------------------- */}
          <section id="lote" className="docs-section">
            <h2>Envio em lote</h2>
            <p>
              <span className="docs-pill docs-pill-post">POST</span>{' '}
              <code>/api/emails/send-batch</code> — envia ate 50 mensagens em uma requisicao. Cada item usa o mesmo
              formato do envio individual.
            </p>

            <CodeBlock code={batchSendSnippet()} label="cURL" />

            <div className="docs-callout is-warning">
              <AlertTriangle aria-hidden="true" />
              <p>
                O lote devolve <code>200</code> mesmo com falhas parciais. Sempre percorra <code>results</code> e
                trate cada <code>index</code> com <code>success: false</code>; o total aparece em{' '}
                <code>failed_emails</code>.
              </p>
            </div>

            <CodeBlock code={batchResponseSnippet()} label="200 OK" />
          </section>

          {/* ---------------------------------------------------- */}
          <section id="erros" className="docs-section">
            <h2>Erros e limites</h2>
            <p>
              Trate os codigos abaixo pelo campo <code>code</code> da resposta. Eles sao estaveis entre versoes; o
              texto de <code>error</code> pode mudar.
            </p>

            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Codigo</th>
                    <th>Significado</th>
                    <th>O que fazer</th>
                  </tr>
                </thead>
                <tbody>
                  {errorCatalog.map((error) => (
                    <tr key={`${error.status}-${error.code}`}>
                      <td className="docs-mono">{error.status}</td>
                      <td className="docs-mono">{error.code}</td>
                      <td>{error.meaning}</td>
                      <td>{error.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Limites de envio por plano</h3>
            <p>
              O limite por minuto e verificado a cada requisicao e o limite por hora e aplicado pela politica do
              plano. Ao receber <code>429</code>, respeite o campo <code>retryAfter</code> e aplique backoff
              exponencial em vez de repetir imediatamente.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Plano</th>
                    <th>Por minuto</th>
                    <th>Por hora</th>
                    <th>Por dia</th>
                  </tr>
                </thead>
                <tbody>
                  {rateLimitPlans.map((plan) => (
                    <tr key={plan.plan}>
                      <td>{plan.plan}</td>
                      <td className="docs-mono">{plan.emailsPerMinute}</td>
                      <td className="docs-mono">{plan.emailsPerHour}</td>
                      <td className="docs-mono">{plan.emailsPerDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------- */}
          <section id="dominio" className="docs-section">
            <h2>Autenticacao de dominio</h2>
            <p>
              A VeloMail so envia em nome de dominios verificados. O setup e feito em <code>/app/domains</code>, que
              gera os registros especificos da sua conta, ou pelo agente via MCP com as tools{' '}
              <code>domain_setup</code> e <code>domain_verify</code>.
            </p>

            <ul>
              <li>
                <strong>SPF</strong> autoriza a infraestrutura da VeloMail a enviar pelo seu dominio.
              </li>
              <li>
                <strong>DKIM</strong> assina cada mensagem; sem ele os provedores tendem a classificar como suspeita.
              </li>
              <li>
                <strong>DMARC</strong> diz ao provedor o que fazer quando a checagem falha e habilita relatorios.
              </li>
              <li>
                <strong>MAIL FROM</strong> tecnico alinha o envelope ao dominio gerenciado pela plataforma.
              </li>
            </ul>

            <CodeBlock code={dnsRecordsSnippet()} label="Registros DNS" />

            <div className="docs-callout">
              <Info aria-hidden="true" />
              <p>
                Se o dominio ja hospeda um site, use o subdominio tecnico <code>uz-mail.seu-dominio.com</code> para
                SPF e MAIL FROM. Assim a configuracao de email nao interfere nos registros do site principal.
              </p>
            </div>
          </section>

          {/* ---------------------------------------------------- */}
          <section id="webhooks" className="docs-section">
            <h2>Webhooks</h2>
            <p>
              Cadastre um endpoint HTTPS em <code>/app/webhooks</code> e escolha os eventos. A VeloMail faz um{' '}
              <code>POST</code> com JSON e reenvia em caso de falha, com backoff exponencial de ate 30 segundos e o
              limite de tentativas configurado no endpoint.
            </p>

            <h3>Eventos</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Status</th>
                    <th>Quando dispara</th>
                  </tr>
                </thead>
                <tbody>
                  {[...liveEvents, ...plannedEvents].map((event) => (
                    <tr key={event.value}>
                      <td className="docs-mono">{event.value}</td>
                      <td>
                        <span
                          className={`docs-pill ${
                            event.availability === 'live' ? 'docs-pill-live' : 'docs-pill-planned'
                          }`}
                        >
                          {event.availability === 'live' ? 'ativo' : 'planejado'}
                        </span>
                      </td>
                      <td>{event.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-callout is-warning">
              <AlertTriangle aria-hidden="true" />
              <p>
                <code>email.delivered</code> significa que o servidor do destinatario aceitou a mensagem via SMTP.
                Isso nao garante que ela chegou na caixa de entrada, e nao no spam.
              </p>
            </div>

            <h3>Headers da requisicao</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Header</th>
                    <th>Conteudo</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookHeaders.map((header) => (
                    <tr key={header.header}>
                      <td className="docs-mono">{header.header}</td>
                      <td>{header.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Payload</h3>
            <CodeBlock code={webhookPayloadSnippet()} label="application/json" />

            <h3>Validando a assinatura</h3>
            <p>
              A assinatura e o HMAC SHA256 do corpo <strong>bruto</strong> da requisicao usando o secret do endpoint.
              Calcule sobre os bytes recebidos: se o framework reserializar o JSON, a assinatura nao vai bater.
            </p>
            <CodeTabs samples={webhookSamples} />

            <div className="docs-callout">
              <Info aria-hidden="true" />
              <p>
                Responda <code>2xx</code> rapido e processe de forma assincrona. Como existem retries, trate o
                consumo como idempotente usando a combinacao de <code>event</code>, <code>data.message_id</code> e{' '}
                <code>timestamp</code>.
              </p>
            </div>
          </section>

          {/* ---------------------------------------------------- */}
          <section id="mcp" className="docs-section">
            <h2>Servidor MCP</h2>
            <p>
              O Model Context Protocol permite que assistentes de codigo conversem com a VeloMail durante o
              desenvolvimento. Com o servidor conectado, o agente consulta o estado real da conta, configura dominio
              e webhook, cria a chave de envio e roda um teste — sem voce alternar para o painel.
            </p>

            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Caracteristica</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Endpoint</td>
                    <td className="docs-mono">{getDocsMcpEndpoint()}</td>
                  </tr>
                  <tr>
                    <td>Transporte</td>
                    <td>Streamable HTTP, sem sessao persistente</td>
                  </tr>
                  <tr>
                    <td>Autenticacao</td>
                    <td>
                      Header <span className="docs-mono">x-api-key</span> com uma AI Agent Key{' '}
                      <span className="docs-mono">uai_</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Metodo aceito</td>
                    <td>
                      Apenas <span className="docs-mono">POST</span>; GET e DELETE respondem 405
                    </td>
                  </tr>
                  <tr>
                    <td>Workspace</td>
                    <td>
                      Opcional: <span className="docs-mono">x-organization-id</span> para operar em uma organizacao
                      especifica
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3>Conectando sua IDE</h3>
            <p>
              Gere a AI Agent Key em <code>/app/ai</code> e cole a configuracao abaixo. No Cursor, o arquivo e{' '}
              <code>.cursor/mcp.json</code>; no VS Code, <code>.vscode/mcp.json</code>.
            </p>
            <CodeTabs samples={mcpClientSamples} />

            <div className="docs-callout is-warning">
              <AlertTriangle aria-hidden="true" />
              <p>
                Esses arquivos costumam ser versionados. Prefira referenciar uma variavel de ambiente e adicione a
                configuracao ao <code>.gitignore</code> se a chave estiver escrita direto nela. Revogue a chave em{' '}
                <code>/app/ai</code> quando o setup terminar.
              </p>
            </div>

            <h3>Testando sem IDE</h3>
            <p>
              O endpoint e JSON-RPC 2.0. Para conferir a conexao e listar o que sua chave enxerga:
            </p>
            <CodeBlock code={mcpHandshakeSnippet()} label="cURL" />

            <h3>Prompt inicial sugerido</h3>
            <p>
              Com o servidor conectado, este prompt faz o agente usar as tools na ordem certa em vez de chutar a
              integracao a partir de memoria.
            </p>
            <CodeBlock code={agentPromptSnippet()} label="Prompt" />
          </section>

          {/* ---------------------------------------------------- */}
          <section id="mcp-tools" className="docs-section">
            <h2>Tools, resources e prompts do MCP</h2>
            <p>
              O servidor mostra ao agente apenas o que a permissao da chave permite. Se uma tool nao aparecer na
              lista, a AI Agent Key nao tem a permissao correspondente — ajuste em <code>/app/ai</code>.
            </p>

            <h3>Tools</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Permissao</th>
                    <th>O que faz</th>
                  </tr>
                </thead>
                <tbody>
                  {mcpTools.map((tool) => (
                    <tr key={tool.name}>
                      <td className="docs-mono">{tool.name}</td>
                      <td className="docs-mono">{tool.permission}</td>
                      <td>{tool.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Resources</h3>
            <p>
              Documentacao e estado da conta que o agente le antes de escrever codigo, direto pelo protocolo.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>URI</th>
                    <th>Conteudo</th>
                  </tr>
                </thead>
                <tbody>
                  {mcpResources.map((resource) => (
                    <tr key={resource.uri}>
                      <td className="docs-mono">{resource.uri}</td>
                      <td>{resource.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Prompts</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Prompt</th>
                    <th>Argumentos</th>
                    <th>Objetivo</th>
                  </tr>
                </thead>
                <tbody>
                  {mcpPrompts.map((prompt) => (
                    <tr key={prompt.name}>
                      <td className="docs-mono">{prompt.name}</td>
                      <td className="docs-mono">{prompt.args}</td>
                      <td>{prompt.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-callout">
              <Bot aria-hidden="true" />
              <p>
                Depois do onboarding, a aplicacao em producao nao deve depender do MCP. O agente cria uma API key{' '}
                <code>re_...</code> dedicada e o seu codigo passa a chamar <code>/api/emails/send</code> diretamente.
              </p>
            </div>
          </section>

          {/* ---------------------------------------------------- */}
          <section id="referencia" className="docs-section">
            <h2>Referencia complementar</h2>
            <p>
              A especificacao OpenAPI cobre todos os endpoints da plataforma, inclusive os que exigem sessao do
              painel e nao aceitam API key.
            </p>

            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Metodo</th>
                    <th>Endpoint</th>
                    <th>Permissao</th>
                    <th>Descricao</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionEndpointCatalog.map((endpoint) => (
                    <tr key={`${endpoint.method}-${endpoint.path}`}>
                      <td>
                        <span
                          className={`docs-pill ${
                            endpoint.method === 'POST' ? 'docs-pill-post' : 'docs-pill-get'
                          }`}
                        >
                          {endpoint.method}
                        </span>
                      </td>
                      <td className="docs-mono">{endpoint.path}</td>
                      <td className="docs-mono">{endpoint.permission}</td>
                      <td>{endpoint.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-callout">
              <Info aria-hidden="true" />
              <p>
                Esses endpoints usam a sessao autenticada do painel. Para automacao, use o servidor MCP ou fale com o
                suporte sobre o caso de uso.
              </p>
            </div>

            <div className="docs-cards">
              <article className="docs-card">
                <h4>
                  <ExternalLink aria-hidden="true" /> OpenAPI
                </h4>
                <p>
                  <a href={getDocsSwaggerUrl()} target="_blank" rel="noreferrer">
                    Abrir a especificacao interativa
                  </a>{' '}
                  para explorar schemas e testar chamadas.
                </p>
              </article>
              <article className="docs-card">
                <h4>
                  <KeyRound aria-hidden="true" /> Painel
                </h4>
                <p>
                  <Link to="/login">Entre na sua conta</Link> para gerar chaves, verificar dominios e cadastrar
                  webhooks.
                </p>
              </article>
              <article className="docs-card">
                <h4>
                  <Send aria-hidden="true" /> Suporte
                </h4>
                <p>
                  Duvidas de integracao: <a href="mailto:suporte@velomail.com.br">suporte@velomail.com.br</a>.
                </p>
              </article>
            </div>
          </section>
        </main>
      </div>

      <footer className="docs-footer">
        <div className="docs-footer-inner">
          <span>&copy; {new Date().getFullYear()} VeloMail. Documentacao de integracao.</span>
          <div className="docs-footer-links">
            <Link to="/">Inicio</Link>
            <a href={getDocsSwaggerUrl()} target="_blank" rel="noreferrer">
              OpenAPI
            </a>
            <Link to="/login">Entrar</Link>
            <a href="mailto:suporte@velomail.com.br">Suporte</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
