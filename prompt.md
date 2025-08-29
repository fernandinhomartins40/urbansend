# Prompt Completo: Criar Clone Profissional do Resend.com

## Contexto e Objetivo
Você deve criar uma aplicação completa de email transacional idêntica ao Resend.com. Esta será uma plataforma de email marketing e transacional profissional com servidor SMTP próprio, rodando completamente na VPS do usuário. A aplicação deve ter qualidade de produção e interface moderna.

## Stack Tecnológica Obrigatória
- **Backend**: Node.js + Express.js
- **Banco de dados**: SQLite3 com migrations
- **Frontend**: React.js com TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Email**: Nodemailer com servidor SMTP próprio
- **Autenticação**: JWT + bcrypt
- **Validação**: Zod
- **API Documentation**: Swagger/OpenAPI
- **Build tool**: Vite
- **Teste**: Jest + React Testing Library

---

## PARTE 1: ESTRUTURA E CONFIGURAÇÃO

### Estrutura de Pastas Obrigatória
```
resend-clone/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── config/
│   │   └── migrations/
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   ├── lib/
│   │   └── styles/
│   ├── public/
│   └── package.json
├── docker-compose.yml
└── README.md
```

### Configuração Inicial OBRIGATÓRIA
1. **Backend setup**: Express.js com TypeScript, cors, helmet, rate-limiting
2. **Database setup**: SQLite3 com knex.js para migrations e queries
3. **Environment setup**: Arquivo .env com todas as variáveis necessárias
4. **SMTP setup**: Configuração de servidor SMTP próprio com Nodemailer
5. **Frontend setup**: React + TypeScript + Vite + Tailwind + shadcn/ui

---

## PARTE 2: BANCO DE DADOS

### Schemas das Tabelas (IMPLEMENTAR EXATAMENTE ASSIM)

**Tabela: users**
```sql
id (INTEGER PRIMARY KEY), email (TEXT UNIQUE), password_hash (TEXT), 
name (TEXT), created_at (DATETIME), updated_at (DATETIME), 
is_verified (BOOLEAN), plan_type (TEXT DEFAULT 'free')
```

**Tabela: api_keys**
```sql
id (INTEGER PRIMARY KEY), user_id (INTEGER FK), key_name (TEXT), 
api_key_hash (TEXT), permissions (TEXT), created_at (DATETIME), 
last_used_at (DATETIME), is_active (BOOLEAN DEFAULT true)
```

**Tabela: domains**
```sql
id (INTEGER PRIMARY KEY), user_id (INTEGER FK), domain_name (TEXT), 
verification_status (TEXT DEFAULT 'pending'), dns_records (TEXT), 
created_at (DATETIME), verified_at (DATETIME)
```

**Tabela: email_templates**
```sql
id (INTEGER PRIMARY KEY), user_id (INTEGER FK), template_name (TEXT), 
subject (TEXT), html_content (TEXT), text_content (TEXT), 
variables (TEXT), created_at (DATETIME), updated_at (DATETIME)
```

**Tabela: emails**
```sql
id (INTEGER PRIMARY KEY), user_id (INTEGER FK), api_key_id (INTEGER FK), 
template_id (INTEGER FK), from_email (TEXT), to_email (TEXT), 
subject (TEXT), html_content (TEXT), text_content (TEXT), 
status (TEXT), sent_at (DATETIME), delivered_at (DATETIME), 
opened_at (DATETIME), clicked_at (DATETIME), bounce_reason (TEXT), 
webhook_payload (TEXT)
```

**Tabela: webhooks**
```sql
id (INTEGER PRIMARY KEY), user_id (INTEGER FK), url (TEXT), 
events (TEXT), secret (TEXT), is_active (BOOLEAN DEFAULT true), 
created_at (DATETIME)
```

**Tabela: email_analytics**
```sql
id (INTEGER PRIMARY KEY), email_id (INTEGER FK), event_type (TEXT), 
timestamp (DATETIME), user_agent (TEXT), ip_address (TEXT), 
metadata (TEXT)
```

---

## PARTE 3: API ENDPOINTS OBRIGATÓRIOS

### Autenticação
- `POST /api/auth/register` - Registro com email verification
- `POST /api/auth/login` - Login com JWT
- `POST /api/auth/verify-email` - Verificação de email
- `POST /api/auth/forgot-password` - Recuperação de senha
- `POST /api/auth/reset-password` - Reset de senha

### API Keys Management  
- `GET /api/keys` - Listar todas as chaves do usuário
- `POST /api/keys` - Criar nova chave com permissões
- `PUT /api/keys/:id` - Atualizar permissões da chave
- `DELETE /api/keys/:id` - Deletar chave

### Email Sending (CORE FUNCTIONALITY)
- `POST /api/emails/send` - Endpoint principal para enviar email
- `POST /api/emails/send-batch` - Envio em lote (até 100 emails)
- `GET /api/emails` - Listar emails com filtros e paginação
- `GET /api/emails/:id` - Detalhes completos de um email
- `GET /api/emails/:id/analytics` - Analytics específicas do email

### Templates
- `GET /api/templates` - Listar templates do usuário
- `POST /api/templates` - Criar novo template
- `GET /api/templates/:id` - Obter template específico
- `PUT /api/templates/:id` - Atualizar template
- `DELETE /api/templates/:id` - Deletar template

### Domains
- `GET /api/domains` - Listar domínios do usuário  
- `POST /api/domains` - Adicionar novo domínio
- `POST /api/domains/:id/verify` - Verificar configuração DNS
- `DELETE /api/domains/:id` - Remover domínio

### Analytics
- `GET /api/analytics/overview` - Dashboard metrics (30 dias)
- `GET /api/analytics/emails` - Métricas detalhadas com filtros
- `GET /api/analytics/domains` - Performance por domínio

### Webhooks
- `GET /api/webhooks` - Listar webhooks
- `POST /api/webhooks` - Criar webhook
- `PUT /api/webhooks/:id` - Atualizar webhook  
- `DELETE /api/webhooks/:id` - Deletar webhook
- `GET /api/webhooks/:id/logs` - Logs de tentativas

---

## PARTE 4: FUNCIONALIDADES CORE DO BACKEND

### Sistema de Envio de Email (CRÍTICO)
1. **Configurar Nodemailer** com servidor SMTP próprio
2. **Sistema de retry** - 3 tentativas com backoff exponencial
3. **Validação de emails** - Syntax e verificação de MX record
4. **Rate limiting** - Por usuário e por API key
5. **Template processing** - Substituição de variáveis dinâmicas
6. **Queue system** - Para processamento assíncrono (use Bull/Agenda)
7. **Bounce handling** - Detectar e processar bounces
8. **DKIM signing** - Assinar emails para melhor deliverabilidade

### Sistema de Tracking (OBRIGATÓRIO)
1. **Pixel de abertura** - Imagem 1x1 transparente única por email
2. **Link tracking** - Redirect através do servidor para rastrear clicks
3. **Webhook dispatch** - Notificações em tempo real
4. **Analytics storage** - Salvar todos os eventos no banco

### Autenticação e Segurança
1. **JWT middleware** - Verificação de token em rotas protegidas
2. **API key middleware** - Autenticação via API key
3. **Rate limiting** - express-rate-limit por endpoint
4. **Input validation** - Zod schemas para todos os inputs
5. **SQL injection protection** - Prepared statements obrigatório
6. **CORS configuration** - Configuração adequada

### Verificação de Domínios (IMPLEMENTAR)
1. **DNS records generator** - Gerar SPF, DKIM, DMARC records
2. **DNS verification** - Verificar se records estão configurados
3. **Health monitoring** - Check periódico da saúde dos domínios

---

## PARTE 5: DESIGN SYSTEM E UI (SEGUIR EXATAMENTE)

### Paleta de Cores OBRIGATÓRIA
```css
/* Cores principais */
--primary-black: #0A0A0A;
--primary-dark: #1A1A1A;  
--primary-blue: #3B82F6;
--success-green: #10B981;
--danger-red: #EF4444;
--warning-yellow: #F59E0B;

/* Escala de cinzas */
--gray-50: #F8FAFC;
--gray-100: #F1F5F9;
--gray-200: #E2E8F0;
--gray-300: #CBD5E1;
--gray-400: #94A3B8;
--gray-500: #64748B;
--gray-600: #475569;
--gray-700: #334155;
--gray-800: #1E293B;
--gray-900: #0F172A;
```

### Typography System
```css
/* Font Stack */
font-family: 'Inter', system-ui, -apple-system, sans-serif;

/* Headings */
h1: font-size: 32px, font-weight: 700, line-height: 1.2
h2: font-size: 24px, font-weight: 600, line-height: 1.3  
h3: font-size: 20px, font-weight: 600, line-height: 1.4
h4: font-size: 18px, font-weight: 500, line-height: 1.4

/* Body text */
body: font-size: 16px, font-weight: 400, line-height: 1.5
small: font-size: 14px, font-weight: 400, line-height: 1.4
```

### Spacing System (Usar apenas estes valores)
```css
/* Spacing scale baseado em 4px */
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-12: 48px; --space-16: 64px;
```

---

## PARTE 6: PÁGINAS E COMPONENTES (IMPLEMENTAR TODOS)

### Layout Principal OBRIGATÓRIO
```jsx
// Header fixo (altura: 64px)
<Header>
  <Logo /> {/* Lado esquerdo */}
  <Navigation /> {/* Centro: Dashboard, Emails, Templates, Domains, Analytics */}
  <UserMenu /> {/* Direita: Avatar, configurações, logout */}
</Header>

// Main content com max-width: 1200px, padding responsivo
<MainContent>
  <Breadcrumbs /> {/* Navegação hierárquica */}
  <PageContent /> {/* Conteúdo específico da página */}
</MainContent>
```

### 1. Dashboard/Overview (PÁGINA INICIAL)
**Estrutura obrigatória:**
- **Hero metrics**: 4 cards em grid
  - Total emails (últimos 30 dias)
  - Delivery rate (%)
  - Open rate (%)
  - Bounce rate (%)
- **Chart principal**: Line chart com volume diário
- **Recent activity**: Lista dos últimos 10 emails com status visual
- **Quick actions**: Botões para "Send Email", "Create Template", "Add Domain"

### 2. Email List (/emails)
**Funcionalidades obrigatórias:**
- **Filtros superiores**: Search, date range, status, domain
- **Tabela responsiva**: Status icon, Subject, To, From, Sent time, Actions
- **Paginação**: Previous/Next + page numbers
- **Bulk actions**: Select multiple emails para ações em lote
- **Real-time status**: WebSocket para updates em tempo real

### 3. Template Editor (/templates)
**Layout obrigatório:**
- **Sidebar esquerda**: Lista de templates existentes
- **Editor centro**: Tabs (Visual, HTML, Preview)
- **Panel direita**: Variables manager, settings
- **Visual editor**: Rich text com toolbar completa
- **Variable system**: {{variable}} syntax com autocomplete

### 4. API Keys (/api-keys)
**Implementar exatamente:**
- **Cards layout**: Cada key em card separado
- **Key display**: Mostrar apenas prefixo (re_...), botão para revelar
- **Permissions**: Checkboxes para diferentes scopes
- **Usage stats**: Last used, total requests
- **Security**: Confirmação para delete, regenerate

### 5. Domains (/domains)  
**Funcionalidades críticas:**
- **Domain cards**: Status visual (verified/pending)
- **DNS setup wizard**: Step-by-step guide
- **Records display**: SPF, DKIM, DMARC com copy buttons
- **Verification button**: Re-check DNS status
- **Health monitoring**: Domain reputation score

### 6. Analytics (/analytics)
**Charts obrigatórios:**
- **Time series**: Email volume over time
- **Donut chart**: Delivery vs bounce rates
- **Bar chart**: Performance by domain
- **Heatmap**: Activity by hour/day of week
- **Geographic map**: Opens by country (se possível)

### 7. Webhooks (/webhooks)
**Implementar todas:**
- **Webhook list**: URL, events, status, last success
- **Create form**: URL validation, event selection
- **Test functionality**: Send test webhook
- **Logs viewer**: Request/response history
- **Retry mechanism**: Failed webhook retry

---

## PARTE 7: COMPONENTES UI ESPECÍFICOS

### Componentes Obrigatórios (usar shadcn/ui como base)
```jsx
// Navigation
<Breadcrumbs items={[]} />
<Tabs defaultValue="overview" />
<Steps current={2} total={4} />

// Forms  
<Input placeholder="Enter email..." />
<Select options={[]} />
<Switch checked={true} />
<FileUpload accept=".html,.txt" />
<FormField error="Required field" />

// Data Display
<DataTable columns={[]} data={[]} />
<Card title="Metrics" actions={<Button />} />
<Chart type="line" data={[]} />
<Badge variant="success">Delivered</Badge>
<StatusIcon status="delivered" />

// Feedback
<LoadingSkeleton />
<EmptyState title="No emails found" />
<ErrorState message="Failed to load" />
<Toast type="success" message="Email sent!" />
```

### Estados Visuais OBRIGATÓRIOS
```jsx
// Loading States
<TableSkeleton rows={5} />
<CardSkeleton />
<ChartSkeleton />

// Empty States  
<EmptyEmails />
<EmptyTemplates />
<EmptyDomains />

// Error States
<ErrorBoundary />
<FailedToLoad />
<NetworkError />
```

---

## PARTE 8: RESPONSIVIDADE (IMPLEMENTAR TODOS OS BREAKPOINTS)

### Breakpoints Obrigatórios
```css
/* Mobile */
@media (max-width: 767px) {
  /* Sidebar vira hamburger menu */
  /* Tabelas viram cards empilhados */  
  /* Charts adaptam altura */
  /* Touch-friendly buttons (44px+) */
}

/* Tablet */
@media (768px - 1023px) {
  /* Layout híbrido */
  /* Sidebar colapsável */
}

/* Desktop */
@media (1024px+) {
  /* Layout completo */
  /* Sidebar fixa */
}
```

---

## PARTE 9: FUNCIONALIDADES AVANÇADAS

### Sistema de Queue (OBRIGATÓRIO)
- Usar Bull/Agenda para processamento assíncrono
- Jobs: email sending, webhook dispatch, analytics processing
- Retry logic com backoff exponencial
- Job monitoring dashboard

### Real-time Updates
- WebSocket para status de emails em tempo real
- Live analytics updates
- Notification system

### Security Measures (IMPLEMENTAR TODAS)
- Rate limiting por endpoint
- API key scoping e permissions
- Input sanitization
- SQL injection prevention
- XSS protection
- CSRF tokens

---

## PARTE 10: INSTRUÇÕES DE IMPLEMENTAÇÃO

### Ordem de Desenvolvimento OBRIGATÓRIA
1. **Fase 1**: Setup inicial + banco + autenticação básica
2. **Fase 2**: Sistema de envio de email + API core
3. **Fase 3**: Frontend básico + dashboard  
4. **Fase 4**: Templates + editor
5. **Fase 5**: Analytics + tracking
6. **Fase 6**: Domains + DNS verification
7. **Fase 7**: Webhooks + advanced features
8. **Fase 8**: Tests + optimization + deployment

### Padrões de Código OBRIGATÓRIOS
- **TypeScript**: Strict mode, interfaces para tudo
- **Error handling**: Try/catch em todas as async functions
- **Validation**: Zod schemas para request/response
- **Logging**: Winston para logs estruturados  
- **Testing**: Cobertura mínima 80%
- **Documentation**: JSDoc em funções complexas

### Performance Requirements
- **API response time**: < 200ms para endpoints simples
- **Email sending**: < 5 segundos para processamento
- **Frontend load**: < 2 segundos para first paint
- **Database queries**: Indexes em todas as foreign keys

---

## INSTRUÇÕES FINAIS PARA IA

**VOCÊ DEVE:**
1. Implementar EXATAMENTE como especificado
2. Usar APENAS as tecnologias mencionadas
3. Seguir a estrutura de pastas obrigatória
4. Implementar TODOS os endpoints da API
5. Criar TODAS as páginas frontend mencionadas
6. Seguir o design system à risca
7. Implementar responsividade completa
8. Incluir error handling robusto
9. Adicionar validação em todos os inputs
10. Criar testes unitários básicos

**NÃO FAÇA:**
1. Usar bibliotecas não mencionadas sem perguntar
2. Pular funcionalidades "para simplificar"
3. Alterar a estrutura do banco de dados
4. Ignorar aspectos de segurança
5. Criar UI diferente do especificado

**RESULTADO ESPERADO:**
Uma aplicação completa, funcional e profissional, idêntica ao Resend.com em funcionalidades e visual, rodando completamente na VPS do usuário com servidor SMTP próprio.