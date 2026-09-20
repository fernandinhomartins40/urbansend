/**
 * Catalogo da documentacao publica de integracao (/developers).
 *
 * Tudo aqui reflete o que o backend expoe hoje:
 * - `POST /api/emails/send` e `POST /api/emails/send-batch` sao as unicas rotas
 *   que aceitam API key (`authenticateJwtOrApiKey`). As demais exigem sessao JWT
 *   do painel, entao NAO sao documentadas como API publica.
 * - O MCP vive em `POST /api/ai/mcp` e autentica com uma AI Agent Key `uai_`.
 */

export const PUBLIC_ORIGIN = 'https://www.velomail.com.br'

export const getDocsOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return PUBLIC_ORIGIN
}

export const getDocsApiBase = () => `${getDocsOrigin()}/api`
export const getDocsSwaggerUrl = () => `${getDocsOrigin()}/api-docs`
export const getDocsMcpEndpoint = () => `${getDocsOrigin()}/api/ai/mcp`

export interface DocsSection {
  id: string
  label: string
}

export const docsSections: DocsSection[] = [
  { id: 'inicio', label: 'Visao geral' },
  { id: 'autenticacao', label: 'Autenticacao' },
  { id: 'envio', label: 'Enviar email' },
  { id: 'lote', label: 'Envio em lote' },
  { id: 'erros', label: 'Erros e limites' },
  { id: 'dominio', label: 'Autenticacao de dominio' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'mcp', label: 'Servidor MCP' },
  { id: 'mcp-tools', label: 'Tools do MCP' },
  { id: 'referencia', label: 'Referencia' },
]

/* ------------------------------------------------------------------ */
/* Credenciais                                                         */
/* ------------------------------------------------------------------ */

export interface CredentialDefinition {
  prefix: string
  name: string
  envVar: string
  header: string
  usedFor: string
  notUsedFor: string
  createdAt: string
}

export const credentialCatalog: CredentialDefinition[] = [
  {
    prefix: 're_',
    name: 'API key padrao',
    envVar: 'VELOMAIL_API_KEY',
    header: 'x-api-key',
    usedFor: 'Envio transacional da sua aplicacao em /api/emails/send e /api/emails/send-batch.',
    notUsedFor: 'Nao e aceita no servidor MCP.',
    createdAt: '/app/api-keys',
  },
  {
    prefix: 'uai_',
    name: 'AI Agent Key',
    envVar: 'VELOMAIL_AI_AGENT_KEY',
    header: 'x-api-key',
    usedFor: 'Conectar Cursor, VS Code e agentes de IA ao servidor MCP em /api/ai/mcp.',
    notUsedFor: 'Rejeitada em /api/emails/send com o codigo AI_AGENT_KEY_NOT_ALLOWED.',
    createdAt: '/app/ai',
  },
]

/* ------------------------------------------------------------------ */
/* Endpoints publicos (aceitam API key)                                */
/* ------------------------------------------------------------------ */

export interface PublicEndpointDefinition {
  method: string
  path: string
  description: string
  permission: string
  auth: 'api_key' | 'session'
}

export const publicEndpointCatalog: PublicEndpointDefinition[] = [
  {
    method: 'POST',
    path: '/api/emails/send',
    description: 'Envia um email transacional para um destinatario.',
    permission: 'email:send',
    auth: 'api_key',
  },
  {
    method: 'POST',
    path: '/api/emails/send-batch',
    description: 'Envia até 50 emails em uma unica requisicao.',
    permission: 'email:send',
    auth: 'api_key',
  },
]

export const sessionEndpointCatalog: PublicEndpointDefinition[] = [
  { method: 'GET', path: '/api/emails', description: 'Lista mensagens enviadas com filtros e paginacao.', permission: 'email:read', auth: 'session' },
  { method: 'GET', path: '/api/emails/:id', description: 'Detalhe de uma mensagem enviada.', permission: 'email:read', auth: 'session' },
  { method: 'GET', path: '/api/emails/:id/analytics', description: 'Eventos de entrega, abertura e clique da mensagem.', permission: 'email:read', auth: 'session' },
  { method: 'GET', path: '/api/domains', description: 'Lista dominios e status de verificacao.', permission: 'domain:read', auth: 'session' },
  { method: 'POST', path: '/api/domain-setup/setup', description: 'Inicia a autenticacao DNS de um dominio.', permission: 'domain:write', auth: 'session' },
  { method: 'GET', path: '/api/templates', description: 'Lista templates privados da conta.', permission: 'template:read', auth: 'session' },
  { method: 'GET', path: '/api/webhooks', description: 'Lista endpoints de webhook e metricas de entrega.', permission: 'webhook:read', auth: 'session' },
  { method: 'GET', path: '/api/analytics/overview', description: 'Consolidado de envio, entrega e engajamento.', permission: 'analytics:read', auth: 'session' },
]

/* ------------------------------------------------------------------ */
/* Campos do payload de envio                                          */
/* ------------------------------------------------------------------ */

export interface FieldDefinition {
  name: string
  type: string
  required: boolean
  description: string
}

export const sendEmailFields: FieldDefinition[] = [
  { name: 'to', type: 'string', required: true, description: 'Email do destinatario. Em /send aceita apenas um endereco; use /send-batch para varios.' },
  { name: 'subject', type: 'string', required: true, description: 'Assunto da mensagem, de 1 a 255 caracteres.' },
  { name: 'from', type: 'string', required: false, description: 'Remetente. Se omitido, a plataforma usa o remetente padrao da conta. O dominio precisa estar verificado.' },
  { name: 'html', type: 'string', required: false, description: 'Corpo HTML, ate 1MB. Obrigatorio se nao houver text nem template_id.' },
  { name: 'text', type: 'string', required: false, description: 'Corpo texto puro, ate 1MB. Recomendado junto com o HTML.' },
  { name: 'template_id', type: 'string', required: false, description: 'Id de um template da conta. Substitui html/text quando informado.' },
  { name: 'variables', type: 'object', required: false, description: 'Pares chave/valor para interpolar no template. Cada valor aceita ate 1000 caracteres.' },
  { name: 'reply_to', type: 'string', required: false, description: 'Endereco usado quando o destinatario responde.' },
  { name: 'cc', type: 'string[]', required: false, description: 'Copia, ate 10 enderecos.' },
  { name: 'bcc', type: 'string[]', required: false, description: 'Copia oculta, ate 10 enderecos.' },
  { name: 'tags', type: 'string[]', required: false, description: 'Ate 10 tags de 50 caracteres para segmentar relatorios.' },
  { name: 'attachments', type: 'object[]', required: false, description: 'Ate 5 anexos com filename, content em base64, contentType e encoding opcional. Cada arquivo ate 10MB.' },
  { name: 'tracking_enabled', type: 'boolean', required: false, description: 'Liga o pixel de abertura e o rastreio de cliques. Padrao: true.' },
]

/* ------------------------------------------------------------------ */
/* Erros                                                               */
/* ------------------------------------------------------------------ */

export interface ErrorDefinition {
  status: number
  code: string
  meaning: string
  action: string
}

export const errorCatalog: ErrorDefinition[] = [
  {
    status: 401,
    code: 'Access token or API key required',
    meaning: 'A requisicao chegou sem o header x-api-key.',
    action: 'Envie a API key `re_...` no header x-api-key.',
  },
  {
    status: 401,
    code: 'Invalid API key',
    meaning: 'A chave nao existe, foi revogada ou o prefixo e invalido.',
    action: 'Gere uma nova chave em /app/api-keys.',
  },
  {
    status: 403,
    code: 'AI_AGENT_KEY_NOT_ALLOWED',
    meaning: 'Uma AI Agent Key `uai_` foi usada em uma rota transacional.',
    action: 'Use uma API key padrao `re_...` para envio e reserve a `uai_` para o MCP.',
  },
  {
    status: 403,
    code: 'Insufficient permissions',
    meaning: 'A chave existe mas nao possui a permissao email:send.',
    action: 'Edite as permissoes da chave ou crie outra com o preset de envio transacional.',
  },
  {
    status: 400,
    code: 'DOMAIN_NOT_VERIFIED',
    meaning: 'O dominio do remetente ainda nao concluiu a verificacao DNS.',
    action: 'Publique SPF, DKIM e DMARC e rode a verificacao em /app/domains.',
  },
  {
    status: 400,
    code: 'Validation error',
    meaning: 'O payload nao passou na validacao de schema.',
    action: 'Confira os campos obrigatorios e os limites de tamanho descritos acima.',
  },
  {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    meaning: 'O limite de emails por minuto do plano foi atingido.',
    action: 'Respeite o retryAfter devolvido na resposta e aplique backoff exponencial.',
  },
  {
    status: 429,
    code: 'TENANT_POLICY_BLOCKED',
    meaning: 'Uma politica do plano bloqueou o envio, como o limite por hora.',
    action: 'Leia o campo error da resposta e reduza a cadencia ou revise o plano.',
  },
  {
    status: 500,
    code: 'EMAIL_SEND_ERROR',
    meaning: 'Falha inesperada no pipeline de envio.',
    action: 'Repita com backoff. Se persistir, acione o suporte com o horario da chamada.',
  },
]

export interface RateLimitPlan {
  plan: string
  emailsPerMinute: number
  emailsPerHour: number
  emailsPerDay: number
}

export const rateLimitPlans: RateLimitPlan[] = [
  { plan: 'Free', emailsPerMinute: 2, emailsPerHour: 10, emailsPerDay: 100 },
  { plan: 'Pro', emailsPerMinute: 10, emailsPerHour: 100, emailsPerDay: 1000 },
  { plan: 'Enterprise', emailsPerMinute: 50, emailsPerHour: 500, emailsPerDay: 10000 },
]

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

export interface WebhookEventDoc {
  value: string
  description: string
  availability: 'live' | 'planned'
}

export const webhookEvents: WebhookEventDoc[] = [
  { value: 'email.sent', description: 'A requisicao foi aceita e a mensagem entrou na fila de entrega.', availability: 'live' },
  { value: 'email.delivered', description: 'O servidor do destinatario aceitou a mensagem via SMTP. Aceite nao garante inbox.', availability: 'live' },
  { value: 'email.opened', description: 'O pixel de rastreio foi carregado. Depende do cliente de email exibir imagens.', availability: 'live' },
  { value: 'email.clicked', description: 'Um link rastreado foi acessado. O payload inclui a URL original.', availability: 'live' },
  { value: 'email.failed', description: 'O pipeline falhou antes do aceite SMTP.', availability: 'live' },
  { value: 'email.bounced', description: 'Reservado para quando o fluxo de DSN estiver ativo.', availability: 'planned' },
  { value: 'email.unsubscribed', description: 'Reservado para o fluxo de preferencias e descadastro.', availability: 'planned' },
  { value: 'email.spam_complaint', description: 'Reservado para feedback loop de provedores.', availability: 'planned' },
]

export interface WebhookHeaderDoc {
  header: string
  description: string
}

export const webhookHeaders: WebhookHeaderDoc[] = [
  { header: 'X-Webhook-Signature', description: 'HMAC SHA256 do corpo bruto, no formato sha256=<hex>.' },
  { header: 'X-Webhook-Event', description: 'Nome do evento entregue, por exemplo email.delivered.' },
  { header: 'X-Webhook-ID', description: 'Id do endpoint de webhook que originou a chamada.' },
  { header: 'X-Tenant-ID', description: 'Id da conta dona do evento.' },
  { header: 'User-Agent', description: 'Sempre UltraZend-Webhook/1.0.' },
]

/* ------------------------------------------------------------------ */
/* MCP                                                                 */
/* ------------------------------------------------------------------ */

export interface McpToolDoc {
  name: string
  description: string
  permission: string
}

export const mcpTools: McpToolDoc[] = [
  { name: 'account_overview', description: 'Panorama da conta: dominios, webhooks e chaves ativas.', permission: 'nenhuma' },
  { name: 'workspace_context', description: 'Workspace ativo, conta dona e memberships disponiveis.', permission: 'workspace:read' },
  { name: 'domains_list', description: 'Lista dominios e o status de verificacao de cada um.', permission: 'domain:read' },
  { name: 'domain_setup', description: 'Inicia a autenticacao DNS de um dominio e devolve os registros a publicar.', permission: 'domain:write' },
  { name: 'domain_verify', description: 'Executa a verificacao DNS e retorna o que ainda falta.', permission: 'domain:write' },
  { name: 'webhooks_list', description: 'Lista os endpoints de webhook configurados.', permission: 'webhook:read' },
  { name: 'webhook_create', description: 'Cria um endpoint HTTPS de webhook com os eventos escolhidos.', permission: 'webhook:write' },
  { name: 'settings_get', description: 'Le as configuracoes efetivas da conta.', permission: 'settings:read' },
  { name: 'settings_update', description: 'Atualiza configuracoes a partir de um payload parcial.', permission: 'settings:write' },
  { name: 'api_keys_list', description: 'Lista as API keys da conta com preview e ultimo uso.', permission: 'api_key:read' },
  { name: 'api_key_create', description: 'Cria uma API key padrao para a aplicacao cliente.', permission: 'api_key:write' },
  { name: 'send_test_email', description: 'Dispara um envio transacional de teste para validar a integracao.', permission: 'email:send' },
]

export interface McpResourceDoc {
  uri: string
  description: string
}

export const mcpResources: McpResourceDoc[] = [
  { uri: 'ultrazend://docs/quickstart', description: 'Passo a passo minimo da integracao.' },
  { uri: 'ultrazend://docs/domain-authentication', description: 'Guia de SPF, DKIM, DMARC e MAIL FROM.' },
  { uri: 'ultrazend://docs/webhooks', description: 'Guia de assinatura, retries e idempotencia.' },
  { uri: 'ultrazend://docs/mcp', description: 'Como conectar IDEs com IA ao servidor.' },
  { uri: 'ultrazend://account/summary', description: 'Estado atual da conta autenticada.' },
]

export interface McpPromptDoc {
  name: string
  description: string
  args: string
}

export const mcpPrompts: McpPromptDoc[] = [
  {
    name: 'integrate_ultrazend_transactional_email',
    description: 'Onboarding tecnico completo: dominio, webhook e primeiro envio.',
    args: 'framework, language (opcionais)',
  },
  {
    name: 'configure_ultrazend_domain_authentication',
    description: 'Focado no setup DNS do dominio do cliente.',
    args: 'domain (obrigatorio)',
  },
  {
    name: 'implement_ultrazend_webhooks',
    description: 'Focado em um consumidor de webhook com validacao de assinatura.',
    args: 'framework (opcional)',
  },
]

/* ------------------------------------------------------------------ */
/* Snippets                                                            */
/* ------------------------------------------------------------------ */

export const curlSendSnippet = () => `curl --request POST '${getDocsApiBase()}/emails/send' \\
  --header 'x-api-key: re_sua_chave_aqui' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "from": "no-reply@seu-dominio.com",
    "to": "cliente@empresa.com",
    "subject": "Pedido confirmado",
    "html": "<h1>Pedido confirmado</h1><p>Seu pedido #1048 foi recebido.</p>",
    "text": "Pedido confirmado. Seu pedido #1048 foi recebido.",
    "tracking_enabled": true
  }'`

export const nodeSendSnippet = () => `const response = await fetch('${getDocsApiBase()}/emails/send', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.VELOMAIL_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'no-reply@seu-dominio.com',
    to: 'cliente@empresa.com',
    subject: 'Pedido confirmado',
    html: '<h1>Pedido confirmado</h1><p>Seu pedido #1048 foi recebido.</p>',
    text: 'Pedido confirmado. Seu pedido #1048 foi recebido.',
  }),
})

const result = await response.json()

if (!response.ok) {
  // result.code traz o motivo: DOMAIN_NOT_VERIFIED, RATE_LIMIT_EXCEEDED, ...
  throw new Error(\`VeloMail \${response.status}: \${result.error}\`)
}

console.log(result.message_id)`

export const pythonSendSnippet = () => `import os
import requests

response = requests.post(
    "${getDocsApiBase()}/emails/send",
    headers={
        "x-api-key": os.environ["VELOMAIL_API_KEY"],
        "Content-Type": "application/json",
    },
    json={
        "from": "no-reply@seu-dominio.com",
        "to": "cliente@empresa.com",
        "subject": "Pedido confirmado",
        "html": "<h1>Pedido confirmado</h1><p>Seu pedido #1048 foi recebido.</p>",
        "text": "Pedido confirmado. Seu pedido #1048 foi recebido.",
    },
    timeout=15,
)

response.raise_for_status()
print(response.json()["message_id"])`

export const phpSendSnippet = () => `<?php
$payload = [
    'from' => 'no-reply@seu-dominio.com',
    'to' => 'cliente@empresa.com',
    'subject' => 'Pedido confirmado',
    'html' => '<h1>Pedido confirmado</h1><p>Seu pedido #1048 foi recebido.</p>',
    'text' => 'Pedido confirmado. Seu pedido #1048 foi recebido.',
];

$ch = curl_init('${getDocsApiBase()}/emails/send');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'x-api-key: ' . getenv('VELOMAIL_API_KEY'),
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
]);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);

echo $response['message_id'];`

export const sendResponseSnippet = () => `{
  "success": true,
  "message": "Email enviado com sucesso",
  "message_id": "<uz-01JQ-exemplo@velomail.com.br>",
  "status": "queued",
  "domain_verified": true,
  "domain": "seu-dominio.com",
  "version": "3.0"
}`

export const sendErrorSnippet = () => `{
  "success": false,
  "error": "Dominio seu-dominio.com nao esta verificado",
  "code": "DOMAIN_NOT_VERIFIED",
  "domain": "seu-dominio.com",
  "version": "3.0",
  "redirect": "/domains"
}`

export const batchSendSnippet = () => `curl --request POST '${getDocsApiBase()}/emails/send-batch' \\
  --header 'x-api-key: re_sua_chave_aqui' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "emails": [
      {
        "from": "no-reply@seu-dominio.com",
        "to": "ana@empresa.com",
        "subject": "Pedido confirmado",
        "html": "<p>Ola Ana, seu pedido foi recebido.</p>"
      },
      {
        "from": "no-reply@seu-dominio.com",
        "to": "bruno@empresa.com",
        "subject": "Pedido confirmado",
        "html": "<p>Ola Bruno, seu pedido foi recebido.</p>"
      }
    ]
  }'`

export const batchResponseSnippet = () => `{
  "success": true,
  "message": "Batch processed with simplified architecture",
  "total_emails": 2,
  "successful_emails": 1,
  "failed_emails": 1,
  "results": [
    { "index": 0, "success": true, "message_id": "<uz-01JQ-a@velomail.com.br>", "status": "queued", "domain": "seu-dominio.com" },
    { "index": 1, "success": false, "error": "Dominio nao verificado" }
  ],
  "version": "3.0"
}`

export const webhookPayloadSnippet = () => `{
  "event": "email.delivered",
  "timestamp": "2026-09-20T14:30:00.000Z",
  "webhook_id": "18",
  "tenant_id": 7,
  "data": {
    "email_id": 152,
    "message_id": "<uz-01JQ-exemplo@velomail.com.br>",
    "tracking_id": "trk_01JQEXEMPLO",
    "from": "no-reply@seu-dominio.com",
    "to": "cliente@empresa.com",
    "subject": "Pedido confirmado",
    "status": "delivered",
    "template_id": null,
    "template_data": null,
    "error_message": null,
    "link_url": null,
    "accepted_by_server": true,
    "source": "email_pipeline",
    "domain": "seu-dominio.com",
    "triggered_by": "system",
    "occurred_at": "2026-09-20T14:30:00.000Z"
  }
}`

export const webhookVerifySnippet = () => `import crypto from 'node:crypto'
import express from 'express'

const app = express()

// Guarde o corpo BRUTO: a assinatura e calculada sobre os bytes originais.
app.post('/webhooks/velomail', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.header('X-Webhook-Signature') ?? ''
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.VELOMAIL_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex')

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).end()
  }

  const payload = JSON.parse(req.body.toString('utf8'))

  // Responda 2xx rapido; processe de forma idempotente por
  // event + data.message_id + timestamp, porque ha retries.
  enqueue(payload)

  res.status(200).end()
})`

export const webhookPythonVerifySnippet = () => `import hashlib
import hmac
import os

from flask import Flask, request

app = Flask(__name__)

@app.post("/webhooks/velomail")
def velomail_webhook():
    raw_body = request.get_data()  # bytes originais, sem reserializar
    expected = "sha256=" + hmac.new(
        os.environ["VELOMAIL_WEBHOOK_SECRET"].encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(request.headers.get("X-Webhook-Signature", ""), expected):
        return "", 401

    payload = request.get_json()
    enqueue(payload)  # processe de forma idempotente
    return "", 200`

export const cursorConfigSnippet = () => JSON.stringify(
  {
    mcpServers: {
      VeloMail: {
        url: getDocsMcpEndpoint(),
        headers: {
          'x-api-key': 'uai_sua_ai_agent_key',
        },
      },
    },
  },
  null,
  2,
)

export const vscodeConfigSnippet = () => JSON.stringify(
  {
    servers: {
      velomail: {
        type: 'http',
        url: getDocsMcpEndpoint(),
        headers: {
          'x-api-key': 'uai_sua_ai_agent_key',
        },
      },
    },
  },
  null,
  2,
)

export const claudeConfigSnippet = () => `claude mcp add --transport http velomail ${getDocsMcpEndpoint()} \\
  --header "x-api-key: uai_sua_ai_agent_key"`

export const mcpHandshakeSnippet = () => `curl --request POST '${getDocsMcpEndpoint()}' \\
  --header 'x-api-key: uai_sua_ai_agent_key' \\
  --header 'Content-Type: application/json' \\
  --header 'Accept: application/json, text/event-stream' \\
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'`

export const dnsRecordsSnippet = () => `; Publique no DNS do seu dominio. Os valores exatos aparecem
; em /app/domains depois de iniciar o setup.

uz-mail.seu-dominio.com.   TXT   "v=spf1 include:velomail.com.br ~all"
velomail._domainkey.seu-dominio.com.   TXT   "v=DKIM1; k=rsa; p=MIGfMA0G..."
_dmarc.seu-dominio.com.    TXT   "v=DMARC1; p=none; rua=mailto:dmarc@seu-dominio.com"`

export const agentPromptSnippet = () => `Integre a VeloMail nesta aplicacao usando o servidor MCP conectado.

1. Leia o resource ultrazend://docs/quickstart e rode account_overview
   antes de escrever qualquer codigo.
2. Se o dominio nao estiver verificado, use domain_setup e domain_verify
   e me diga exatamente quais registros DNS publicar.
3. Crie uma API key padrao re_... com api_key_create, escopo email:send,
   e leia o valor de uma variavel de ambiente VELOMAIL_API_KEY.
   Nunca escreva a chave no codigo.
4. Implemente o envio transacional e um consumidor de webhook com
   validacao HMAC SHA256 do header X-Webhook-Signature.
5. Rode send_test_email e me diga o que ainda bloqueia producao.`
