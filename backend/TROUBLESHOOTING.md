# 🛠️ Guia de Troubleshooting - Sistema de Emails UltraZend

## 📋 Índice
1. [Problemas de Email Interno](#-problemas-de-email-interno)
2. [Problemas de Email Externo](#-problemas-de-email-externo)
3. [Problemas de DKIM](#-problemas-de-dkim)
4. [Problemas de SMTP](#-problemas-de-smtp)
5. [Problemas de Middleware](#️-problemas-de-middleware)
6. [Problemas de Base de Dados](#️-problemas-de-base-de-dados)
7. [Problemas de Environment](#-problemas-de-environment)
8. [Comandos de Diagnóstico](#-comandos-de-diagnóstico)
9. [Logs e Monitoramento](#-logs-e-monitoramento)

---

## 📧 Problemas de Email Interno

### ❌ Email de Verificação de Conta Não Chega

**Sintomas:**
- Usuário se registra mas não recebe email de verificação
- Não há logs de envio de email

**Diagnóstico:**
```bash
# Verificar se InternalEmailService está sendo usado
grep -r "sendVerificationEmail" backend/src/controllers/
grep -r "InternalEmailService" backend/src/controllers/authController.ts

# Verificar logs de email
grep "Verification email sent" logs/*.log
```

**Soluções:**
1. Verificar se `authController.ts` está usando `InternalEmailService`:
   ```typescript
   import { InternalEmailService } from '../services/InternalEmailService';
   const internalEmailService = new InternalEmailService();
   ```

2. Verificar se o envio está sendo executado assincronamente:
   ```typescript
   setImmediate(async () => {
     await internalEmailService.sendVerificationEmail(email, name, token);
   });
   ```

### ❌ Email de Recuperação de Senha Não Funciona

**Sintomas:**
- Usuário clica em "Esqueci minha senha" mas não recebe email
- Erro 500 na API ou timeout

**Diagnóstico:**
```bash
# Verificar se método existe e está implementado
grep -A 10 "sendPasswordResetEmail" backend/src/services/InternalEmailService.ts

# Verificar logs de erro
grep "Password reset" logs/error.log

# Verificar configuração de URL
echo $FRONTEND_URL
```

**Soluções:**
1. Verificar implementação em `InternalEmailService.ts`:
   ```typescript
   async sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
     // Deve ter implementação real, não TODO
   }
   ```

2. Verificar variáveis de ambiente:
   ```bash
   # Em .env.development
   FRONTEND_URL=http://localhost:3000
   MAIL_FROM_EMAIL=noreply@ultrazend.com.br
   ```

---

## 🌐 Problemas de Email Externo

### ❌ API de Email Retorna Erro 500

**Sintomas:**
- Requisições POST para `/api/emails` falham
- Erro relacionado a middleware ou validação

**Diagnóstico:**
```bash
# Verificar se middleware unificado está sendo usado
grep -r "emailArchitectureMiddleware" backend/src/routes/emails.ts

# Verificar se middleware antigo foi removido
ls backend/src/middleware/emailValidation.ts 2>/dev/null || echo "✅ Removido"

# Verificar logs da API
tail -f logs/api.log | grep "POST /api/emails"
```

**Soluções:**
1. Certificar que `emails.ts` usa middleware unificado:
   ```typescript
   import { emailArchitectureMiddleware } from '../middleware/emailArchitectureMiddleware';
   router.post('/send', emailArchitectureMiddleware, emailController.sendEmail);
   ```

2. Remover importações de middleware antigo:
   ```typescript
   // ❌ REMOVER estas linhas
   // import { validateSenderMiddleware } from '../middleware/emailValidation';
   ```

### ❌ Emails com Domínio Não Verificado Falham

**Sintomas:**
- Erro ao enviar email com domínio próprio
- Rejeitado por falta de DKIM

**Diagnóstico:**
```bash
# Verificar fallback de domínio
grep -A 5 "validateSenderDomain" backend/src/services/DomainValidator.ts

# Verificar DKIM fallback
grep -A 5 "getDefaultDKIMConfig" backend/src/services/MultiDomainDKIMManager.ts
```

**Soluções:**
1. Verificar se `DomainValidator` faz fallback:
   ```typescript
   if (!domainRecord.is_verified) {
     return {
       email: `noreply+user${userId}@ultrazend.com.br`,
       dkimDomain: 'ultrazend.com.br',
       fallback: true,
       reason: 'Domain not verified'
     };
   }
   ```

---

## 🔐 Problemas de DKIM

### ❌ DKIM Signature Inválida

**Sintomas:**
- Emails marcados como spam
- Headers mostram DKIM=fail
- Logs mostram erro de assinatura DKIM

**Diagnóstico:**
```bash
# Verificar chaves DKIM existem
ls -la configs/dkim-keys/

# Verificar DNS do domínio
dig TXT default._domainkey.ultrazend.com.br

# Testar DKIM no email recebido
# Ver headers: DKIM-Signature e Authentication-Results
```

**Soluções:**
1. Verificar se chaves DKIM estão no local correto:
   ```bash
   configs/dkim-keys/
   ├── ultrazend.com.br-default-private.pem
   └── ultrazend.com.br-default-public.pem
   ```

2. Verificar configuração no `.env`:
   ```bash
   DKIM_PRIVATE_KEY_PATH=./configs/dkim-keys/ultrazend.com.br-default-private.pem
   DKIM_SELECTOR=default
   DKIM_DOMAIN=ultrazend.com.br
   ```

3. Publicar chave pública no DNS:
   ```bash
   # Adicionar record TXT em default._domainkey.ultrazend.com.br
   "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEF..."
   ```

### ❌ DKIM Para Domínios Não Verificados Bloqueado

**Sintomas:**
- Email falha para domínios não verificados
- Logs mostram "Domain not verified, blocking DKIM"
- TypeError: Cannot read property 'domain' of null

**Diagnóstico:**
```bash
# Verificar se fallback está implementado
grep -A 10 "is_verified.*false" backend/src/services/MultiDomainDKIMManager.ts

# Verificar logs de fallback
grep "DKIM fallback" logs/*.log
```

**Soluções:**
1. Verificar implementação de fallback em `MultiDomainDKIMManager.ts`:
   ```typescript
   if (!domainRecord.is_verified) {
     logger.warn('🔄 DKIM requested for unverified domain - using fallback');
     return await this.getDefaultDKIMConfig();
   }
   ```

2. Nunca retornar `null` para domínios não verificados:
   ```typescript
   // ❌ ERRADO
   if (!domainRecord.is_verified) return null;
   
   // ✅ CORRETO
   if (!domainRecord.is_verified) {
     return await this.getDefaultDKIMConfig();
   }
   ```

---

## 📮 Problemas de SMTP

### ❌ SMTP Delivery Falha em Produção

**Sintomas:**
- Emails não chegam ao destinatário
- Timeout em conexão SMTP
- Erro "Connection refused"

**Diagnóstico:**
```bash
# Testar conectividade SMTP
telnet smtp.gmail.com 587

# Verificar configuração MX
dig MX gmail.com

# Verificar logs SMTP
grep "SMTP" logs/email.log
```

**Soluções:**
1. Verificar se entrega direta está funcionando:
   ```typescript
   // Em smtpDelivery.ts deve tentar MX direto primeiro
   if (Env.isProduction) {
     try {
       return await this.deliverDirectlyViaMX(signedEmailData);
     } catch (error) {
       if (this.hasSMTPFallbackConfig()) {
         return await this.deliverViaSMTPRelay(signedEmailData);
       }
     }
   }
   ```

2. Configurar fallback SMTP para emergências:
   ```bash
   # Em .env.production
   SMTP_FALLBACK_HOST=smtp.mailtrap.io
   SMTP_FALLBACK_PORT=587
   SMTP_FALLBACK_SECURE=true
   SMTP_FALLBACK_USER=your_user
   SMTP_FALLBACK_PASS=your_pass
   ```

### ❌ Fallback SMTP Não Funciona em Desenvolvimento

**Sintomas:**
- Emails não aparecem no MailHog/Mailtrap
- Erro de conexão com localhost:1025

**Diagnóstico:**
```bash
# Verificar se MailHog está rodando
curl http://localhost:8025/api/v1/messages

# Verificar porta SMTP
netstat -an | grep 1025

# Verificar configuração
echo $SMTP_FALLBACK_HOST
echo $SMTP_FALLBACK_PORT
```

**Soluções:**
1. Iniciar MailHog:
   ```bash
   # Via Docker
   docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog
   
   # Via instalação local
   mailhog
   ```

2. Verificar configuração em `.env.development`:
   ```bash
   SMTP_FALLBACK_HOST=localhost
   SMTP_FALLBACK_PORT=1025
   SMTP_FALLBACK_SECURE=false
   NODE_ENV=development
   ```

---

## 🛡️ Problemas de Middleware

### ❌ Erro "Cannot read property 'validateSender' of undefined"

**Sintomas:**
- API de emails retorna erro 500
- Stack trace aponta para middleware removido

**Diagnóstico:**
```bash
# Verificar se imports antigos ainda existem
grep -r "validateSenderMiddleware" backend/src/
grep -r "emailValidation" backend/src/

# Verificar se arquivo foi removido
ls backend/src/middleware/emailValidation.ts
```

**Soluções:**
1. Remover todas as importações do middleware antigo:
   ```bash
   # Buscar e remover estas linhas em emails.ts
   grep -v "validateSenderMiddleware" backend/src/routes/emails.ts > temp && mv temp backend/src/routes/emails.ts
   ```

2. Certificar que usa apenas middleware unificado:
   ```typescript
   import { emailArchitectureMiddleware } from '../middleware/emailArchitectureMiddleware';
   router.use('/api/emails', emailArchitectureMiddleware);
   ```

### ❌ Rate Limiting Não Funciona

**Sintomas:**
- Usuários podem enviar emails sem limite
- Não há logs de rate limiting

**Diagnóstico:**
```bash
# Verificar middleware de rate limiting
grep -A 10 "rateLimitMiddleware" backend/src/middleware/emailArchitectureMiddleware.ts

# Verificar Redis (se usado)
redis-cli ping
```

**Soluções:**
1. Verificar se rate limiting está ativo no middleware:
   ```typescript
   if (await this.checkRateLimit(userId)) {
     return res.status(429).json({ error: 'Rate limit exceeded' });
   }
   ```

---

## 🗄️ Problemas de Base de Dados

### ❌ Erro "Cannot read property 'total_emails' of undefined"

**Sintomas:**
- Erro ao buscar estatísticas de email
- Stack trace aponta para parsing de resultados

**Diagnóstico:**
```bash
# Verificar se interfaces foram implementadas
grep -A 10 "UserEmailStats" backend/src/types/database.ts

# Verificar uso das interfaces
grep "as UserEmailStats" backend/src/services/ExternalEmailService.ts
```

**Soluções:**
1. Verificar se `types/database.ts` tem interfaces adequadas:
   ```typescript
   export interface UserEmailStats {
     total_emails: string;
     sent_emails: string;
     failed_emails: string;
     modified_emails: string;
   }
   ```

2. Usar helper functions para parsing:
   ```typescript
   import { parseCount } from '../types/database';
   const totalEmails = parseCount(stats.total_emails);
   ```

### ❌ Erro "Cannot execute query on undefined"

**Sintomas:**
- Falha ao conectar com banco de dados
- Erro no pool de conexões

**Diagnóstico:**
```bash
# Verificar se banco está funcionando
npx knex raw "SELECT 1"

# Verificar configuração
cat backend/knexfile.js | grep development

# Verificar arquivo .env
grep DB_ backend/.env.development
```

**Soluções:**
1. Verificar configuração de conexão:
   ```bash
   # Em .env.development
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=urbansend_dev
   DB_USER=postgres
   DB_PASS=your_password
   ```

2. Testar conexão manualmente:
   ```bash
   psql -h localhost -U postgres -d urbansend_dev -c "SELECT 1;"
   ```

---

## 🔧 Problemas de Environment

### ❌ Variáveis de Ambiente Não Carregam

**Sintomas:**
- `process.env.VARIABLE` retorna undefined
- Configuração padrão sempre usada

**Diagnóstico:**
```bash
# Verificar se arquivo .env existe
ls backend/.env.development

# Verificar carregamento
grep -r "dotenv" backend/src/

# Verificar variável específica
node -e "require('dotenv').config(); console.log(process.env.MAIL_FROM_EMAIL);"
```

**Soluções:**
1. Certificar que dotenv está configurado no início:
   ```typescript
   // Em index.ts, no INÍCIO do arquivo
   import dotenv from 'dotenv';
   dotenv.config({ path: '.env.development' });
   ```

2. Verificar se arquivo tem formato correto:
   ```bash
   # ✅ CORRETO
   MAIL_FROM_EMAIL=noreply@ultrazend.com.br
   
   # ❌ ERRADO
   MAIL_FROM_EMAIL = noreply@ultrazend.com.br  # espaços extras
   ```

### ❌ NODE_ENV Não Detecta Ambiente Corretamente

**Sintomas:**
- Comportamento de produção em desenvolvimento
- SMTP fallback não funciona quando deveria

**Diagnóstico:**
```bash
# Verificar NODE_ENV atual
echo $NODE_ENV

# Verificar detecção no código
grep -A 5 "isProduction" backend/src/
```

**Soluções:**
1. Definir explicitamente no package.json:
   ```json
   {
     "scripts": {
       "dev": "NODE_ENV=development nodemon src/index.ts",
       "build": "NODE_ENV=production npm run build"
     }
   }
   ```

2. Usar classe Env para detecção consistente:
   ```typescript
   export class Env {
     static get isProduction(): boolean {
       return process.env.NODE_ENV === 'production';
     }
   }
   ```

---

## 🔍 Comandos de Diagnóstico

### Teste de Conectividade SMTP
```bash
# Testar MX direto
dig MX gmail.com
telnet gmail-smtp-in.l.google.com 25

# Testar SMTP relay
telnet localhost 1025

# Testar com MailHog
curl http://localhost:8025/api/v1/messages | jq .
```

### Teste de DKIM
```bash
# Verificar chaves locais
openssl rsa -in configs/dkim-keys/ultrazend.com.br-default-private.pem -check

# Verificar DNS
dig TXT default._domainkey.ultrazend.com.br +short

# Testar assinatura
echo "Test email" | node -e "
const dkim = require('dkim-signer');
const key = require('fs').readFileSync('configs/dkim-keys/ultrazend.com.br-default-private.pem');
console.log(dkim.sign('test', { privateKey: key, selector: 'default', domain: 'ultrazend.com.br' }));
"
```

### Teste de Base de Dados
```bash
# Teste básico
npx knex raw "SELECT NOW()"

# Verificar tabelas
npx knex raw "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"

# Testar query específica
npx knex raw "SELECT * FROM users LIMIT 1"

# Verificar migrations
npx knex migrate:status
```

### Teste de API
```bash
# Testar endpoint de email interno
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456","name":"Test User"}'

# Testar endpoint de email externo
curl -X POST http://localhost:3001/api/emails/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"to":"dest@example.com","subject":"Test","html":"<p>Test</p>"}'
```

---

## 📊 Logs e Monitoramento

### Estrutura de Logs
```bash
logs/
├── api.log          # Logs gerais da API
├── email.log        # Logs específicos de email
├── error.log        # Logs de erro
├── smtp.log         # Logs SMTP detalhados
└── dkim.log         # Logs de DKIM
```

### Comandos Úteis de Log
```bash
# Acompanhar logs em tempo real
tail -f logs/email.log

# Buscar por erros específicos
grep -i "error" logs/*.log

# Buscar por email específico
grep "user@example.com" logs/email.log

# Contar emails por status
grep "Email sent successfully" logs/email.log | wc -l
grep "Email failed" logs/email.log | wc -l

# Verificar fallbacks
grep "fallback" logs/email.log
```

### Métricas de Monitoramento
```bash
# Taxa de sucesso de emails
echo "Sucesso: $(grep -c "Email sent" logs/email.log)"
echo "Falhas: $(grep -c "Email failed" logs/email.log)"

# Uso de fallback
echo "Fallbacks DKIM: $(grep -c "DKIM fallback" logs/email.log)"
echo "Fallbacks SMTP: $(grep -c "SMTP fallback" logs/email.log)"

# Performance
grep "Email processing time" logs/email.log | awk '{print $NF}' | sort -n
```

---

## 🚨 Procedimentos de Emergência

### Sistema de Email Completamente Parado
1. Verificar se servidor está rodando:
   ```bash
   ps aux | grep node
   curl http://localhost:3001/health
   ```

2. Verificar conectividade com banco:
   ```bash
   npx knex raw "SELECT 1"
   ```

3. Restart do serviço:
   ```bash
   npm run dev  # desenvolvimento
   pm2 restart all  # produção
   ```

### Emails Não Chegando (Produção)
1. Ativar fallback SMTP imediatamente:
   ```bash
   # Adicionar no .env.production
   SMTP_FALLBACK_HOST=backup-smtp.com
   SMTP_FALLBACK_PORT=587
   SMTP_FALLBACK_SECURE=true
   ```

2. Verificar blacklist do IP:
   ```bash
   # Verificar reputation
   curl "https://reputation.mxtoolbox.com/ip/YOUR_IP"
   ```

3. Monitorar entregas:
   ```bash
   tail -f logs/email.log | grep -E "(sent|failed)"
   ```

### Erro Massivo de DKIM
1. Forçar fallback para todos os domínios:
   ```typescript
   // Emergência: sempre usar fallback
   return await this.getDefaultDKIMConfig();
   ```

2. Verificar DNS propagation:
   ```bash
   dig TXT default._domainkey.ultrazend.com.br @8.8.8.8
   dig TXT default._domainkey.ultrazend.com.br @1.1.1.1
   ```

---

*Guia criado em: Janeiro 2025*  
*Versão: 1.0 (Fase 3 - Type Safety & Testing)*  
*Última atualização: Pós-implementação das 3 fases*