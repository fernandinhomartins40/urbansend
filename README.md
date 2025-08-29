# UrbanSend - Clone Profissional do Resend.com

Uma aplicação completa de email transacional com interface moderna, servidor SMTP próprio e todas as funcionalidades profissionais para gerenciamento de emails em massa.

## 🚀 Tecnologias

### Backend
- **Node.js** + **Express.js** + **TypeScript**
- **SQLite3** com Knex.js para migrations
- **JWT** + bcrypt para autenticação
- **Nodemailer** com servidor SMTP próprio
- **Bull** + Redis para sistema de filas
- **Zod** para validação
- **Winston** para logging
- **Swagger** para documentação da API
- **Socket.IO** para WebSocket

### Frontend
- **React 18** + **TypeScript**
- **Vite** como build tool
- **Tailwind CSS** + **shadcn/ui**
- **React Router** para roteamento
- **Zustand** para gerenciamento de estado
- **TanStack Query** para cache de dados
- **Axios** para requisições HTTP
- **React Hook Form** + Zod para formulários

## 📦 Instalação e Execução

### Pré-requisitos
- Node.js 18+
- Redis (para filas)
- Git

### 1. Clonar o repositório
```bash
git clone <repo-url>
cd urbansend
```

### 2. Instalar dependências

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd ../frontend
npm install
```

### 3. Configurar variáveis de ambiente

#### Backend (.env)
```bash
cd ../backend
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=./database.sqlite

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# SMTP
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Outros...
```

### 4. Configurar banco de dados
```bash
cd backend
npm run migrate:latest
```

### 5. Executar em desenvolvimento

#### Backend
```bash
cd backend
npm run dev
```

#### Frontend
```bash
cd frontend
npm run dev
```

### 6. Acessar a aplicação
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Documentação API**: http://localhost:3000/api-docs

## 🐳 Docker

### Execução com Docker Compose
```bash
# Construir e executar todos os serviços
docker-compose up --build

# Executar em background
docker-compose up -d

# Parar todos os serviços
docker-compose down
```

### Serviços disponíveis:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000
- **Redis**: http://localhost:6379
- **Redis Commander**: http://localhost:8081

## 🎯 Funcionalidades

### ✅ Implementadas
- [x] Sistema completo de autenticação (JWT + bcrypt)
- [x] Gerenciamento de usuários e perfis
- [x] Sistema de API Keys com permissões
- [x] Servidor SMTP próprio com Nodemailer
- [x] Sistema de filas (Bull + Redis) para processamento assíncrono
- [x] Tracking de emails (abertura e cliques)
- [x] Sistema de webhooks
- [x] Gerenciamento de templates
- [x] Verificação de domínios
- [x] Analytics básicas
- [x] Interface moderna com React + Tailwind
- [x] Layout responsivo
- [x] Documentação Swagger completa

### 🔄 Em desenvolvimento
- [ ] Editor visual de templates
- [ ] Charts avançados para analytics
- [ ] Sistema de notificações em tempo real
- [ ] Testes automatizados
- [ ] Cache avançado

## 📋 Estrutura do Banco de Dados

### Tabelas principais:
- **users**: Usuários da plataforma
- **api_keys**: Chaves de API com permissões
- **domains**: Domínios verificados
- **email_templates**: Templates de email
- **emails**: Log de todos os emails enviados
- **webhooks**: Configuração de webhooks
- **email_analytics**: Eventos de tracking

## 🔧 Scripts Disponíveis

### Backend
```bash
npm run dev          # Desenvolvimento com nodemon
npm run build        # Build para produção
npm start           # Executar versão de produção
npm run migrate:latest  # Executar migrations
npm run test        # Executar testes
npm run lint        # Verificar código
npm run typecheck   # Verificar tipos TypeScript
```

### Frontend
```bash
npm run dev         # Desenvolvimento
npm run build       # Build para produção
npm run preview     # Preview do build
npm run lint        # Verificar código
npm run typecheck   # Verificar tipos TypeScript
```

## 📚 API Endpoints

### Autenticação
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login
- `POST /api/auth/verify-email` - Verificar email
- `GET /api/auth/profile` - Perfil do usuário

### Emails
- `POST /api/emails/send` - Enviar email
- `POST /api/emails/send-batch` - Envio em lote
- `GET /api/emails` - Listar emails
- `GET /api/emails/:id` - Detalhes do email

### API Keys
- `GET /api/keys` - Listar chaves
- `POST /api/keys` - Criar chave
- `PUT /api/keys/:id` - Atualizar chave
- `DELETE /api/keys/:id` - Deletar chave

### Templates
- `GET /api/templates` - Listar templates
- `POST /api/templates` - Criar template
- `PUT /api/templates/:id` - Atualizar template
- `DELETE /api/templates/:id` - Deletar template

### Domínios
- `GET /api/domains` - Listar domínios
- `POST /api/domains` - Adicionar domínio
- `POST /api/domains/:id/verify` - Verificar domínio

### Analytics
- `GET /api/analytics/overview` - Métricas gerais
- `GET /api/analytics/emails` - Analytics de emails
- `GET /api/analytics/domains` - Performance por domínio

### Webhooks
- `GET /api/webhooks` - Listar webhooks
- `POST /api/webhooks` - Criar webhook
- `GET /api/webhooks/:id/logs` - Logs do webhook

## 🎨 Design System

### Paleta de Cores
- **Primary Black**: #0A0A0A
- **Primary Dark**: #1A1A1A
- **Primary Blue**: #3B82F6
- **Success Green**: #10B981
- **Danger Red**: #EF4444
- **Warning Yellow**: #F59E0B

### Typography
- **Fonte**: Inter (system-ui fallback)
- **H1**: 32px, font-weight 700
- **H2**: 24px, font-weight 600
- **H3**: 20px, font-weight 600
- **Body**: 16px, font-weight 400

### Spacing
Baseado em escala de 4px:
- 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px, 12: 48px, 16: 64px

## 🔐 Segurança

### Medidas implementadas:
- **Helmet.js** para headers de segurança
- **Rate limiting** por IP e por usuário
- **CORS** configurado adequadamente
- **Validação** de entrada com Zod
- **Sanitização** de HTML
- **JWT** com expiração
- **bcrypt** para hash de senhas
- **API Keys** com scoping de permissões
- **Webhook signatures** para verificação

## 📈 Performance

### Otimizações:
- **Sistema de filas** para processamento assíncrono
- **Caching** com Redis
- **Compressão gzip**
- **Lazy loading** de componentes
- **Image optimization**
- **Bundle splitting**
- **Database indexes**

## 🧪 Testes

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 🚀 Deploy

### Produção com Docker
1. Configure as variáveis de ambiente de produção
2. Execute: `docker-compose -f docker-compose.prod.yml up -d`

### Deploy manual
1. Configure servidor (Node.js + Redis + Nginx)
2. Build das aplicações
3. Configure reverse proxy
4. Configure SSL/TLS

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para detalhes.

## 📞 Suporte

Para suporte e dúvidas:
- Abra uma issue no GitHub
- Email: support@urbansend.com

---

**UrbanSend** - Clone profissional do Resend.com desenvolvido com as melhores práticas e tecnologias modernas.