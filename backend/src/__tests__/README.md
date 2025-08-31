# ULTRAZEND - Suíte de Testes SMTP

Este diretório contém todos os testes para validar o funcionamento do ULTRAZEND SMTP Server.

## 📋 Estrutura dos Testes

```
__tests__/
├── setup.ts                      # Configuração global dos testes
├── smtp-integration.test.ts      # Testes de integração principais
├── manual-deliverability.test.ts # Testes manuais de deliverability
├── bounce-handling.test.ts       # Testes de bounce handling
└── README.md                    # Esta documentação
```

## 🚀 Como Executar os Testes

### Pré-requisitos

1. **Instalar dependências:**
   ```bash
   cd backend
   npm install
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   # Criar arquivo .env.test
   cp .env .env.test
   
   # Editar .env.test com configurações de teste
   TEST_API_KEY=your-test-api-key
   API_BASE_URL=http://localhost:3001
   SMTP_HOSTNAME=www.ultrazend.com.br
   ```

3. **Compilar TypeScript:**
   ```bash
   npm run build
   ```

### Executar Testes Automatizados

```bash
# Executar todos os testes
npm test

# Executar testes específicos
npm test smtp-integration
npm test bounce-handling

# Executar com watch mode
npm run test:watch

# Executar com coverage
npm test -- --coverage
```

### Executar Testes Manuais de Deliverability

Os testes de deliverability precisam ser executados manualmente para validar a entrega real de emails:

```bash
# 1. Teste com Mail-Tester.com
node scripts/test-deliverability.js mail-tester test-abc123@mail-tester.com

# 2. Teste com Gmail (verificar headers DKIM/SPF)
node scripts/test-deliverability.js gmail seuemail@gmail.com

# 3. Teste de Bounce Handling
node scripts/test-deliverability.js bounce

# 4. Teste de Performance
node scripts/test-deliverability.js performance teste@dominio.com 10

# 5. Executar todos os testes manuais
node scripts/test-deliverability.js all --gmail=teste@gmail.com --performance=teste@dominio.com
```

## 📊 Testes Incluídos

### 1. Testes de Integração (`smtp-integration.test.ts`)

#### ✅ Teste de Registro de Usuário + Verificação
- Registra novo usuário via API
- Verifica se email de verificação é enviado
- Testa link de verificação
- Valida processo completo de onboarding

#### ✅ Teste de Envio via API
- Testa endpoint `/api/emails/send`
- Valida autenticação por API key
- Verifica salvamento no banco de dados
- Testa validação de dados de entrada

#### ✅ Teste de Assinatura DKIM
- Valida geração de assinatura DKIM
- Testa estrutura do registro DNS
- Verifica chave pública RSA

#### ✅ Teste de Recuperação de Senha
- Testa fluxo de reset de senha
- Verifica envio de email de recuperação
- Valida geração de token de reset

#### ✅ Teste de Webhooks
- Simula webhooks de status de email
- Testa processamento de eventos
- Valida atualizações de status

### 2. Testes de Bounce Handling (`bounce-handling.test.ts`)

#### ✅ Detecção de Hard Bounces
- Domínios inexistentes
- Usuários inexistentes
- Classificação automática

#### ✅ Tratamento de Soft Bounces
- Sistema de retry
- Contadores de tentativas
- Escalação para hard bounce

#### ✅ Classificação de Bounces
- Hard bounces (permanentes)
- Soft bounces (temporários)
- Blocks (spam/reputação)

#### ✅ VERP (Variable Envelope Return Path)
- Geração de endereços únicos
- Rastreamento de bounces
- Hash de identificação

#### ✅ Monitoramento de Taxa de Bounce
- Cálculo de porcentagem
- Alertas de reputação
- Estatísticas por usuário

### 3. Testes Manuais de Deliverability (`manual-deliverability.test.ts`)

#### 🔍 Mail-Tester.com
- Score de deliverability
- Validação de headers
- Reputação do IP/domínio

#### 📧 Gmail Headers
- Autenticação DKIM
- Validação SPF
- Política DMARC

#### ↩️ Bounce Handling Real
- Emails para domínios inexistentes
- Processamento de retornos
- Logs de bounce

#### ⚡ Teste de Performance
- Múltiplos envios simultâneos
- Medição de throughput
- Monitoramento de recursos

## 🔧 Configuração dos Testes

### Jest Configuration (`jest.config.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000
};
```

### Setup dos Testes (`setup.ts`)
- Configuração de ambiente de teste
- Banco de dados em memória
- Timeouts adequados
- Cleanup automático

## 📈 Validação de Resultados

### Testes Automatizados ✅
- [x] Registro de usuário funciona
- [x] Email de verificação é entregue
- [x] Link de verificação funciona
- [x] Login após verificação funciona
- [x] API de envio funciona
- [x] DKIM signature válida
- [x] Bounce handling implementado
- [x] Webhooks processados

### Testes Manuais 🔍
Para validar completamente:

1. **Execute teste Mail-Tester** → Score > 8/10
2. **Verifique headers no Gmail** → DKIM/SPF = PASS
3. **Teste bounces reais** → Logs de bounce processados
4. **Meça performance** → > 10 emails/segundo

## 🐛 Troubleshooting

### Testes Falhando?

1. **Verificar configuração:**
   ```bash
   # Verificar se servidor está rodando
   curl http://localhost:3001/api/health
   
   # Verificar banco de dados
   npm run migrate:latest
   ```

2. **Verificar logs:**
   ```bash
   # Logs do servidor
   tail -f logs/app.log
   
   # Logs dos testes
   npm test -- --verbose
   ```

3. **Verificar dependências:**
   ```bash
   # Reinstalar dependências
   npm run fresh-install
   ```

### Testes de Deliverability Falhando?

1. **Verificar DNS:**
   ```bash
   dig TXT default._domainkey.www.ultrazend.com.br
   dig TXT www.ultrazend.com.br
   ```

2. **Verificar conectividade SMTP:**
   ```bash
   telnet www.ultrazend.com.br 25
   ```

3. **Verificar certificados:**
   ```bash
   openssl s_client -connect www.ultrazend.com.br:587 -starttls smtp
   ```

## 📋 Checklist de Validação Final

Após executar todos os testes, verificar:

- [ ] Todos os testes automatizados passam
- [ ] Mail-tester.com score > 8/10
- [ ] Headers DKIM/SPF = PASS no Gmail
- [ ] Bounces são processados nos logs
- [ ] Performance > 10 emails/segundo
- [ ] Zero memory leaks nos testes
- [ ] Cleanup completo após testes

## 🎯 Próximos Passos

Após validação completa dos testes:

1. ✅ Executar em ambiente de staging
2. ✅ Validar com tráfego real (baixo volume)
3. ✅ Monitorar métricas de reputação
4. ✅ Deploy em produção
5. ✅ Monitoramento contínuo

---

**🚀 ULTRAZEND SMTP Server está pronto para competir com Resend, Mailgun e SendGrid!**