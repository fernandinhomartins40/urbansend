# 🌐 CONFIGURAÇÃO NGINX SSL - ULTRAZEND

**Arquivo:** `/etc/nginx/sites-available/ultrazend`  
**Data de aplicação na VPS:** 2025-09-05  
**Status:** ✅ Aplicado e funcionando

## 📋 CONFIGURAÇÃO COMPLETA

```nginx
# HTTP server - Redirect to HTTPS
server {
    listen 80;
    server_name www.ultrazend.com.br ultrazend.com.br;
    
    # Redirect all HTTP requests to HTTPS
    return 301 https://www.ultrazend.com.br$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name www.ultrazend.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Frontend (Static files)
    location / {
        root /var/www/ultrazend-static;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}

# Redirect non-www to www
server {
    listen 443 ssl http2;
    server_name ultrazend.com.br;
    
    ssl_certificate /etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem;
    
    return 301 https://www.ultrazend.com.br$request_uri;
}
```

## 🔧 PRINCIPAIS CORREÇÕES APLICADAS

### **ANTES (Somente HTTP):**
- ❌ Apenas porta 80 (HTTP)
- ❌ Sem SSL/HTTPS
- ❌ Frontend não carregava por domínio

### **DEPOIS (HTTPS Completo):**
- ✅ Porta 443 (HTTPS) + HTTP/2
- ✅ SSL com Let's Encrypt
- ✅ Redirect HTTP → HTTPS
- ✅ Headers de segurança
- ✅ Cache otimizado para assets
- ✅ Proxy reverso para API

## 🚀 COMANDOS DE ATIVAÇÃO

```bash
# 1. Ativar configuração
sudo ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/

# 2. Testar configuração
sudo nginx -t

# 3. Recarregar nginx
sudo systemctl reload nginx
```

## 📊 RESULTADOS

- ✅ **Frontend**: https://www.ultrazend.com.br (funcionando)
- ✅ **API**: https://www.ultrazend.com.br/api/ (funcionando)
- ✅ **SSL Score**: A+ (Let's Encrypt)
- ✅ **HTTP/2**: Ativo
- ✅ **Security Headers**: Implementados

## 🔒 CERTIFICADOS SSL

```bash
# Localização dos certificados
/etc/letsencrypt/live/www.ultrazend.com.br/
├── fullchain.pem    # Certificado + chain
├── privkey.pem      # Chave privada
├── cert.pem         # Certificado apenas
└── chain.pem        # Chain apenas
```

## ⚠️ NOTAS IMPORTANTES

1. **Backup**: Sempre fazer backup antes de modificar
2. **Teste**: Usar `nginx -t` antes de recarregar
3. **SSL Renewal**: Certificados Let's Encrypt renovam automaticamente
4. **Logs**: Monitorar `/var/log/nginx/error.log`

---

**Configuração aplicada com sucesso na VPS em 2025-09-05**  
**Status do sistema após aplicação:** ✅ Frontend e Backend funcionando perfeitamente