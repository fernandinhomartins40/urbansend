# @ultrazend/smtp-internal

🚀 **Módulo SMTP interno para aplicações Node.js** - Sistema completo para emails de verificação, reset de senha e notificações do sistema.

## ✨ Características

- ✅ **Plug & Play** - Zero configuração, funciona out-of-the-box
- ✅ **TypeScript nativo** - Tipagem completa
- ✅ **Templates responsivos** - HTML profissional incluído
- ✅ **Banco próprio** - SQLite integrado, não interfere com seu schema
- ✅ **Migrations automáticas** - Setup automático do banco
- ✅ **Logs estruturados** - Debug fácil e completo
- ✅ **SMTP flexível** - Funciona com qualquer provedor

## 📦 Instalação

```bash
npm install @ultrazend/smtp-internal
```

## 🚀 Uso Rápido

### Configuração Básica

```typescript
import UltraZendSMTP from '@ultrazend/smtp-internal';

const emailService = new UltraZendSMTP({
  smtp: {
    host: 'localhost',
    port: 587,
    secure: false,
    user: 'seu-email@smtp.com',
    password: 'sua-senha'
  },
  defaultFrom: 'noreply@suaapp.com',
  appName: 'Minha App',
  appUrl: 'https://minhaapp.com'
});

// Inicializar (executa migrations)
await emailService.initialize();
```

### Email de Verificação

```typescript
const result = await emailService.sendVerificationEmail(
  'usuario@email.com',
  'João Silva', 
  'token-verificacao-123'
);

if (result.success) {
  console.log('Email enviado!', result.messageId);
} else {
  console.error('Erro:', result.error);
}
```

### Email de Reset de Senha

```typescript
const result = await emailService.sendPasswordResetEmail(
  'usuario@email.com',
  'João Silva',
  'https://minhaapp.com/reset-senha?token=abc123'
);
```

### Notificação do Sistema

```typescript
await emailService.sendSystemNotification('usuario@email.com', {
  type: 'welcome',
  title: 'Bem-vindo!',
  message: 'Sua conta foi criada com sucesso.',
  actionUrl: 'https://minhaapp.com/dashboard',
  actionText: 'Acessar Dashboard'
});
```

## ⚙️ Configuração Completa

```typescript
import UltraZendSMTP from '@ultrazend/smtp-internal';

const emailService = new UltraZendSMTP({
  // Configuração SMTP
  smtp: {
    host: 'smtp.gmail.com',     // Servidor SMTP
    port: 587,                  // Porta
    secure: false,              // true para 465, false para outras portas
    user: 'seu-email@gmail.com', // Usuário
    password: 'sua-senha'       // Senha ou App Password
  },

  // Configuração do banco de dados
  database: './meu-banco.sqlite', // ou configuração Knex completa

  // Configuração da aplicação
  defaultFrom: 'noreply@minhaapp.com',
  appName: 'Minha Aplicação',
  appUrl: 'https://minhaapp.com',

  // Templates customizados (opcional)
  templates: {
    verification: './custom-verification.html',
    passwordReset: './custom-reset.html',
    notification: './custom-notification.html'
  },

  // Configuração de logs
  logger: {
    enabled: true,
    level: 'info' // error, warn, info, debug
  }
});
```

## 🎨 Templates Customizados

Os templates usam um sistema simples de variáveis:

### Template de Verificação
```html
<!DOCTYPE html>
<html>
<body>
  <h1>{{appName}}</h1>
  <p>Olá {{name}}!</p>
  <a href="{{actionUrl}}">Verificar Email</a>
</body>
</html>
```

### Variáveis Disponíveis
- `{{appName}}` - Nome da aplicação
- `{{appUrl}}` - URL da aplicação  
- `{{name}}` - Nome do usuário
- `{{actionUrl}}` - URL de ação (verificação/reset)
- `{{title}}` - Título (notificações)
- `{{message}}` - Mensagem (notificações)
- `{{actionText}}` - Texto do botão (notificações)

## 🗄️ Banco de Dados

O módulo cria automaticamente uma tabela `emails` para log dos envios:

```sql
CREATE TABLE emails (
  id INTEGER PRIMARY KEY,
  message_id TEXT UNIQUE,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  email_type TEXT, -- verification, password_reset, notification
  status TEXT,     -- pending, sent, failed
  sent_at DATETIME,
  error_message TEXT,
  attempts INTEGER
);
```

### Consultando Emails Enviados

```typescript
const db = emailService.getDatabase();

// Emails dos últimos 7 dias
const recentEmails = await db('emails')
  .where('sent_at', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  .orderBy('sent_at', 'desc');

// Estatísticas
const stats = await db('emails')
  .count('* as total')
  .count('id as sent').where('status', 'sent')
  .count('id as failed').where('status', 'failed')
  .first();
```

## 🔧 APIs Avançadas

### Uso Modular

```typescript
import { 
  InternalEmailService, 
  MigrationRunner,
  SMTPDeliveryService 
} from '@ultrazend/smtp-internal';

// Apenas o serviço de email
const emailService = new InternalEmailService({
  smtp: { host: 'localhost', port: 587 },
  defaultFrom: 'noreply@app.com'
});

// Apenas migrations
const migrationRunner = new MigrationRunner('./banco.sqlite');
await migrationRunner.runMigrations();

// Apenas SMTP
const smtpService = new SMTPDeliveryService({
  host: 'smtp.gmail.com',
  port: 587
});
```

### Teste de Conectividade

```typescript
const isOnline = await emailService.testConnection();
if (!isOnline) {
  console.error('SMTP não está funcionando!');
}
```

### Cleanup

```typescript
// Fechar conexões ao encerrar aplicação
process.on('SIGTERM', async () => {
  await emailService.close();
  process.exit(0);
});
```

## 📋 Exemplos Práticos

### Express.js

```typescript
import express from 'express';
import UltraZendSMTP from '@ultrazend/smtp-internal';

const app = express();
const emailService = new UltraZendSMTP({
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD
  },
  defaultFrom: process.env.DEFAULT_FROM_EMAIL,
  appName: 'Minha API',
  appUrl: process.env.APP_URL
});

// Inicializar ao startar servidor
app.listen(3000, async () => {
  await emailService.initialize();
  console.log('Servidor rodando com emails configurados!');
});

// Rota de registro
app.post('/register', async (req, res) => {
  const { email, name } = req.body;
  
  // ... lógica de registro ...
  
  const token = generateVerificationToken();
  
  const result = await emailService.sendVerificationEmail(email, name, token);
  
  if (result.success) {
    res.json({ message: 'Usuário criado! Verifique seu email.' });
  } else {
    res.status(500).json({ error: 'Erro ao enviar email de verificação' });
  }
});
```

### Fastify

```typescript
import Fastify from 'fastify';
import UltraZendSMTP from '@ultrazend/smtp-internal';

const fastify = Fastify();

// Plugin do email
fastify.register(async (fastify) => {
  const emailService = new UltraZendSMTP({
    smtp: {
      host: 'localhost',
      port: 587
    },
    defaultFrom: 'noreply@app.com',
    appName: 'FastifyApp'
  });

  await emailService.initialize();
  
  fastify.decorate('emailService', emailService);
});

// Usar nos handlers
fastify.post('/forgot-password', async (request, reply) => {
  const { email } = request.body;
  
  const resetUrl = `https://app.com/reset?token=${token}`;
  
  await fastify.emailService.sendPasswordResetEmail(email, 'Usuario', resetUrl);
  
  return { message: 'Email de reset enviado!' };
});
```

## 🛠️ Desenvolvimento

### Clonar e Testar

```bash
git clone https://github.com/ultrazend/smtp-internal
cd smtp-internal
npm install
npm run build
npm test
```

### Estrutura do Projeto

```
ultrazend-smtp-module/
├── src/
│   ├── services/           # Serviços principais
│   ├── templates/          # Templates HTML e engine
│   ├── migrations/         # Migrations do banco
│   ├── utils/             # Utilitários  
│   ├── types/             # Tipos TypeScript
│   └── index.ts           # Export principal
├── dist/                  # Build compilado
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch: `git checkout -b minha-feature`
3. Commit: `git commit -m 'Adicionar feature'`
4. Push: `git push origin minha-feature`  
5. Abra um Pull Request

## 📄 Licença

MIT - veja [LICENSE](LICENSE) para detalhes.

## 🚀 Criado por UltraZend

Este módulo foi extraído do sistema de email interno da plataforma UltraZend e disponibilizado como módulo independente para a comunidade.

---

**💡 Dica:** Este módulo é perfeito para MVPs, protótipos e aplicações que precisam de emails internos simples e confiáveis sem a complexidade de integrações externas.