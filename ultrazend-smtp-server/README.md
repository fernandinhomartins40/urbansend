# @ultrazend/smtp-server

🚀 **Servidor SMTP Completo Independente** - Mini UltraZend para qualquer aplicação Node.js

## ✨ O QUE ESTE MÓDULO FAZ

Este é um **SERVIDOR DE EMAIL SMTP COMPLETO** que você pode copiar e colar em qualquer aplicação. Não é um cliente - é um servidor real que:

- ✅ **Aceita conexões SMTP** nas portas 25 (MX) e 587 (Submission)
- ✅ **Entrega emails diretamente** via MX records (sem depender de provedores!)
- ✅ **Gerencia seus próprios domínios** com DKIM, SPF
- ✅ **Autentica usuários** para envio
- ✅ **Processa emails** de entrada e saída
- ✅ **Banco de dados próprio** (SQLite) para logs e configurações
- ✅ **DKIM automático** para autenticação
- ✅ **TypeScript nativo** com tipagem completa

## 🎯 QUANDO USAR

- ✅ Você quer um servidor de email próprio na sua aplicação
- ✅ Não quer depender de SendGrid, Mailgun, etc.
- ✅ Precisa de controle total sobre entrega de emails
- ✅ Quer processar emails recebidos
- ✅ Aplicações que precisam de alta disponibilidade
- ✅ Compliance ou regulamentações específicas

## 📦 Instalação

```bash
npm install @ultrazend/smtp-server
```

## 🚀 Uso Rápido

### Servidor Básico

```typescript
import { SMTPServer } from '@ultrazend/smtp-server';

const server = new SMTPServer({
  hostname: 'mail.meusite.com',
  mxPort: 25,           // Recebe emails de outros servidores
  submissionPort: 587,  // Clientes enviam emails
  databasePath: './emails.sqlite'
});

// Iniciar servidor
await server.start();
console.log('📧 Servidor SMTP rodando!');
```

### Setup Completo com Usuário e Domínio

```typescript
import { SMTPServer } from '@ultrazend/smtp-server';

async function setupEmailServer() {
  const server = new SMTPServer({
    hostname: 'mail.meusite.com',
    mxPort: 25,
    submissionPort: 587,
    authRequired: true
  });

  // Iniciar e configurar
  await server.start();

  // Criar usuário para autenticação SMTP
  const userId = await server.createUser(
    'admin@meusite.com',
    'senha123',
    'Administrador'
  );

  // Adicionar domínio
  const domainId = await server.addDomain('meusite.com', userId);

  // Configurar DKIM (importante!)
  const dnsRecord = await server.setupDKIM('meusite.com');
  
  console.log('✅ Servidor configurado!');
  console.log('📋 Adicione este registro DNS:', dnsRecord);
}

setupEmailServer();
```

## 🔧 Configuração Completa

```typescript
const server = new SMTPServer({
  // Identificação do servidor
  hostname: 'mail.meusite.com',
  
  // Portas de operação
  mxPort: 25,                    // Padrão para receber emails
  submissionPort: 587,           // Padrão para clientes
  
  // Limites e segurança
  maxConnections: 100,           // Conexões simultâneas
  maxMessageSize: 50 * 1024 * 1024, // 50MB por email
  authRequired: true,            // Exigir autenticação
  
  // TLS/SSL (recomendado para produção)
  tlsEnabled: true,
  certPath: '/path/to/cert.pem',
  keyPath: '/path/to/key.pem',
  
  // Banco de dados
  databasePath: './smtp-server.sqlite',
  
  // Logging
  logLevel: 'info' // error, warn, info, debug
});
```

## 📨 Como Enviar Emails

### Via NodeMailer (Recomendado)

```javascript
const nodemailer = require('nodemailer');

// Configurar para usar SEU servidor SMTP
const transporter = nodemailer.createTransporter({
  host: 'mail.meusite.com',
  port: 587,
  secure: false,
  auth: {
    user: 'admin@meusite.com',
    pass: 'senha123'
  }
});

// Enviar email
await transporter.sendMail({
  from: 'noreply@meusite.com',
  to: 'usuario@gmail.com',  // VAI ENTREGAR DIRETAMENTE NO GMAIL!
  subject: 'Email do meu servidor!',
  html: '<h1>Funcionou!</h1><p>Email enviado pelo meu próprio servidor SMTP!</p>'
});
```

### Via Telnet (Teste)

```bash
telnet mail.meusite.com 587

# Comandos SMTP:
EHLO cliente.com
AUTH PLAIN <base64-encoded-credentials>
MAIL FROM:<admin@meusite.com>
RCPT TO:<destino@gmail.com>
DATA
Subject: Teste

Email de teste do meu servidor!
.
QUIT
```

## 🌐 Configuração DNS Necessária

Para funcionar como servidor de email real, configure:

### 1. Registro MX
```
meusite.com.     IN  MX  10  mail.meusite.com.
```

### 2. Registro A
```
mail.meusite.com.  IN  A   192.168.1.100  # IP do seu servidor
```

### 3. Registro SPF
```
meusite.com.  IN  TXT  "v=spf1 mx ~all"
```

### 4. Registro DKIM (gerado automaticamente)
```
default._domainkey.meusite.com.  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBg..."
```

## 📊 Monitoramento e Estatísticas

```typescript
// Obter estatísticas do servidor
const stats = await server.getStats();
console.log('📈 Estatísticas:', {
  totalEmails: stats.totalEmails,
  conexoesRecentes: stats.recentConnections,
  dominiosAtivos: stats.activeDomains,
  uptime: `${Math.floor(stats.uptime / 3600)}h`
});

// Verificar status
const status = server.getStatus();
console.log('🟢 Servidor rodando:', status.isRunning);

// Acessar banco de dados diretamente
const db = server.getDatabase();
const emails = await db('emails')
  .where('status', 'delivered')
  .orderBy('sent_at', 'desc')
  .limit(10);
```

## 🔐 Gerenciamento de Usuários e Domínios

```typescript
// Criar usuários SMTP
const adminId = await server.createUser('admin@site.com', 'senha123', 'Admin');
const userId = await server.createUser('user@site.com', 'senha456', 'User');

// Gerenciar domínios
const domainId = await server.addDomain('site.com', adminId);

// Configurar DKIM para domínio
const dkimManager = server.getDKIMManager();
const dnsRecord = await dkimManager.generateDKIMKeys('site.com');

// Listar domínios com DKIM
const domains = dkimManager.getDKIMDomains();
console.log('📋 Domínios configurados:', domains);
```

## 🧪 Teste Rápido

### 1. Instalar e Compilar

```bash
cd ultrazend-smtp-server
npm install
npm run build
```

### 2. Executar Migrations

```bash
node dist/migrations/migrate.js
```

### 3. Iniciar Servidor de Teste

```bash
npm run start:server
```

### 4. Testar Envio

```javascript
// test-send.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  host: 'localhost',
  port: 2587,
  secure: false,
  auth: {
    user: 'admin@localhost',
    pass: 'password123'
  }
});

transporter.sendMail({
  from: 'test@localhost',
  to: 'destino@gmail.com',
  subject: 'Teste do meu servidor SMTP!',
  html: '<h1>Funcionou!</h1>'
}).then(console.log).catch(console.error);
```

## 🔧 Produção

### Docker Compose

```yaml
version: '3.8'
services:
  smtp-server:
    build: .
    ports:
      - "25:25"     # MX
      - "587:587"   # Submission
    volumes:
      - ./data:/app/data
      - ./certs:/app/certs
    environment:
      - HOSTNAME=mail.meusite.com
      - DATABASE_PATH=/app/data/smtp.sqlite
      - TLS_CERT_PATH=/app/certs/cert.pem
      - TLS_KEY_PATH=/app/certs/key.pem
```

### Systemd Service

```ini
[Unit]
Description=UltraZend SMTP Server
After=network.target

[Service]
Type=simple
User=smtp
WorkingDirectory=/opt/smtp-server
ExecStart=/usr/bin/node dist/start-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 📋 Exemplos Práticos

### Express.js Integration

```typescript
import express from 'express';
import { SMTPServer } from '@ultrazend/smtp-server';

const app = express();
const smtpServer = new SMTPServer({
  hostname: 'mail.api.com',
  mxPort: 25,
  submissionPort: 587
});

// Inicializar SMTP ao startar API
app.listen(3000, async () => {
  await smtpServer.start();
  console.log('✅ API + SMTP Server running');
});

// Endpoint para enviar emails
app.post('/send-email', async (req, res) => {
  const { to, subject, html } = req.body;
  
  // Usar o próprio servidor SMTP da aplicação
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransporter({
    host: 'localhost',
    port: 587,
    auth: {
      user: 'api@api.com',
      pass: 'api-password'
    }
  });

  await transporter.sendMail({
    from: 'noreply@api.com',
    to,
    subject,
    html
  });

  res.json({ success: true });
});
```

### Sistema de Newsletter

```typescript
import { SMTPServer } from '@ultrazend/smtp-server';

class NewsletterSystem {
  private smtpServer: SMTPServer;

  constructor() {
    this.smtpServer = new SMTPServer({
      hostname: 'mail.newsletter.com',
      mxPort: 25,
      submissionPort: 587
    });
  }

  async start() {
    await this.smtpServer.start();
    await this.setupDomain();
  }

  async setupDomain() {
    const userId = await this.smtpServer.createUser(
      'newsletter@newsletter.com',
      'secure-password',
      'Newsletter System'
    );

    await this.smtpServer.addDomain('newsletter.com', userId);
    await this.smtpServer.setupDKIM('newsletter.com');
  }

  async sendNewsletter(subscribers: string[], content: string) {
    // Enviar para todos os assinantes usando nosso próprio servidor
    for (const email of subscribers) {
      await this.sendEmail(email, 'Newsletter Semanal', content);
    }
  }

  private async sendEmail(to: string, subject: string, html: string) {
    // Implementar envio via nosso servidor SMTP
  }
}
```

## ⚠️ Considerações Importantes

### Segurança
- ✅ Configure TLS/SSL para produção
- ✅ Use senhas fortes para usuários SMTP
- ✅ Configure firewall para portas 25 e 587
- ✅ Monitore logs de autenticação

### DNS e Reputação
- ✅ Configure todos os registros DNS (MX, SPF, DKIM)
- ✅ Use IP dedicado para o servidor
- ✅ Implemente DMARC para melhor reputação
- ✅ Monitore blacklists de IP

### Performance
- ✅ Ajuste `maxConnections` conforme sua capacidade
- ✅ Use SSD para banco de dados SQLite
- ✅ Configure rate limiting adequado
- ✅ Monitore uso de recursos

### Compliance
- ✅ Implemente opt-out para newsletters
- ✅ Respeite regulamentações locais (LGPD, GDPR)
- ✅ Mantenha logs para auditoria
- ✅ Configure retenção de dados

## 🆘 Troubleshooting

### Erro: "EADDRINUSE" (Porta em uso)
```bash
# Verificar o que está usando a porta
netstat -tulpn | grep :25
# Parar processo conflitante ou usar porta diferente
```

### Emails não chegam ao destino
```typescript
// Testar conectividade MX
const delivery = server.getMXDeliveryService();
const canDeliver = await delivery.testMXConnectivity('gmail.com');
console.log('Pode entregar no Gmail:', canDeliver);
```

### Problemas de autenticação
```typescript
// Verificar usuários cadastrados
const db = server.getDatabase();
const users = await db('users').select('email', 'is_active');
console.log('Usuários SMTP:', users);
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch: `git checkout -b minha-feature`
3. Commit: `git commit -m 'Adicionar feature'`
4. Push: `git push origin minha-feature`
5. Abra um Pull Request

## 📄 Licença

MIT - veja [LICENSE](LICENSE) para detalhes.

## 🚀 Criado pela UltraZend

Este módulo foi extraído do servidor SMTP da plataforma UltraZend e disponibilizado como módulo independente.

---

**💡 RESUMO:** Este é um servidor de email SMTP completo que você pode rodar na sua própria infraestrutura, sem depender de provedores externos. Perfeito para aplicações que precisam de controle total sobre entrega de emails!

**🎯 DIFERENCIAL:** Não é um cliente SMTP - é um SERVIDOR completo que processa e entrega emails diretamente!