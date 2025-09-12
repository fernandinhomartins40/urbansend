# 🚀 Como Usar o Módulo @ultrazend/smtp-internal

## ⚡ Instalação e Teste Rápido

### 1. Preparar o Módulo

```bash
# Entre na pasta do módulo
cd ultrazend-smtp-module

# Instale dependências
npm install

# Compile o TypeScript
npm run build
```

### 2. Testar o Módulo

```bash
# Execute o exemplo
node example.js
```

## 📦 Usar em Outra Aplicação

### Opção 1: Copiar para node_modules (Teste Local)

```bash
# Na sua aplicação
mkdir -p node_modules/@ultrazend
cp -r ultrazend-smtp-module node_modules/@ultrazend/smtp-internal
```

### Opção 2: Link Local (Desenvolvimento)

```bash
# Na pasta do módulo
npm link

# Na sua aplicação
npm link @ultrazend/smtp-internal
```

### Opção 3: Publicar no NPM

```bash
# Na pasta do módulo
npm login
npm publish --access public
```

## 💻 Exemplo de Uso em Express

### 1. Instalar Express

```bash
npm init -y
npm install express
# Copie o módulo como descrito acima
```

### 2. Criar app.js

```javascript
const express = require('express');
const UltraZendSMTP = require('@ultrazend/smtp-internal').default;

const app = express();
app.use(express.json());

// Configurar emails
const emailService = new UltraZendSMTP({
  smtp: {
    host: 'localhost',
    port: 2525, // Use mailhog para testes
    secure: false
  },
  defaultFrom: 'noreply@meuapp.com',
  appName: 'Minha App',
  appUrl: 'http://localhost:3000'
});

// Inicializar ao startar
app.listen(3000, async () => {
  await emailService.initialize();
  console.log('🚀 Servidor rodando em http://localhost:3000');
  console.log('📧 Emails configurados!');
});

// Rota de teste - verificação
app.post('/send-verification', async (req, res) => {
  const { email, name, token } = req.body;
  
  const result = await emailService.sendVerificationEmail(email, name, token);
  
  res.json(result);
});

// Rota de teste - reset de senha  
app.post('/send-reset', async (req, res) => {
  const { email, name, resetUrl } = req.body;
  
  const result = await emailService.sendPasswordResetEmail(email, name, resetUrl);
  
  res.json(result);
});

// Rota de teste - notificação
app.post('/send-notification', async (req, res) => {
  const { email, notification } = req.body;
  
  const result = await emailService.sendSystemNotification(email, notification);
  
  res.json(result);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await emailService.close();
  process.exit(0);
});
```

### 3. Testar com cURL

```bash
# Verificação
curl -X POST http://localhost:3000/send-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@email.com",
    "name": "João",
    "token": "abc123"
  }'

# Reset de senha
curl -X POST http://localhost:3000/send-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@email.com", 
    "name": "João",
    "resetUrl": "http://localhost:3000/reset?token=xyz789"
  }'

# Notificação
curl -X POST http://localhost:3000/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@email.com",
    "notification": {
      "type": "welcome",
      "title": "Bem-vindo!",
      "message": "Sua conta foi criada.",
      "actionUrl": "http://localhost:3000/dashboard",
      "actionText": "Acessar"
    }
  }'
```

## 📧 Configurar SMTP Real

### Gmail

```javascript
const emailService = new UltraZendSMTP({
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'seu-email@gmail.com',
    password: 'sua-app-password' // Use App Password, não sua senha normal
  },
  defaultFrom: 'seu-email@gmail.com',
  appName: 'Minha App',
  appUrl: 'https://meusite.com'
});
```

### Outros Provedores

```javascript
// SendGrid
smtp: {
  host: 'smtp.sendgrid.net',
  port: 587,
  user: 'apikey',
  password: 'sua-api-key'
}

// Mailgun
smtp: {
  host: 'smtp.mailgun.org', 
  port: 587,
  user: 'postmaster@seu-dominio.mailgun.org',
  password: 'sua-senha'
}

// Amazon SES
smtp: {
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  user: 'seu-access-key',
  password: 'sua-secret-key'
}
```

## 🧪 Testar com MailHog (Desenvolvimento)

### 1. Instalar MailHog

```bash
# macOS
brew install mailhog

# Windows (com Chocolatey)
choco install mailhog

# Linux
wget https://github.com/mailhog/MailHog/releases/download/v1.0.0/MailHog_linux_amd64
chmod +x MailHog_linux_amd64
```

### 2. Executar MailHog

```bash
mailhog
```

### 3. Configurar Módulo

```javascript
const emailService = new UltraZendSMTP({
  smtp: {
    host: 'localhost',
    port: 1025, // Porta do MailHog
    secure: false
  }
});
```

### 4. Ver Emails

Acesse http://localhost:8025 para ver os emails capturados.

## 📁 Estrutura de Arquivos Gerados

```
sua-aplicacao/
├── node_modules/
│   └── @ultrazend/
│       └── smtp-internal/
├── emails.sqlite          # Banco de dados dos emails
├── app.js                 # Sua aplicação
└── package.json
```

## 🐛 Troubleshooting

### Erro: "Cannot find module"

```bash
# Verifique se o módulo foi copiado/linkado corretamente
ls -la node_modules/@ultrazend/smtp-internal

# Rebuilde se necessário
cd node_modules/@ultrazend/smtp-internal
npm run build
```

### SMTP não conecta

```javascript
// Teste a conexão
const isOnline = await emailService.testConnection();
console.log('SMTP OK:', isOnline);

// Verifique configurações
const config = emailService.getConfig();
console.log('Config SMTP:', config.smtp);
```

### Banco de dados locked

```javascript
// Feche a conexão corretamente
await emailService.close();
```

## 🎯 Próximos Passos

1. ✅ Copie o módulo para sua aplicação
2. ✅ Configure SMTP (use MailHog para testes)
3. ✅ Teste os 3 tipos de email
4. ✅ Personalize templates se necessário
5. ✅ Implemente em suas rotas de registro/login
6. ✅ Configure SMTP real para produção

## 🆘 Suporte

Se encontrar problemas:

1. Verifique os logs no console
2. Teste a conexão SMTP
3. Confirme que o arquivo foi compilado (`npm run build`)
4. Verifique as permissões do arquivo SQLite

---

**🚀 Pronto! Seu sistema de emails interno está funcionando!**