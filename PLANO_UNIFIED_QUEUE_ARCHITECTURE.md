# 🚀 PLANO: Unified Queue Architecture - UltraZend SaaS
## Solução Robusta Multi-Tenant sem Gambiarras

### 📋 **PROBLEMA ATUAL CONFIRMADO**
- **API**: `queueService` → fila `email-processing` ✅
- **Workers**: `TenantQueueManager` → fila `email-processing:tenant:X` ❌
- **Resultado**: **Incompatibilidade total** - jobs nunca processados

### 🎯 **ARQUITETURA UNIFICADA PROPOSTA**

#### **CONCEITO CENTRAL**
```
API → Fila Global por Tipo → Worker com Roteamento Inteligente por Tenant
```

**Benefícios:**
- ✅ **Uma fila por tipo** (performance)
- ✅ **Isolamento por tenant** (segurança)
- ✅ **Escalabilidade horizontal** (múltiplos workers)
- ✅ **Observabilidade completa** (métricas por tenant)

---

## 🏗️ **FASE 1: ANÁLISE DA APLICAÇÃO ATUAL**

### **Arquivos Existentes Relevantes**
- `src/services/queueService.ts` - ✅ **Funciona bem na API**
- `src/services/TenantQueueManager.ts` - ❌ **Filas incompatíveis**
- `src/workers/emailWorker.ts` - ❌ **Usa TenantQueueManager**
- `src/workers/queueProcessor.ts` - ❌ **Usa TenantQueueManager**
- `src/services/TenantEmailProcessor.ts` - ✅ **Isolamento funcional**

### **Código que Funciona (Manter)**
- ✅ `queueService.addEmailJob()` - API funcionando
- ✅ `TenantEmailProcessor` - Isolamento por tenant
- ✅ `TenantContextService` - Contexto de tenant
- ✅ PM2 configuration - Workers rodando

### **Código Problemático (Refatorar)**
- ❌ `TenantQueueManager` - Filas isoladas incompatíveis
- ❌ Workers usando `TenantQueueManager`

---

## 🔧 **FASE 2: IMPLEMENTAÇÃO ADAPTADA**

### **A. TenantAwareQueueService (Nova Interface Unificada)**

**Localização**: `src/services/TenantAwareQueueService.ts`

```typescript
/**
 * 🚀 UNIFIED QUEUE ARCHITECTURE
 * Interface unificada que todos os componentes usam
 * Mantém compatibilidade com queueService existente
 */

import Bull, { Queue, Job } from 'bull';
import { logger } from '../config/logger';
import { TenantContextService, TenantContext } from './TenantContextService';

export interface TenantJobData {
  tenantId: number;
  userId: number; // Compatibilidade
  queuedAt: Date;
  priority?: number;
}

export interface TenantEmailJobData extends TenantJobData {
  emailId?: number;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: any;
}

export class TenantAwareQueueService {
  private emailQueue: Queue;
  private tenantContextService: TenantContextService;
  
  constructor() {
    // ✅ Reutilizar configuração Redis existente
    const redisConfig = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0')
    };

    // ✅ Fila global por tipo (compatível com API atual)
    this.emailQueue = new Bull('email-processing', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 }
      }
    });

    this.tenantContextService = TenantContextService.getInstance();
    this.setupProcessors();
  }

  /**
   * ✅ COMPATIBILIDADE: Método idêntico ao queueService atual
   */
  async addEmailJob(emailData: any): Promise<Job> {
    const tenantId = emailData.userId;
    
    // Validações de tenant ANTES de adicionar na fila
    await this.validateTenantLimits(tenantId, 'email');
    
    // Enriquece dados com contexto do tenant
    const enrichedData: TenantEmailJobData = {
      ...emailData,
      tenantId,
      queuedAt: new Date(),
      priority: await this.getTenantPriority(tenantId)
    };

    return this.emailQueue.add('send-email', enrichedData, {
      priority: enrichedData.priority || 0
    });
  }

  /**
   * 🔒 VALIDAÇÕES POR TENANT
   */
  private async validateTenantLimits(tenantId: number, operation: string): Promise<void> {
    try {
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      // Rate limiting por tenant
      const hourlyUsage = await this.getHourlyUsage(tenantId);
      const hourlyLimit = Math.floor(context.planLimits.emailsPerDay / 24);
      
      if (hourlyUsage >= hourlyLimit) {
        throw new Error(`Tenant ${tenantId} excedeu limite horário: ${hourlyUsage}/${hourlyLimit}`);
      }

      logger.debug('Tenant validation passed', {
        tenantId,
        operation,
        hourlyUsage,
        hourlyLimit
      });
    } catch (error) {
      logger.error('Tenant validation failed', { tenantId, operation, error });
      throw error;
    }
  }

  private async getTenantPriority(tenantId: number): Promise<number> {
    try {
      const context = await this.tenantContextService.getTenantContext(tenantId);
      
      // Prioridade baseada no plano
      const planPriority = {
        'free': 0,
        'basic': 5,
        'premium': 10,
        'enterprise': 20
      };
      
      return planPriority[context.plan] || 0;
    } catch {
      return 0; // Default priority
    }
  }

  private async getHourlyUsage(tenantId: number): Promise<number> {
    // Implementar cache Redis para contadores por tenant
    const key = `tenant:${tenantId}:hourly:${new Date().getHours()}`;
    // Retornar contagem atual
    return 0; // Placeholder
  }

  /**
   * 🔧 SETUP DOS PROCESSORS (Roteamento Inteligente)
   */
  private setupProcessors(): void {
    this.emailQueue.process('send-email', 5, async (job: Job<TenantEmailJobData>) => {
      return await this.processEmailWithTenantIsolation(job);
    });
  }

  /**
   * 🔒 PROCESSAMENTO COM ISOLAMENTO TOTAL POR TENANT
   */
  private async processEmailWithTenantIsolation(job: Job<TenantEmailJobData>): Promise<any> {
    const { tenantId } = job.data;
    const startTime = Date.now();

    try {
      // 1. Obter contexto isolado do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      
      // 2. ✅ REUTILIZAR TenantEmailProcessor existente
      const { TenantEmailProcessor } = await import('./TenantEmailProcessor');
      const processor = new TenantEmailProcessor();
      
      // 3. Processar com isolamento total
      const result = await processor.processEmailJob(job);

      logger.info('Tenant email processed successfully', {
        tenantId,
        jobId: job.id,
        processingTime: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Tenant email processing failed', {
        tenantId,
        jobId: job.id,
        error: error.message,
        processingTime: Date.now() - startTime
      });
      
      throw error;
    }
  }
}
```

### **B. Adaptação dos Workers Existentes**

**Modificar**: `src/workers/emailWorker.ts`

```typescript
// ❌ ANTES (TenantQueueManager)
import { TenantQueueManager } from '../services/TenantQueueManager';

class TenantEmailWorker {
  private tenantQueueManager: TenantQueueManager;
  // ...
}

// ✅ DEPOIS (TenantAwareQueueService)
import { TenantAwareQueueService } from '../services/TenantAwareQueueService';

class TenantEmailWorker {
  private queueService: TenantAwareQueueService;

  constructor() {
    this.queueService = new TenantAwareQueueService();
  }

  async start(): Promise<void> {
    logger.info('🚀 TenantAwareEmailWorker iniciando...');
    // Workers são automaticamente inicializados no TenantAwareQueueService
    logger.info('✅ Worker conectado à arquitetura unificada');
  }
}
```

### **C. Adaptação da API (Zero Breaking Changes)**

**Modificar**: `src/routes/emails.ts`

```typescript
// ❌ ANTES
import { queueService } from '../services/queueService';
const job = await queueService.addEmailJob(emailData);

// ✅ DEPOIS (Transição gradual)
import { TenantAwareQueueService } from '../services/TenantAwareQueueService';

// Feature flag para migração gradual
const USE_UNIFIED_QUEUE = process.env.ENABLE_UNIFIED_QUEUE === 'true';

const queueService = USE_UNIFIED_QUEUE 
  ? new TenantAwareQueueService()
  : require('../services/queueService').queueService;

const job = await queueService.addEmailJob(emailData);
```

---

## 🚀 **FASE 3: PLANO DE MIGRAÇÃO**

### **Etapa 1: Preparação (30 min)**
```bash
# 1. Criar arquivo da nova arquitetura
touch src/services/TenantAwareQueueService.ts

# 2. Backup dos workers atuais
cp src/workers/emailWorker.ts src/workers/emailWorker.ts.backup
cp src/workers/queueProcessor.ts src/workers/queueProcessor.ts.backup

# 3. Implementar TenantAwareQueueService
```

### **Etapa 2: Teste em Desenvolvimento (15 min)**
```bash
# 1. Ativar feature flag
echo "ENABLE_UNIFIED_QUEUE=true" >> backend/.env.development

# 2. Testar compilação
npm run typecheck
npm run build

# 3. Testar localmente
npm run dev
```

### **Etapa 3: Deploy Gradual (45 min)**
```bash
# 1. Deploy com feature flag OFF
git commit -m "feat: add TenantAwareQueueService (disabled)"
bash local-deploy-enhanced.sh

# 2. Ativar gradualmente no servidor
ssh root@ultrazend.com.br 'echo "ENABLE_UNIFIED_QUEUE=true" >> /var/www/ultrazend/backend/.env'

# 3. Restart workers
ssh root@ultrazend.com.br 'pm2 restart ultrazend-email-worker ultrazend-queue-processor'

# 4. Testar envio de email
# 5. Monitorar logs por 30 minutos
```

### **Etapa 4: Limpeza (15 min)**
```bash
# Após confirmação de funcionamento
# 1. Remover código antigo
rm src/services/TenantQueueManager.ts

# 2. Commit final
git commit -m "refactor: complete migration to TenantAwareQueueService"
```

---

## 📊 **FASE 4: VALIDAÇÃO E MÉTRICAS**

### **A. Testes de Funcionamento**
```bash
# 1. Teste de envio básico
curl -X POST https://ultrazend.com.br/api/emails/send \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"to":"test@example.com","subject":"Teste Unified Queue","html":"<p>Teste</p>"}'

# 2. Verificar processamento
redis-cli llen "bull:email-processing:waiting"
redis-cli llen "bull:email-processing:completed"

# 3. Verificar banco de dados
sqlite3 ultrazend.sqlite "SELECT COUNT(*) FROM emails WHERE status='sent';"
```

### **B. Monitoramento por Tenant**
```typescript
// Adicionar endpoint para métricas por tenant
// GET /api/admin/tenant/:id/queue-stats
{
  "tenantId": 2,
  "queue": {
    "processed": 150,
    "failed": 2,
    "waiting": 0,
    "hourlyLimit": 100,
    "hourlyUsage": 45
  },
  "performance": {
    "avgProcessingTime": "1.2s",
    "successRate": "98.7%"
  }
}
```

---

## 🎯 **FASE 5: BENEFÍCIOS ALCANÇADOS**

### **Imediatos (Dia 1)**
- ✅ **Emails funcionando** - Jobs processados corretamente
- ✅ **Zero downtime** - Migração gradual sem interrupção
- ✅ **Compatibilidade total** - API não muda

### **Médio Prazo (Semana 1)**
- ✅ **Isolamento por tenant** - Segurança multi-tenant
- ✅ **Rate limiting inteligente** - Controle por plano
- ✅ **Métricas detalhadas** - Observabilidade completa

### **Longo Prazo (Mês 1)**
- ✅ **Escalabilidade horizontal** - Múltiplos workers
- ✅ **Performance otimizada** - Filas eficientes
- ✅ **Manutenibilidade** - Código limpo e robusto

---

## 🔧 **CONFIGURAÇÕES FINAIS**

### **Environment Variables**
```bash
# Unified Queue Configuration
ENABLE_UNIFIED_QUEUE=true
QUEUE_PROCESSING_CONCURRENCY=5
TENANT_PRIORITY_ENABLED=true
TENANT_RATE_LIMITING_ENABLED=true

# Redis Optimizations
REDIS_MAX_RETRIES=3
REDIS_CONNECT_TIMEOUT=60000
REDIS_COMMAND_TIMEOUT=5000
```

### **PM2 Ecosystem (Otimizado)**
```javascript
// ecosystem.config.js - Workers otimizados
{
  name: 'ultrazend-unified-worker',
  script: 'dist/workers/emailWorker.js',
  instances: 2, // ✅ Scale horizontal
  exec_mode: 'cluster',
  env_production: {
    ENABLE_UNIFIED_QUEUE: 'true',
    REDIS_ENABLED: 'true'
  }
}
```

---

## 📋 **CHECKLIST FINAL**

### **Pré-Deploy**
- [ ] `TenantAwareQueueService.ts` implementado
- [ ] Workers adaptados para nova arquitetura
- [ ] Feature flag configurada
- [ ] Testes locais passando
- [ ] Backup realizado

### **Deploy**
- [ ] Deploy com feature flag OFF
- [ ] Ativação gradual da feature
- [ ] Restart dos workers
- [ ] Teste de envio de email
- [ ] Monitoramento por 30 min

### **Pós-Deploy**
- [ ] Jobs processados corretamente
- [ ] Banco de dados recebendo emails
- [ ] Logs sem erros
- [ ] Métricas funcionando
- [ ] Limpeza do código antigo

---

## 🎊 **RESULTADO ESPERADO**

**Arquitetura Enterprise Multi-Tenant Real:**
- 🚀 **Performance**: Uma fila eficiente por tipo
- 🔒 **Isolamento**: Total separação entre tenants
- 📊 **Observabilidade**: Métricas detalhadas por tenant
- ⚡ **Escalabilidade**: Workers horizontais automáticos
- 🛡️ **Robustez**: Rate limiting e validações por tenant

**Zero gambiarras. Código limpo. Arquitetura profissional.** ✨

---

*Plano criado para resolver definitivamente o problema de filas incompatíveis e estabelecer uma arquitetura multi-tenant robusta e escalável.*