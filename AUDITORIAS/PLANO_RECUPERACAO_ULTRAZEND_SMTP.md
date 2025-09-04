# 🚀 PLANO DE RECUPERAÇÃO ULTRAZEND SMTP

**Documento:** Plano de Ação para Correção de Erros 500  
**Data:** 04/01/2025  
**Versão:** 1.0  
**Responsável:** Equipe de Desenvolvimento  

---

## 📋 ÍNDICE

1. [Preparação e Backup](#1-preparação-e-backup)
2. [Diagnóstico Detalhado](#2-diagnóstico-detalhado)
3. [Correção das Migrations](#3-correção-das-migrations)
4. [Validação do Schema](#4-validação-do-schema)
5. [Testes e Validação](#5-testes-e-validação)
6. [Deploy Seguro](#6-deploy-seguro)
7. [Monitoramento Pós-Deploy](#7-monitoramento-pós-deploy)
8. [Melhorias de Prevenção](#8-melhorias-de-prevenção)

---

## ⚠️ PRÉ-REQUISITOS

- [ ] Acesso SSH ao servidor de produção
- [ ] Backup recente do banco de dados
- [ ] Ambiente de desenvolvimento local configurado
- [ ] Acesso ao PM2 em produção
- [ ] Ferramentas: `sqlite3`, `knex`, `git`

---

## 🎯 FASE 1: PREPARAÇÃO E BACKUP (30 min)

### 1.1 Backup Completo do Sistema

```bash
# 1. Conectar ao servidor
ssh root@31.97.162.155

# 2. Parar todos os serviços
cd /var/www/ultrazend
pm2 stop all

# 3. Backup completo do banco de dados
mkdir -p ~/backups/$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups/$(date +%Y%m%d_%H%M%S)

# Backup do SQLite
cp backend/ultrazend.sqlite $BACKUP_DIR/
sqlite3 backend/ultrazend.sqlite ".backup $BACKUP_DIR/ultrazend_backup.sqlite"

# Backup dos logs
cp -r logs/ $BACKUP_DIR/

# Backup das configurações
cp -r configs/ $BACKUP_DIR/

echo "✅ Backup completo salvo em: $BACKUP_DIR"
```

### 1.2 Documentar Estado Atual

```bash
# Verificar status das migrations
cd /var/www/ultrazend/backend
npm run migrate:status > $BACKUP_DIR/migration_status_before.txt

# Verificar estrutura atual das tabelas
sqlite3 ultrazend.sqlite ".schema" > $BACKUP_DIR/schema_before.sql

# Verificar dados críticos
sqlite3 ultrazend.sqlite "SELECT name FROM sqlite_master WHERE type='table';" > $BACKUP_DIR/tables_list.txt
```

---

## 🔍 FASE 2: DIAGNÓSTICO DETALHADO (45 min)

### 2.1 Análise das Migrations

```bash
# Listar todas as migrations por ordem de execução
ls -la src/migrations/ | grep -E "\.(js|ts)$" | sort

# Verificar migrations duplicadas
find src/migrations/ -name "007_*" -type f

# Analisar conteúdo das migrations problemáticas
echo "=== MIGRATION 007_create_webhooks_table.js ==="
cat src/migrations/007_create_webhooks_table.js

echo "=== MIGRATION 007_add_bounce_reason_to_emails.js ==="
cat src/migrations/007_add_bounce_reason_to_emails.js

echo "=== MIGRATION 015_create_system_user.js ==="
cat src/migrations/015_create_system_user.js
```

### 2.2 Verificar Estado do Schema

```bash
# Verificar se coluna email_verified ou is_verified existe
sqlite3 ultrazend.sqlite "PRAGMA table_info(users);" | grep -E "(email_verified|is_verified)"

# Verificar tabelas webhooks
sqlite3 ultrazend.sqlite "SELECT sql FROM sqlite_master WHERE name='webhooks';"

# Verificar tabela emails para coluna bounce_reason
sqlite3 ultrazend.sqlite "PRAGMA table_info(emails);" | grep bounce_reason
```

### 2.3 Identificar Inconsistências

```bash
# Criar script de diagnóstico
cat > diagnose_schema.js << 'EOF'
const db = require('./src/config/database');

async function diagnoseSchema() {
    try {
        console.log('🔍 Diagnosticando Schema...');
        
        // Verificar tabela users
        const usersColumns = await db.raw("PRAGMA table_info(users)");
        console.log('📋 Colunas da tabela users:', usersColumns);
        
        const hasEmailVerified = usersColumns.some(col => col.name === 'email_verified');
        const hasIsVerified = usersColumns.some(col => col.name === 'is_verified');
        
        console.log('✅ Tem email_verified:', hasEmailVerified);
        console.log('✅ Tem is_verified:', hasIsVerified);
        
        // Verificar migrations executadas
        const migrations = await db('knex_migrations').select('name').orderBy('batch', 'asc');
        console.log('📊 Migrations executadas:', migrations.map(m => m.name));
        
        // Verificar se existem usuários
        const userCount = await db('users').count('* as count').first();
        console.log('👥 Total de usuários:', userCount.count);
        
    } catch (error) {
        console.error('❌ Erro no diagnóstico:', error);
    } finally {
        process.exit(0);
    }
}

diagnoseSchema();
EOF

node diagnose_schema.js > $BACKUP_DIR/diagnostic_report.txt
```

---

## 🔧 FASE 3: CORREÇÃO DAS MIGRATIONS (60 min)

### 3.1 Correção das Migrations Duplicadas

```bash
# Renomear migration duplicada 007 para 008
mv src/migrations/007_add_bounce_reason_to_emails.js src/migrations/008_add_bounce_reason_to_emails.js

# Atualizar referências internas se necessário
sed -i 's/007_add_bounce_reason_to_emails/008_add_bounce_reason_to_emails/g' src/migrations/008_add_bounce_reason_to_emails.js
```

### 3.2 Correção da Inconsistência email_verified

```bash
# Criar nova migration para corrigir o problema
cat > src/migrations/020_fix_email_verified_consistency.js << 'EOF'
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    console.log('🔧 Fixing email_verified consistency...');
    
    // Verificar se a coluna email_verified ainda existe
    const hasEmailVerified = await knex.schema.hasColumn('users', 'email_verified');
    const hasIsVerified = await knex.schema.hasColumn('users', 'is_verified');
    
    if (hasEmailVerified && !hasIsVerified) {
        // Caso 1: Ainda tem email_verified, precisa renomear
        await knex.schema.alterTable('users', (table) => {
            table.renameColumn('email_verified', 'is_verified');
        });
        console.log('✅ Renamed email_verified to is_verified');
    } else if (!hasEmailVerified && !hasIsVerified) {
        // Caso 2: Nenhuma das duas existe, criar is_verified
        await knex.schema.alterTable('users', (table) => {
            table.boolean('is_verified').defaultTo(false);
        });
        console.log('✅ Created is_verified column');
    } else if (hasEmailVerified && hasIsVerified) {
        // Caso 3: Ambas existem (problema), manter apenas is_verified
        await knex.schema.alterTable('users', (table) => {
            table.dropColumn('email_verified');
        });
        console.log('✅ Removed duplicate email_verified column');
    }
    // Caso 4: Só is_verified existe - está correto
    
    console.log('✅ Email verification column consistency fixed');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    // Este rollback é complexo, manter estado atual
    console.log('⚠️ Rollback not implemented for consistency fix');
};
EOF
```

### 3.3 Corrigir Migration do Sistema User

```bash
# Criar versão corrigida da migration 015
cat > src/migrations/021_create_system_user_fixed.js << 'EOF'
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    console.log('👤 Creating system user (fixed version)...');
    
    // Verificar se usuário sistema já existe
    const existingUser = await knex('users')
        .where('email', 'system@ultrazend.com.br')
        .first();
    
    if (!existingUser) {
        await knex('users').insert({
            email: 'system@ultrazend.com.br',
            name: 'Sistema UltraZend',
            password: '$2b$12$dummy.hash.for.system.user.that.cannot.login',
            is_verified: true, // Usar is_verified em vez de email_verified
            role: 'system',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
        });
        console.log('✅ System user created successfully');
    } else {
        // Atualizar usuário existente para garantir consistência
        await knex('users')
            .where('email', 'system@ultrazend.com.br')
            .update({
                is_verified: true,
                updated_at: new Date()
            });
        console.log('✅ System user updated for consistency');
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex('users')
        .where('email', 'system@ultrazend.com.br')
        .del();
};
EOF
```

### 3.4 Executar Correções

```bash
# Executar migrations de correção
npm run migrate:latest

# Verificar se correções funcionaram
npm run migrate:status
```

---

## ✅ FASE 4: VALIDAÇÃO DO SCHEMA (30 min)

### 4.1 Validar Schema Final

```bash
# Criar script de validação completa
cat > validate_schema.js << 'EOF'
const db = require('./src/config/database');

async function validateSchema() {
    const issues = [];
    const validations = [];
    
    try {
        console.log('🔍 Validando Schema Final...\n');
        
        // Validação 1: Verificar coluna is_verified
        const usersColumns = await db.raw("PRAGMA table_info(users)");
        const hasIsVerified = usersColumns.some(col => col.name === 'is_verified');
        const hasEmailVerified = usersColumns.some(col => col.name === 'email_verified');
        
        if (hasIsVerified && !hasEmailVerified) {
            validations.push('✅ users.is_verified: OK');
        } else {
            issues.push('❌ users table column inconsistency');
        }
        
        // Validação 2: Verificar tabelas essenciais
        const tables = [
            'users', 'emails', 'webhooks', 'processed_emails',
            'security_blacklists', 'rate_limit_violations',
            'spam_analysis', 'phishing_detection', 'ip_reputation'
        ];
        
        for (const table of tables) {
            const exists = await db.schema.hasTable(table);
            if (exists) {
                validations.push(`✅ Tabela ${table}: Existe`);
            } else {
                issues.push(`❌ Tabela ${table}: Não encontrada`);
            }
        }
        
        // Validação 3: Verificar usuário sistema
        const systemUser = await db('users')
            .where('email', 'system@ultrazend.com.br')
            .first();
        
        if (systemUser && systemUser.is_verified) {
            validations.push('✅ Sistema user: OK');
        } else {
            issues.push('❌ Sistema user: Problema');
        }
        
        // Validação 4: Verificar migrations
        const migrations = await db('knex_migrations')
            .count('* as count')
            .first();
        
        validations.push(`📊 Migrations executadas: ${migrations.count}`);
        
        // Relatório final
        console.log('='.repeat(50));
        console.log('📋 VALIDAÇÕES APROVADAS:');
        validations.forEach(v => console.log(v));
        
        if (issues.length > 0) {
            console.log('\n🚨 PROBLEMAS ENCONTRADOS:');
            issues.forEach(i => console.log(i));
        } else {
            console.log('\n🎉 SCHEMA VALIDADO COM SUCESSO!');
        }
        
    } catch (error) {
        console.error('❌ Erro na validação:', error);
    } finally {
        process.exit(0);
    }
}

validateSchema();
EOF

node validate_schema.js
```

### 4.2 Teste de Conectividade

```bash
# Testar conexão com o banco
cat > test_connectivity.js << 'EOF'
const db = require('./src/config/database');

async function testConnectivity() {
    try {
        console.log('🔗 Testando conectividade...');
        
        const result = await db.raw('SELECT 1 as test');
        console.log('✅ Conexão com banco: OK');
        
        const userCount = await db('users').count('* as count').first();
        console.log(`👥 Usuários no banco: ${userCount.count}`);
        
        console.log('🎉 Conectividade validada!');
    } catch (error) {
        console.error('❌ Erro de conectividade:', error);
    } finally {
        process.exit(0);
    }
}

testConnectivity();
EOF

node test_connectivity.js
```

---

## 🧪 FASE 5: TESTES E VALIDAÇÃO (45 min)

### 5.1 Testes Unitários dos Serviços

```bash
# Testar inicialização dos serviços principais
cat > test_services.js << 'EOF'
const { logger } = require('./src/config/logger');

async function testServices() {
    try {
        console.log('🧪 Testando inicialização dos serviços...\n');
        
        // Teste 1: SecurityManager
        const { SecurityManager } = require('./src/services/securityManager');
        const securityManager = new SecurityManager();
        console.log('✅ SecurityManager: Inicializado');
        
        // Teste 2: EmailProcessor
        const { EmailProcessor } = require('./src/services/emailProcessor');
        const emailProcessor = new EmailProcessor();
        console.log('✅ EmailProcessor: Inicializado');
        
        // Teste 3: SMTPServer (sem iniciar)
        const UltraZendSMTPServer = require('./src/services/smtpServer').default;
        const smtpServer = new UltraZendSMTPServer({
            mxPort: 2525, // Porta de teste
            submissionPort: 5875 // Porta de teste
        });
        console.log('✅ SMTPServer: Inicializado');
        
        console.log('\n🎉 Todos os serviços foram inicializados com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro na inicialização dos serviços:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

testServices();
EOF

node test_services.js
```

### 5.2 Teste de Build

```bash
# Testar build completo
npm run build

# Verificar se build foi criado corretamente
if [ -d "dist" ] && [ "$(ls -A dist)" ]; then
    echo "✅ Build criado com sucesso"
    ls -la dist/
else
    echo "❌ Erro no build"
    exit 1
fi
```

### 5.3 Teste de Health Check Local

```bash
# Iniciar aplicação em modo de teste
NODE_ENV=development npm start &
APP_PID=$!

# Aguardar inicialização
sleep 10

# Testar health check
curl -f http://localhost:3001/health || { 
    echo "❌ Health check failed"
    kill $APP_PID
    exit 1
}

echo "✅ Health check passed"

# Parar aplicação de teste
kill $APP_PID
```

---

## 🚀 FASE 6: DEPLOY SEGURO (30 min)

### 6.1 Deploy Preparatório

```bash
# No servidor, fazer backup pré-deploy
cd /var/www/ultrazend
DEPLOY_BACKUP=~/backups/pre_deploy_$(date +%Y%m%d_%H%M%S)
mkdir -p $DEPLOY_BACKUP

cp backend/ultrazend.sqlite $DEPLOY_BACKUP/
cp -r backend/src/migrations/ $DEPLOY_BACKUP/
```

### 6.2 Deploy das Correções

```bash
# Fazer push das correções
git add .
git commit -m "fix: resolver inconsistências críticas de migrations e schema

- Corrigir migrations duplicadas (007)
- Resolver problema email_verified vs is_verified  
- Adicionar validações de schema
- Melhorar robustez do sistema

Refs: AUDITORIA_ULTRAZEND_SMTP_2025-01-04"

git push origin main
```

### 6.3 Deploy via GitHub Actions

O deploy será executado automaticamente via GitHub Actions. Monitorar:

```bash
# Acompanhar logs do deploy
ssh root@31.97.162.155 "cd /var/www/ultrazend && tail -f logs/application/*.log"
```

---

## 📊 FASE 7: MONITORAMENTO PÓS-DEPLOY (60 min)

### 7.1 Monitoramento Imediato

```bash
# Script de monitoramento
cat > monitor_post_deploy.sh << 'EOF'
#!/bin/bash

echo "🔍 Iniciando monitoramento pós-deploy..."
echo "Horário: $(date)"

# Verificar PM2
echo -e "\n📊 Status PM2:"
pm2 status

# Verificar saúde da aplicação
echo -e "\n🏥 Health Check:"
for i in {1..5}; do
    echo "Tentativa $i:"
    if curl -s http://localhost:3001/health | jq '.status' 2>/dev/null; then
        echo "✅ Health check OK"
        break
    else
        echo "❌ Health check failed"
        if [ $i -eq 5 ]; then
            echo "🚨 FALHA CRÍTICA NO HEALTH CHECK"
            exit 1
        fi
        sleep 10
    fi
done

# Verificar logs de erro
echo -e "\n📋 Últimas linhas dos logs:"
echo "=== Application Log ==="
tail -10 logs/app.log 2>/dev/null || echo "Log não encontrado"

echo -e "\n=== Error Log ==="
tail -10 logs/error.log 2>/dev/null || echo "Log não encontrado"

# Verificar connections
echo -e "\n🔗 Conexões ativas:"
netstat -tlnp | grep -E ":(25|587|3001)" || echo "Portas não encontradas"

echo -e "\n✅ Monitoramento concluído"
EOF

chmod +x monitor_post_deploy.sh
./monitor_post_deploy.sh
```

### 7.2 Teste de Funcionalidades

```bash
# Testar endpoints principais
endpoints=(
    "/health"
    "/api/health"
    "/api/users/me"
)

for endpoint in "${endpoints[@]}"; do
    echo "Testando $endpoint..."
    curl -s "http://localhost:3001$endpoint" | head -100
    echo -e "\n---\n"
done
```

### 7.3 Configurar Alertas

```bash
# Criar script de alerta automático
cat > /usr/local/bin/ultrazend_health_monitor.sh << 'EOF'
#!/bin/bash

HEALTH_URL="http://localhost:3001/health"
LOG_FILE="/var/log/ultrazend_monitor.log"

if ! curl -f -s $HEALTH_URL >/dev/null; then
    echo "[$(date)] ❌ UltraZend health check failed" >> $LOG_FILE
    # Tentar reiniciar PM2
    pm2 restart all >> $LOG_FILE 2>&1
    
    # Se ainda falhar após 30s, alertar
    sleep 30
    if ! curl -f -s $HEALTH_URL >/dev/null; then
        echo "[$(date)] 🚨 CRÍTICO: UltraZend não respondeu após restart" >> $LOG_FILE
        # Aqui poderia enviar email/slack/etc
    fi
else
    echo "[$(date)] ✅ UltraZend healthy" >> $LOG_FILE
fi
EOF

chmod +x /usr/local/bin/ultrazend_health_monitor.sh

# Adicionar ao crontab para executar a cada 5 minutos
echo "*/5 * * * * /usr/local/bin/ultrazend_health_monitor.sh" | crontab -
```

---

## 🛡️ FASE 8: MELHORIAS DE PREVENÇÃO (Próximos Dias)

### 8.1 Implementar Testes de Migration

```bash
mkdir -p tests/migrations

cat > tests/migrations/migration.test.js << 'EOF'
const knex = require('knex');
const path = require('path');

describe('Migration Tests', () => {
    let db;
    
    beforeEach(async () => {
        // Criar banco temporário para testes
        db = knex({
            client: 'sqlite3',
            connection: ':memory:',
            useNullAsDefault: true,
            migrations: {
                directory: path.join(__dirname, '../../src/migrations')
            }
        });
    });
    
    afterEach(async () => {
        await db.destroy();
    });
    
    test('should run all migrations successfully', async () => {
        await expect(db.migrate.latest()).resolves.not.toThrow();
    });
    
    test('should have consistent user schema', async () => {
        await db.migrate.latest();
        const hasIsVerified = await db.schema.hasColumn('users', 'is_verified');
        const hasEmailVerified = await db.schema.hasColumn('users', 'is_verified');
        
        expect(hasIsVerified).toBe(true);
        expect(hasEmailVerified).toBe(false);
    });
});
EOF
```

### 8.2 Validação Automática de Schema

```bash
cat > scripts/validate_schema.sh << 'EOF'
#!/bin/bash

echo "🔍 Validando schema antes do deploy..."

# Executar migrations em banco temporário
cp backend/ultrazend.sqlite backend/ultrazend_test.sqlite

cd backend
export DATABASE_URL=./ultrazend_test.sqlite

# Testar migrations
if npm run migrate:latest; then
    echo "✅ Migrations OK"
else
    echo "❌ Falha nas migrations"
    rm backend/ultrazend_test.sqlite
    exit 1
fi

# Testar inicialização dos serviços
if node -e "
const db = require('./src/config/database');
db.raw('SELECT 1').then(() => {
    console.log('✅ Database connection OK');
    process.exit(0);
}).catch(err => {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
});
"; then
    echo "✅ Schema validation passed"
else
    echo "❌ Schema validation failed"
    rm backend/ultrazend_test.sqlite
    exit 1
fi

# Limpar
rm backend/ultrazend_test.sqlite
echo "✅ Schema validation completed"
EOF

chmod +x scripts/validate_schema.sh
```

### 8.3 Melhorar Logging

```bash
cat > src/utils/migrationLogger.js << 'EOF'
const { logger } = require('../config/logger');

class MigrationLogger {
    static logMigrationStart(migrationName) {
        logger.info(`📊 Starting migration: ${migrationName}`, {
            migration: migrationName,
            timestamp: new Date().toISOString(),
            type: 'migration_start'
        });
    }
    
    static logMigrationComplete(migrationName, duration) {
        logger.info(`✅ Completed migration: ${migrationName}`, {
            migration: migrationName,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
            type: 'migration_complete'
        });
    }
    
    static logMigrationError(migrationName, error) {
        logger.error(`❌ Migration failed: ${migrationName}`, {
            migration: migrationName,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            type: 'migration_error'
        });
    }
}

module.exports = MigrationLogger;
EOF
```

---

## 📈 CRONOGRAMA DE EXECUÇÃO

| Fase | Duração | Horário Sugerido | Responsável |
|------|---------|------------------|-------------|
| **Fase 1** - Backup | 30 min | 08:00 - 08:30 | DevOps |
| **Fase 2** - Diagnóstico | 45 min | 08:30 - 09:15 | Dev Lead |
| **Fase 3** - Correções | 60 min | 09:15 - 10:15 | Dev Team |
| **Fase 4** - Validação | 30 min | 10:15 - 10:45 | QA |
| **Pausa** | 15 min | 10:45 - 11:00 | - |
| **Fase 5** - Testes | 45 min | 11:00 - 11:45 | QA + Dev |
| **Fase 6** - Deploy | 30 min | 11:45 - 12:15 | DevOps |
| **Fase 7** - Monitoramento | 60 min | 12:15 - 13:15 | Todos |
| **Fase 8** - Melhorias | Próximos dias | - | Dev Team |

---

## ⚡ CHECKLIST DE EXECUÇÃO

### Pré-Execução
- [ ] Backup completo realizado
- [ ] Equipe notificada
- [ ] Ambiente de desenvolvimento testado
- [ ] Rollback plan definido

### Durante Execução
- [ ] Cada fase validada antes da próxima
- [ ] Logs monitorados constantemente
- [ ] Issues documentados imediatamente
- [ ] Testes executados em cada etapa

### Pós-Execução
- [ ] Sistema funcionando normalmente
- [ ] Todos os health checks passando
- [ ] Logs sem erros críticos
- [ ] Documentação atualizada
- [ ] Equipe treinada nas mudanças

---

## 🚨 PLANO DE ROLLBACK

Se algo der errado durante a execução:

1. **Imediatamente:**
   - Parar todos os serviços: `pm2 stop all`
   - Restaurar backup: `cp $BACKUP_DIR/ultrazend.sqlite backend/`

2. **Rollback das Migrations:**
   ```bash
   npm run migrate:rollback
   npm run migrate:rollback
   npm run migrate:rollback
   ```

3. **Restaurar Estado Anterior:**
   - Reverter código: `git reset --hard HEAD~1`
   - Reiniciar serviços: `pm2 restart all`

4. **Comunicar:**
   - Notificar equipe sobre rollback
   - Documentar causa da falha
   - Planejar nova tentativa

---

## 📞 CONTATOS DE EMERGÊNCIA

- **Dev Lead:** [contato]
- **DevOps:** [contato]
- **Product Owner:** [contato]
- **Servidor:** 31.97.162.155

---

## ✅ CRITÉRIOS DE SUCESSO

O plano será considerado bem-sucedido quando:

- [ ] ✅ Zero erros 500 nos logs
- [ ] ✅ Todos os health checks retornando 200
- [ ] ✅ Migrations sem conflitos
- [ ] ✅ Schema consistente em todas as tabelas
- [ ] ✅ Serviços SMTP funcionando normalmente
- [ ] ✅ Deploy pipeline executando sem warnings
- [ ] ✅ Monitoramento ativo e funcional

---

*Documento criado pela equipe técnica - Versão 1.0*