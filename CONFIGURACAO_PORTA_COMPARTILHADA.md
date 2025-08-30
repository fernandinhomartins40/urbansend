# 🔧 Configuração para VPS Compartilhada - UrbanSend

## 🎯 Domínio: www.ultrazend.com.br na porta 3010

---

## 📋 SITUAÇÃO ATUAL

### Cenário:
- **VPS**: 72.60.10.112 (múltiplas aplicações)
- **Domínio**: www.ultrazend.com.br
- **Porta UrbanSend**: 3010 (não padrão 80/443)
- **SMTP**: Porta 25 (padrão)

### URLs de Acesso:
- **Principal**: http://www.ultrazend.com.br:3010
- **API**: http://www.ultrazend.com.br:3010/api
- **Health**: http://www.ultrazend.com.br:3010/health
- **SMTP**: www.ultrazend.com.br:25

---

## 🌐 CONFIGURAÇÃO DNS ATUALIZADA

### Registros Necessários:
```
# Registro A principal
A      @           72.60.10.112
A      www         72.60.10.112

# Registros para email
A      mail        72.60.10.112
MX     @           mail.ultrazend.com.br  10

# SPF para email
TXT    @           "v=spf1 a mx ip4:72.60.10.112 ~all"
```

**⚠️ Importante**: O DNS aponta para o IP, mas o acesso à aplicação requer a porta 3010.

---

## ⚙️ CONFIGURAÇÕES DA APLICAÇÃO

### Environment (.env.production):
```bash
# === DOMAIN CONFIGURATION ===
DOMAIN=www.ultrazend.com.br
PUBLIC_URL=http://www.ultrazend.com.br
FRONTEND_URL=http://www.ultrazend.com.br
API_URL=http://www.ultrazend.com.br/api
INTERNAL_PORT=3010

# === CORS ===
ALLOWED_ORIGINS=http://www.ultrazend.com.br,https://www.ultrazend.com.br
```

### Docker Compose:
```yaml
ports:
  - "3010:3010"  # Porta específica da aplicação
  - "25:25"      # SMTP padrão
```

### Nginx Config:
```nginx
server {
    listen 3010 default_server;
    server_name www.ultrazend.com.br ultrazend.com.br 72.60.10.112;
    # ...
}
```

---

## 🚀 WORKFLOW CI/CD ATUALIZADO

### GitHub Actions Configurado:
- ✅ Deploy automático na porta 3010
- ✅ Testes com URLs corretas
- ✅ Health checks específicos
- ✅ SMTP na porta padrão 25

### URLs de Teste no Workflow:
```bash
# Teste da aplicação
curl http://72.60.10.112:3010/health

# Teste do domínio
curl http://www.ultrazend.com.br:3010/health

# Teste SMTP
telnet www.ultrazend.com.br 25
```

---

## 📊 IMPACTO DA CONFIGURAÇÃO

### Vantagens:
✅ **Compatibilidade**: Múltiplas apps na mesma VPS  
✅ **Isolamento**: Cada app na sua porta específica  
✅ **SMTP Padrão**: Email funciona normalmente na porta 25  
✅ **DNS Limpo**: Domínio resolve corretamente  

### Considerações:
⚠️ **Porta Específica**: Usuários precisam incluir :3010 na URL  
⚠️ **SEO/Marketing**: URLs não são "limpas"  
⚠️ **SSL Future**: Certificado precisará incluir porta ou proxy reverso  

---

## 🔧 ALTERNATIVAS FUTURAS

### 1. **Proxy Reverso (Recomendado)**
```nginx
# Nginx principal da VPS (porta 80)
server {
    listen 80;
    server_name www.ultrazend.com.br;
    
    location / {
        proxy_pass http://localhost:3010;
        # headers de proxy...
    }
}
```

### 2. **Subdomínio**
```
# Usar subdomínio específico
app.ultrazend.com.br → 72.60.10.112:3010
```

### 3. **Path-based Routing**
```
# Roteamento por path
www.ultrazend.com.br/urbansend → localhost:3010
```

---

## 🧪 TESTES ATUAIS

### Verificações Automáticas:
```bash
# Workflow CI/CD testa:
✅ http://72.60.10.112:3010/health
✅ http://www.ultrazend.com.br:3010/health
✅ telnet www.ultrazend.com.br 25
```

### Testes Manuais:
```bash
# Aplicação
curl http://www.ultrazend.com.br:3010/

# API
curl http://www.ultrazend.com.br:3010/api/health

# WebSocket
# Testar na aplicação frontend

# Email
telnet www.ultrazend.com.br 25
```

---

## 📋 CHECKLIST DE CONFIGURAÇÃO

### DNS:
- [ ] www.ultrazend.com.br → 72.60.10.112
- [ ] mail.ultrazend.com.br → 72.60.10.112
- [ ] Registro MX configurado
- [ ] SPF configurado

### Aplicação:
- [ ] Container na porta 3010
- [ ] SMTP na porta 25
- [ ] Environment com domínio correto
- [ ] CORS configurado para domínio

### CI/CD:
- [ ] Workflow testando porta 3010
- [ ] Deploy automático funcionando
- [ ] Health checks passando
- [ ] Notificações com URLs corretas

---

## 🎯 RESULTADO FINAL

### URLs de Acesso:
- **Aplicação**: http://www.ultrazend.com.br:3010
- **Direta IP**: http://72.60.10.112:3010
- **SMTP**: www.ultrazend.com.br:25

### Configuração:
✅ **Profissional**: Domínio próprio configurado  
✅ **Compatível**: Múltiplas apps na VPS  
✅ **Funcional**: SMTP e aplicação operacionais  
✅ **Automatizado**: Deploy via GitHub Actions  

**Aplicação pronta para uso com domínio profissional na porta 3010! 🚀**

---

*Configuração otimizada para VPS compartilhada em 29/08/2025*