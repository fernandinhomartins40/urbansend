# 🛡️ Guia de Prevenção - Migrations UltraZend SMTP

## 🎯 **Objetivo**

Este guia estabelece práticas para prevenir problemas futuros com migrations e manter a integridade do sistema.

## 📋 **Comandos de Validação**

### **Validação Manual:**
```bash
npm run validate:migrations
```

### **Validação + TypeCheck (Pré-Deploy):**
```bash
npm run pre-deploy
```

### **Testes Automatizados:**
```bash
npm test
```

## 🔧 **Sistema de Prevenção Implementado**

### **1. Validador Automatizado** (`migration-validator.js`)
- ✅ **Convenção de nomenclatura**: A01, B02, C03...
- ✅ **Ordem alfabética**: Garante execução correta
- ✅ **Duplicatas**: Detecta conflitos de numeração
- ✅ **Estrutura**: Valida exports.up/down
- ✅ **Schema**: Consistência de colunas

### **2. Testes Jest Integrados** (`migrations.test.js`)
- Executa automaticamente com `npm test`
- Integrado ao CI/CD pipeline
- Falha o build se migrations estão incorretas

### **3. Scripts Automatizados**
- `validate:migrations` - Validação completa
- `pre-deploy` - Validação + typecheck antes do deploy

## 📐 **Regras de Nomenclatura**

### **Padrão Obrigatório:**
```
[LETRA][NUMERO]_[descrição].js

Exemplos:
✅ A01_create_users_table.js
✅ B02_create_api_keys_table.js
✅ Z99_final_migration.js

❌ 001_create_users.js (formato antigo)
❌ create_users.js (sem numeração)
❌ A1_users.js (número deve ter 2 dígitos)
```

### **Sequência Alfabética:**
- A01, B02, C03... até Z99
- Máximo 26 × 99 = 2574 migrations possíveis
- Ordem de execução garantida alfabeticamente

## 🏗️ **Estrutura Obrigatória de Migrations**

```javascript
/**
 * Descrição clara da migration
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    // Lógica da migration
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    // Rollback da migration
};
```

## 🔒 **Schema Consistency Rules**

### **Tabela Users (A01):**
```javascript
// ✅ CORRETO (padrão atual)
table.boolean('is_verified').defaultTo(false);
table.string('role', 50).defaultTo('user');
table.boolean('is_active').defaultTo(true);

// ❌ INCORRETO (padrão antigo)
table.boolean('email_verified').defaultTo(false);
```

### **Migrations Defensivas:**
- T20: Corrige `email_verified` → `is_verified`
- U21: Garante tabelas críticas
- V22: Usuário sistema robusto

## 🚨 **Procedimento para Novas Migrations**

### **1. Criar Nova Migration:**
```bash
# Encontrar próxima letra disponível
ls backend/src/migrations/ | grep -o '^[A-Z]' | sort | tail -1

# Criar migration (exemplo: W23)
touch backend/src/migrations/W23_sua_nova_funcionalidade.js
```

### **2. Implementar Estrutura:**
```javascript
exports.up = async function(knex) {
    // Sua lógica aqui
};

exports.down = async function(knex) {
    // Rollback aqui
};
```

### **3. Validar Antes do Commit:**
```bash
npm run validate:migrations
npm run pre-deploy
```

### **4. Testar Localmente:**
```bash
# Database limpa
rm -f ultrazend.sqlite*
npm run migrate:latest

# Verificar se funcionou
npm test
```

## 🔄 **Integração CI/CD**

### **GitHub Actions Workflow:**
```yaml
- name: Validate Migrations
  run: npm run validate:migrations

- name: Run Tests
  run: npm test

- name: Pre-deploy Check
  run: npm run pre-deploy
```

## 📊 **Monitoramento**

### **Métricas de Sucesso:**
- ✅ 100% das validações passando
- ✅ Zero erros de schema em produção
- ✅ Deploys sem falhas de migration
- ✅ Rollbacks funcionando corretamente

### **Alertas Configurados:**
- ❌ Falha na validação → Build falha
- ❌ Teste de migration falha → Deploy bloqueado
- ❌ Schema inconsistente → Notificação imediata

## 🆘 **Troubleshooting**

### **Problema: Migration fora de ordem**
```bash
# Renomear para posição correta
mv X25_problema.js Y26_problema.js
npm run validate:migrations
```

### **Problema: Schema inconsistente**
```bash
# Executar correções defensivas
npm run migrate:latest
npm run validate:migrations
```

### **Problema: Rollback necessário**
```bash
npm run migrate:rollback
# Corrigir problema
npm run migrate:latest
```

---

**Sistema de Prevenção Ativo desde**: 2025-01-04
**Última Atualização**: 2025-01-04
**Status**: ✅ Totalmente Operacional