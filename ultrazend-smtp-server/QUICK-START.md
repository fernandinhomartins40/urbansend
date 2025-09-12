# 🚀 Quick Start - UltraZend SMTP Server

## ⚡ 5 Minutos para Servidor de Email Próprio

### 1. Instalar e Compilar

```bash
cd ultrazend-smtp-server
npm install
npm run build
```

### 2. Executar Migrations

```bash
node dist/migrations/migrate.js ./meu-smtp.sqlite
```

### 3. Usar na Sua Aplicação

```javascript
const { SMTPServer } = require('./dist/index.js');

async function iniciarServidorEmail() {
  const server = new SMTPServer({
    hostname: 'mail.meusite.com',
    mxPort: 25,           // Recebe emails
    submissionPort: 587,  // Clientes enviam
    databasePath: './meu-smtp.sqlite',
    authRequired: true
  });

  // Iniciar servidor
  await server.start();

  // Criar usuário SMTP
  const userId = await server.createUser(
    'admin@meusite.com',
    'senha123',
    'Admin'
  );

  // Adicionar domínio
  await server.addDomain('meusite.com', userId);

  // Configurar DKIM
  const dnsRecord = await server.setupDKIM('meusite.com');
  console.log('📋 DNS DKIM:', dnsRecord);

  console.log('✅ Servidor de email próprio rodando!');
}

iniciarServidorEmail();
```

### 4. Enviar Emails

```javascript
const nodemailer = require('nodemailer');

// Usar SEU servidor SMTP
const transporter = nodemailer.createTransporter({
  host: 'mail.meusite.com',
  port: 587,
  auth: {
    user: 'admin@meusite.com',
    pass: 'senha123'
  }
});

// Enviar email - VAI ENTREGAR DIRETAMENTE!
await transporter.sendMail({
  from: 'noreply@meusite.com',
  to: 'usuario@gmail.com',
  subject: 'Email do meu servidor próprio!',
  html: '<h1>Funcionou!</h1><p>Este email foi enviado pelo meu próprio servidor SMTP!</p>'
});
```

### 5. Configurar DNS

Adicione estes registros no seu DNS:

```bash
# MX Record
meusite.com.  IN  MX  10  mail.meusite.com.

# A Record
mail.meusite.com.  IN  A  SEU.IP.AQUI

# SPF Record
meusite.com.  IN  TXT  "v=spf1 mx ~all"

# DKIM Record (gerado automaticamente)
default._domainkey.meusite.com.  IN  TXT  "v=DKIM1; k=rsa; p=..."
```

## 🎯 Isso é Tudo!

Agora você tem:
- ✅ Servidor SMTP próprio rodando
- ✅ Entrega direta de emails (sem terceiros!)
- ✅ Autenticação de usuários
- ✅ Assinatura DKIM automática
- ✅ Banco de dados para logs
- ✅ Processamento de emails entrada/saída

## 🧪 Testar Rapidamente

```bash
# Servidor de teste (portas não privilegiadas)
npm run start:server

# Testar com exemplo completo
node example-usage.js
```

## 📚 Documentação Completa

Veja `README.md` para configurações avançadas, produção, Docker, etc.

---

**💡 DIFERENCIAL:** Este é um SERVIDOR DE EMAIL completo, não um cliente. Você tem controle total sobre a entrega!