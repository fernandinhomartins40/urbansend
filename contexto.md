        67 -    private async initializeTables(): Promise<void> {
        67 +    private async validateRequiredTables(): Promise<void> {
        68        try {
        69 -        // Tabela de eventos de email
        70 -        const hasEmailEvents = await this.db.schema.hasTable('email_events');
        71 -        if (!hasEmailEvents) {
        72 -          await this.db.schema.createTable('email_events', (table) => {
        73 -            table.increments('id').primary();
        74 -            table.string('email_id').notNullable();
        75 -            table.string('campaign_id').nullable();
        76 -            table.string('user_id').nullable();
        77 -            table.string('event_type').notNullable();
        78 -            table.datetime('timestamp').notNullable();
        79 -            table.string('recipient_email').nullable();
        80 -            table.string('domain').nullable();
        81 -            table.string('ip_address').nullable();
        82 -            table.text('user_agent').nullable();
        83 -            table.text('metadata').nullable();
        84 -            table.datetime('created_at').defaultTo(this.db.fn.now());
        85 -          });
        86 -        }
        69 +        const requiredTables = [
        70 +          'email_events',
        71 +          'campaign_metrics',
        72 +          'domain_metrics',
        73 +          'time_series_metrics',
        74 +          'user_engagement'
        75 +        ];
        76
        77 -        // Tabela de métricas agregadas por campanha
        78 -        const hasCampaignMetrics = await this.db.schema.hasTable('campaign_metrics');
        79 -        if (!hasCampaignMetrics) {
        80 -          await this.db.schema.createTable('campaign_metrics', (table) => {
        81 -            table.increments('id').primary();
        82 -            table.string('campaign_id').unique().notNullable();
        83 -            table.string('campaign_name').nullable();
        84 -            table.integer('emails_sent').defaultTo(0);
        85 -            table.integer('emails_delivered').defaultTo(0);
        86 -            table.integer('emails_opened').defaultTo(0);
        87 -            table.integer('emails_clicked').defaultTo(0);
        88 -            table.integer('emails_bounced').defaultTo(0);
        89 -            table.integer('emails_complained').defaultTo(0);
        90 -            table.integer('emails_unsubscribed').defaultTo(0);
        91 -            table.datetime('last_updated').defaultTo(this.db.fn.now());
        92 -            table.datetime('created_at').defaultTo(this.db.fn.now());
        93 -          });
        77 +        for (const tableName of requiredTables) {
        78 +          const hasTable = await this.db.schema.hasTable(tableName);
        79 +          if (!hasTable) {
        80 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);       
        81 +          }
        82          }
        83
        84 -        // Tabela de métricas por domínio
        85 -        const hasDomainMetrics = await this.db.schema.hasTable('domain_metrics');
        86 -        if (!hasDomainMetrics) {
        87 -          await this.db.schema.createTable('domain_metrics', (table) => {
        88 -            table.increments('id').primary();
        89 -            table.string('domain').unique().notNullable();
        90 -            table.decimal('reputation_score', 3, 2).defaultTo(1.0);
        91 -            table.integer('total_emails').defaultTo(0);
        92 -            table.integer('successful_deliveries').defaultTo(0);
        93 -            table.integer('bounces').defaultTo(0);
        94 -            table.integer('complaints').defaultTo(0);
        95 -            table.datetime('last_delivery').nullable();
        96 -            table.datetime('last_updated').defaultTo(this.db.fn.now());
        97 -            table.datetime('created_at').defaultTo(this.db.fn.now());
        98 -          });
        99 -        }
       100 -  
       101 -        // Tabela de séries temporais para métricas
       102 -        const hasTimeSeriesMetrics = await this.db.schema.hasTable('time_series_metrics');
       103 -        if (!hasTimeSeriesMetrics) {
       104 -          await this.db.schema.createTable('time_series_metrics', (table) => {
       105 -            table.increments('id').primary();
       106 -            table.datetime('timestamp').notNullable();
       107 -            table.string('metric_name').notNullable();
       108 -            table.decimal('metric_value', 15, 4).notNullable();
       109 -            table.text('tags').nullable();
       110 -            table.datetime('created_at').defaultTo(this.db.fn.now());
       111 -          });
       112 -        }
       113 -  
       114 -        // Tabela de engajamento de usuários
       115 -        const hasUserEngagement = await this.db.schema.hasTable('user_engagement');
       116 -        if (!hasUserEngagement) {
       117 -          await this.db.schema.createTable('user_engagement', (table) => {
       118 -            table.increments('id').primary();
       119 -            table.string('user_id').notNullable();
       120 -            table.string('email_address').notNullable();
       121 -            table.integer('total_emails_received').defaultTo(0);
       122 -            table.integer('total_opens').defaultTo(0);
       123 -            table.integer('total_clicks').defaultTo(0);
       124 -            table.datetime('last_open').nullable();
       125 -            table.datetime('last_click').nullable();
       126 -            table.decimal('engagement_score', 3, 2).defaultTo(0);
       127 -            table.boolean('is_active').defaultTo(true);
       128 -            table.datetime('last_updated').defaultTo(this.db.fn.now());
       129 -            table.datetime('created_at').defaultTo(this.db.fn.now());
       130 -          });
       131 -        }
       132 -  
       133 -        // Índices para performance (criar sempre, Knex ignora se já existem)
       134 -        try {
       135 -          await this.db.schema.alterTable('email_events', (table) => {
       136 -            table.index(['email_id'], 'idx_email_events_email_id');
       137 -            table.index(['campaign_id'], 'idx_email_events_campaign_id');
       138 -            table.index(['timestamp'], 'idx_email_events_timestamp');
       139 -          });
       140 -        } catch (error) {
       141 -          // Índices podem já existir, ignorar erro
       142 -        }
       143 -        
       144 -        try {
       145 -          await this.db.schema.alterTable('time_series_metrics', (table) => {
       146 -            table.index(['timestamp'], 'idx_time_series_timestamp');
       147 -          });
       148 -        } catch (error) {
       149 -          // Índices podem já existir, ignorar erro
       150 -        }
       151 -        
       152 -        try {
       153 -          await this.db.schema.alterTable('domain_metrics', (table) => {
       154 -            table.index(['domain'], 'idx_domain_metrics_domain');
       155 -          });
       156 -        } catch (error) {
       157 -          // Índices podem já existir, ignorar erro
       158 -        }
       159 -  
       160 -        logger.info('AnalyticsService: Tabelas inicializadas com sucesso');
        84 +        logger.info('AnalyticsService: Todas as tabelas obrigatórias validadas com sucesso');
        85        } catch (error) {
        86 -        logger.error('Erro ao inicializar tabelas do AnalyticsService:', error);
        86 +        logger.error('Erro ao validar tabelas do AnalyticsService:', error);
        87          throw error;
        88        }
        89      }

✻ Thinking…

  Excelente! AnalyticsService refatorado com sucesso. Agora preciso continuar com o MonitoringService. Vou lê-lo.

● ✅ AnalyticsService refatorado! (121 linhas → 22 linhas)

  Agora vou ler o MonitoringService:

● Read(backend\src\services\monitoringService.ts)
  ⎿  Read 858 lines (ctrl+r to expand)

✻ Thinking…

  Excelente! Encontrei o MonitoringService. Posso ver que:

  1. Linha 39: O construtor chama this.initializeTables()
  2. Linhas 44-141: O método initializeTables() cria 4 tabelas:
    - system_metrics
    - health_checks
    - request_metrics
    - email_metrics
  
  Vou refatorar seguindo o mesmo padrão.

● Vou refatorar o MonitoringService agora:

  🔍 Análise MonitoringService:
  - Linha 39: Construtor chama initializeTables()
  - Linhas 44-141: Cria 4 tabelas: system_metrics, health_checks, request_metrics, email_metrics

● Update(backend\src\services\monitoringService.ts)
  ⎿  Updated backend\src\services\monitoringService.ts with 1 addition and 1 removal
       36      constructor(database?: Knex) {
       37        this.db = database || db;
       38    
       39 -      this.initializeTables();
       39 +      this.validateRequiredTables();
       40        this.startHealthChecks();
       41        this.startMetricsCleanup();
       42      }

✻ Thinking…

  Agora preciso substituir o método initializeTables() por validateRequiredTables(). Vou fazer isso agora.

● Update(backend\src\services\monitoringService.ts)
  ⎿  Updated backend\src\services\monitoringService.ts with 14 additions and 90 removals
        41        this.startMetricsCleanup();
        42      }
        43    
        44 -    private async initializeTables(): Promise<void> {
        44 +    private async validateRequiredTables(): Promise<void> {
        45        try {
        46 -        // Tabela de métricas
        47 -        const hasSystemMetrics = await this.db.schema.hasTable('system_metrics');
        48 -        if (!hasSystemMetrics) {
        49 -          await this.db.schema.createTable('system_metrics', (table) => {
        50 -            table.increments('id').primary();
        51 -            table.string('metric_name').notNullable();
        52 -            table.decimal('metric_value', 15, 4).notNullable();
        53 -            table.text('labels').nullable();
        54 -            table.datetime('timestamp').defaultTo(this.db.fn.now());
        55 -            table.datetime('created_at').defaultTo(this.db.fn.now());
        56 -          });
        57 -        }
        46 +        const requiredTables = [
        47 +          'system_metrics',
        48 +          'health_checks',
        49 +          'request_metrics',
        50 +          'email_metrics'
        51 +        ];
        52
        53 -        // Tabela de health checks
        54 -        const hasHealthChecks = await this.db.schema.hasTable('health_checks');
        55 -        if (!hasHealthChecks) {
        56 -          await this.db.schema.createTable('health_checks', (table) => {
        57 -            table.increments('id').primary();
        58 -            table.string('service_name').notNullable();
        59 -            table.boolean('is_healthy').notNullable();
        60 -            table.text('details').nullable();
        61 -            table.text('error_message').nullable();
        62 -            table.integer('response_time_ms').nullable();
        63 -            table.datetime('timestamp').defaultTo(this.db.fn.now());
        64 -          });
        53 +        for (const tableName of requiredTables) {
        54 +          const hasTable = await this.db.schema.hasTable(tableName);
        55 +          if (!hasTable) {
        56 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);       
        57 +          }
        58          }
        59
        60 -        // Tabela de performance de requests
        61 -        const hasRequestMetrics = await this.db.schema.hasTable('request_metrics');
        62 -        if (!hasRequestMetrics) {
        63 -          await this.db.schema.createTable('request_metrics', (table) => {
        64 -            table.increments('id').primary();
        65 -            table.string('method').notNullable();
        66 -            table.string('route').notNullable();
        67 -            table.integer('status_code').notNullable();
        68 -            table.decimal('response_time_ms', 10, 2).notNullable();
        69 -            table.decimal('memory_usage_mb', 10, 2).nullable();
        70 -            table.decimal('cpu_usage_percent', 5, 2).nullable();
        71 -            table.datetime('timestamp').defaultTo(this.db.fn.now());
        72 -          });
        73 -        }
        74 -  
        75 -        // Tabela de métricas de email
        76 -        const hasEmailMetrics = await this.db.schema.hasTable('email_metrics');
        77 -        if (!hasEmailMetrics) {
        78 -          await this.db.schema.createTable('email_metrics', (table) => {
        79 -            table.increments('id').primary();
        80 -            table.string('metric_type').notNullable();
        81 -            table.integer('user_id').nullable();
        82 -            table.string('domain').nullable();
        83 -            table.string('mx_server').nullable();
        84 -            table.string('status').nullable();
        85 -            table.integer('count').defaultTo(1);
        86 -            table.datetime('timestamp').defaultTo(this.db.fn.now());
        87 -          });
        88 -        }
        89 -  
        90 -        // Índices para performance (criar sempre, ignorar erros se já existem)
        91 -        try {
        92 -          await this.db.schema.alterTable('system_metrics', (table) => {
        93 -            table.index(['timestamp'], 'idx_system_metrics_timestamp');
        94 -          });
        95 -        } catch (error) {
        96 -          // Índice pode já existir
        97 -        }
        98 -  
        99 -        try {
       100 -          await this.db.schema.alterTable('health_checks', (table) => {
       101 -            table.index(['service_name', 'timestamp'], 'idx_health_checks_service');
       102 -          });
       103 -        } catch (error) {
       104 -          // Índice pode já existir
       105 -        }
       106 -  
       107 -        try {
       108 -          await this.db.schema.alterTable('request_metrics', (table) => {
       109 -            table.index(['route', 'timestamp'], 'idx_request_metrics_route');
       110 -          });
       111 -        } catch (error) {
       112 -          // Índice pode já existir
       113 -        }
       114 -  
       115 -        try {
       116 -          await this.db.schema.alterTable('email_metrics', (table) => {
       117 -            table.index(['metric_type', 'timestamp'], 'idx_email_metrics_type');
       118 -          });
       119 -        } catch (error) {
       120 -          // Índice pode já existir
       121 -        }
       122 -  
       123 -        logger.info('MonitoringService: Tabelas de monitoramento inicializadas');
        60 +        logger.info('MonitoringService: Todas as tabelas obrigatórias validadas com sucesso');
        61        } catch (error) {
        62 -        logger.error('Erro ao inicializar tabelas de monitoramento:', error);
        62 +        logger.error('Erro ao validar tabelas do MonitoringService:', error);
        63          throw error;
        64        }
        65      }

✻ Thinking…

  Excelente! MonitoringService refatorado com sucesso (97 linhas → 21 linhas). Agora vou ler o último serviço deste grupo: 
  QueueMonitorService.

● ✅ MonitoringService refatorado! (97 linhas → 21 linhas)

  Agora vou ler o último do grupo - QueueMonitorService:

● Read(backend\src\services\queueMonitorService.ts)
  ⎿  Read 777 lines (ctrl+r to expand)

✻ Thinking…

  Perfeito! Encontrei o QueueMonitorService. Posso ver que:
  
  1. Linha 56: O construtor chama this.initializeTables()
  2. Linhas 60-155: O método initializeTables() cria 4 tabelas:
    - queue_metrics
    - queue_alerts 
    - alert_history
    - queue_health_checks
  
  Vou refatorar seguindo o mesmo padrão.

● Vou refatorar o QueueMonitorService - o último deste grupo:

  🔍 Análise QueueMonitorService:
  - Linha 56: Construtor chama initializeTables()
  - Linhas 60-155: Cria 4 tabelas: queue_metrics, queue_alerts, alert_history, queue_health_checks

● Update(backend\src\services\queueMonitorService.ts)
  ⎿  Updated backend\src\services\queueMonitorService.ts with 1 addition and 1 removal
       53        this.queues = queues;
       54        this.db = database || db;
       55        
       56 -      this.initializeTables();
       56 +      this.validateRequiredTables();
       57        this.loadAlertConfigs();
       58      }
       59    

✻ Thinking…

  Agora preciso substituir o método initializeTables() por validateRequiredTables().

● Update(backend\src\services\queueMonitorService.ts)
  ⎿  Updated backend\src\services\queueMonitorService.ts with 14 additions and 88 removals
        57        this.loadAlertConfigs();
        58      }
        59    
        60 -    private async initializeTables(): Promise<void> {
        60 +    private async validateRequiredTables(): Promise<void> {
        61        try {
        62 -        // Tabela de métricas de fila
        63 -        const hasQueueMetrics = await this.db.schema.hasTable('queue_metrics');
        64 -        if (!hasQueueMetrics) {
        65 -          await this.db.schema.createTable('queue_metrics', (table) => {
        66 -            table.increments('id').primary();
        67 -            table.string('queue_name').notNullable();
        68 -            table.integer('waiting_jobs').defaultTo(0);
        69 -            table.integer('active_jobs').defaultTo(0);
        70 -            table.integer('completed_jobs').defaultTo(0);
        71 -            table.integer('failed_jobs').defaultTo(0);
        72 -            table.integer('delayed_jobs').defaultTo(0);
        73 -            table.boolean('is_paused').defaultTo(false);
        74 -            table.decimal('processing_rate', 10, 2).defaultTo(0);
        75 -            table.decimal('completion_rate', 5, 2).defaultTo(0);
        76 -            table.decimal('failure_rate', 5, 2).defaultTo(0);
        77 -            table.datetime('timestamp').defaultTo(this.db.fn.now());
        78 -            table.datetime('created_at').defaultTo(this.db.fn.now());
        79 -          });
        80 -        }
        62 +        const requiredTables = [
        63 +          'queue_metrics',
        64 +          'queue_alerts',
        65 +          'alert_history',
        66 +          'queue_health_checks'
        67 +        ];
        68
        69 -        // Tabela de alertas
        70 -        const hasQueueAlerts = await this.db.schema.hasTable('queue_alerts');
        71 -        if (!hasQueueAlerts) {
        72 -          await this.db.schema.createTable('queue_alerts', (table) => {
        73 -            table.increments('id').primary();
        74 -            table.string('alert_id').unique().notNullable();
        75 -            table.string('name').notNullable();
        76 -            table.string('queue_name').nullable();
        77 -            table.string('condition_type').notNullable();
        78 -            table.decimal('threshold_value', 10, 2).notNullable();
        79 -            table.boolean('is_enabled').defaultTo(true);
        80 -            table.integer('cooldown_minutes').defaultTo(15);
        81 -            table.text('webhook_url').nullable();
        82 -            table.text('email_recipients').nullable();
        83 -            table.datetime('created_at').defaultTo(this.db.fn.now());
        84 -            table.datetime('updated_at').defaultTo(this.db.fn.now());
        85 -          });
        69 +        for (const tableName of requiredTables) {
        70 +          const hasTable = await this.db.schema.hasTable(tableName);
        71 +          if (!hasTable) {
        72 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);       
        73 +          }
        74          }
        75
        76 -        // Tabela de histórico de alertas
        77 -        const hasAlertHistory = await this.db.schema.hasTable('alert_history');
        78 -        if (!hasAlertHistory) {
        79 -          await this.db.schema.createTable('alert_history', (table) => {
        80 -            table.increments('id').primary();
        81 -            table.string('alert_id').notNullable();
        82 -            table.string('queue_name').nullable();
        83 -            table.string('condition_type').notNullable();
        84 -            table.decimal('trigger_value', 10, 2).nullable();
        85 -            table.decimal('threshold_value', 10, 2).nullable();
        86 -            table.text('message').nullable();
        87 -            table.boolean('resolved').defaultTo(false);
        88 -            table.datetime('triggered_at').defaultTo(this.db.fn.now());
        89 -            table.datetime('resolved_at').nullable();
        90 -          });
        91 -        }
        92 -  
        93 -        // Tabela de health checks
        94 -        const hasQueueHealthChecks = await this.db.schema.hasTable('queue_health_checks');
        95 -        if (!hasQueueHealthChecks) {
        96 -          await this.db.schema.createTable('queue_health_checks', (table) => {
        97 -            table.increments('id').primary();
        98 -            table.string('overall_status').notNullable();
        99 -            table.boolean('redis_connected').defaultTo(true);
       100 -            table.integer('total_jobs').defaultTo(0);
       101 -            table.integer('total_failures').defaultTo(0);
       102 -            table.integer('issues_count').defaultTo(0);
       103 -            table.text('issues_details').nullable();
       104 -            table.datetime('timestamp').defaultTo(this.db.fn.now());
       105 -          });
       106 -        }
       107 -  
       108 -        // Índices para performance (criar sempre, ignorar erros se já existem)
       109 -        try {
       110 -          await this.db.schema.alterTable('queue_metrics', (table) => {
       111 -            table.index(['queue_name', 'timestamp'], 'idx_queue_metrics_name_timestamp');
       112 -          });
       113 -        } catch (error) {
       114 -          // Índice pode já existir
       115 -        }
       116 -  
       117 -        try {
       118 -          await this.db.schema.alterTable('alert_history', (table) => {
       119 -            table.index(['alert_id', 'triggered_at'], 'idx_alert_history_alert_id');
       120 -          });
       121 -        } catch (error) {
       122 -          // Índice pode já existir
       123 -        }
       124 -  
       125 -        logger.info('QueueMonitorService: Tabelas inicializadas com sucesso');
        76 +        logger.info('QueueMonitorService: Todas as tabelas obrigatórias validadas com sucesso');
        77        } catch (error) {
        78 -        logger.error('Erro ao inicializar tabelas do QueueMonitorService:', error);
        78 +        logger.error('Erro ao validar tabelas do QueueMonitorService:', error);
        79          throw error;
        80        }
        81      }

✻ Thinking…

  Excelente! QueueMonitorService refatorado com sucesso (95 linhas → 21 linhas). Agora vou atualizar o todo list para marcar este 
  grupo como completo e seguir para o próximo grupo.

● ✅ QueueMonitorService refatorado! (95 linhas → 21 linhas)

  🎉 Grupo completo! AnalyticsService + MonitoringService + QueueMonitorService refatorados com sucesso!

  Vou atualizar o progresso e seguir para o último grupo:

✻ Thinking…

  Agora preciso encontrar os últimos serviços para refatorar: EmailProcessor, DeliveryManager, DKIMManager, WebhookService e 
  SMTPServer. Vou buscar pelos arquivos desses serviços.

● Vou buscar pelo último grupo: EmailProcessor + DeliveryManager + DKIMManager + WebhookService + SMTPServer:

● Search(pattern: "class.*(EmailProcessor|DeliveryManager|DKIMManager|WebhookService|SMTPServer)|createTable.*processed_emails|creat
        eTable.*dkim_keys|createTable.*webhook_logs", path: "backend\src")
  ⎿  Found 9 files (ctrl+r to expand)

✻ Thinking…

  Perfeito! Encontrei todos os 5 serviços do último grupo:
  - emailProcessor.ts
  - deliveryManager.ts
  - dkimManager.ts  
  - webhookService.ts
  - smtpServer.ts

  Vou ler cada um deles para identificar onde estão criando tabelas. Começarei pelo EmailProcessor.

● Perfeito! Encontrei todos os 5 serviços finais. Vou ler o EmailProcessor primeiro:

● Read(backend\src\services\emailProcessor.ts)
  ⎿  Read 200 lines (ctrl+r to expand)

✻ Thinking…

  Perfeito! Encontrei o EmailProcessor. Posso ver que:
  
  1. Linha 52: O construtor chama this.initializeProcessor()
  2. Linha 58: initializeProcessor() chama await this.createEmailTables()  
  3. Linhas 99-183: O método createEmailTables() cria 3 tabelas:
    - processed_emails
    - local_domains
    - email_quarantine
  
  Vou refatorar seguindo o mesmo padrão.

● 🔍 Análise EmailProcessor:
  - Linha 52: Construtor chama initializeProcessor()
  - Linha 58: initializeProcessor() chama createEmailTables()
  - Linhas 99-183: Cria 3 tabelas: processed_emails, local_domains, email_quarantine

● Update(backend\src\services\emailProcessor.ts)
  ⎿  Updated backend\src\services\emailProcessor.ts with 1 addition and 1 removal
       54    
       55      private async initializeProcessor() {
       56        try {
       57 +        await this.validateRequiredTables();
       58          await this.loadLocalDomains();
       59 -        await this.createEmailTables();
       59
       60          logger.info('EmailProcessor initialized successfully', {
       61            localDomains: this.localDomains.size

✻ Thinking…

  Agora preciso substituir o método createEmailTables() por validateRequiredTables().

● Update(backend\src\services\emailProcessor.ts)
  ⎿  Updated backend\src\services\emailProcessor.ts with 14 additions and 78 removals
        96        }
        97      }
        98    
        99 -    private async createEmailTables() {
        99 +    private async validateRequiredTables() {
       100        try {
       101 -        // Tabela para emails processados
       102 -        const hasProcessedEmailsTable = await db.schema.hasTable('processed_emails');
       103 -        if (!hasProcessedEmailsTable) {
       104 -          await db.schema.createTable('processed_emails', (table) => {
       105 -            table.increments('id').primary();
       106 -            table.string('message_id', 255).unique();
       107 -            table.string('from_address', 255).notNullable();
       108 -            table.string('to_address', 255).notNullable();
       109 -            table.string('subject', 500);
       110 -            table.string('direction', 20).notNullable(); // 'incoming', 'outgoing'
       111 -            table.string('status', 50).notNullable(); // 'delivered', 'queued', 'rejected', 'quarantined'
       112 -            table.string('processing_result', 100);
       113 -            table.text('rejection_reason');
       114 -            table.json('security_checks');
       115 -            table.integer('size_bytes');
       116 -            table.boolean('has_attachments').defaultTo(false);
       117 -            table.integer('attachment_count').defaultTo(0);
       118 -            table.boolean('dkim_valid');
       119 -            table.string('spf_result', 20);
       120 -            table.timestamp('processed_at').defaultTo(db.fn.now());
       121 -            table.timestamps(true, true);
       122 -
       123 -            table.index(['direction', 'status']);
       124 -            table.index('processed_at');
       125 -            table.index('from_address');
       126 -          });
       127 -        }
       101 +        const requiredTables = [
       102 +          'processed_emails',
       103 +          'local_domains',
       104 +          'email_quarantine'
       105 +        ];
       106
       107 -        // Tabela para domínios locais
       108 -        const hasLocalDomainsTable = await db.schema.hasTable('local_domains');
       109 -        if (!hasLocalDomainsTable) {
       110 -          await db.schema.createTable('local_domains', (table) => {
       111 -            table.increments('id').primary();
       112 -            table.string('domain', 255).notNullable().unique();
       113 -            table.boolean('is_active').defaultTo(true);
       114 -            table.boolean('accept_all').defaultTo(false); // Aceitar todos os emails para este domínio
       115 -            table.text('description');
       116 -            table.timestamps(true, true);
       117 -
       118 -            table.index('domain');
       119 -            table.index('is_active');
       120 -          });
       121 -  
       122 -          // Inserir domínio padrão
       123 -          await db('local_domains').insert({
       124 -            domain: 'ultrazend.com.br',
       125 -            is_active: true,
       126 -            accept_all: false,
       127 -            description: 'Primary UltraZend domain'
       128 -          });
       107 +        for (const tableName of requiredTables) {
       108 +          const hasTable = await db.schema.hasTable(tableName);
       109 +          if (!hasTable) {
       110 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);       
       111 +          }
       112          }
       113
       114 -        // Tabela para quarentena de emails
       115 -        const hasQuarantineTable = await db.schema.hasTable('email_quarantine');
       116 -        if (!hasQuarantineTable) {
       117 -          await db.schema.createTable('email_quarantine', (table) => {
       118 -            table.increments('id').primary();
       119 -            table.string('message_id', 255).unique();
       120 -            table.string('from_address', 255).notNullable();
       121 -            table.string('to_address', 255).notNullable();
       122 -            table.string('subject', 500);
       123 -            table.text('reason').notNullable();
       124 -            table.string('severity', 20).defaultTo('medium');
       125 -            table.text('email_content', 'longtext');
       126 -            table.json('headers');
       127 -            table.json('security_details');
       128 -            table.boolean('reviewed').defaultTo(false);
       129 -            table.string('action_taken', 50);
       130 -            table.timestamp('quarantined_at').defaultTo(db.fn.now());
       131 -            table.timestamp('reviewed_at');
       132 -            table.timestamps(true, true);
       133 -
       134 -            table.index('quarantined_at');
       135 -            table.index('reviewed');
       136 -            table.index('severity');
       137 -          });
       138 -        }
       139 -  
       140 -        logger.info('Email processing tables created successfully');
       114 +        logger.info('EmailProcessor: Todas as tabelas obrigatórias validadas com sucesso');
       115        } catch (error) {
       116 -        logger.error('Failed to create email processing tables', { error });
       116 +        logger.error('Erro ao validar tabelas do EmailProcessor:', error);
       117 +        throw error;
       118        }
       119      }
       120

✻ Thinking…

  Excelente! EmailProcessor refatorado com sucesso (84 linhas → 20 linhas). Agora vou ler o próximo serviço: DeliveryManager.

● ✅ EmailProcessor refatorado! (84 linhas → 20 linhas)

  Vou ler o próximo: DeliveryManager:

● Read(backend\src\services\deliveryManager.ts)
  ⎿  Read 120 lines (ctrl+r to expand)

✻ Thinking…

  Vou procurar pelo método createDeliveryTables() no DeliveryManager. Vou ler mais do arquivo para encontrar onde estão as tabelas 
  sendo criadas.

● Vou buscar pelo método createDeliveryTables() no DeliveryManager:

● Search(pattern: "createDeliveryTables|createTable.*delivery", path: "backend\src\services\deliveryManager.ts", output_mode:       
        "content")
  ⎿  Found 140 lines (ctrl+r to expand)

✻ Thinking…

  Perfeito! Encontrei o DeliveryManager. Posso ver que:
  
  1. Linha 97: O construtor chama this.createDeliveryTables()
  2. Linhas 518-572: O método createDeliveryTables() cria 2 tabelas:
    - email_delivery_queue
    - delivery_stats
  
  Vou refatorar seguindo o mesmo padrão.

● Perfeito! Encontrei o DeliveryManager:

  🔍 Análise DeliveryManager:
  - Linha 97: Construtor chama createDeliveryTables()
  - Linhas 518-572: Cria 2 tabelas: email_delivery_queue, delivery_stats

● Update(backend\src\services\deliveryManager.ts)
  ⎿  Updated backend\src\services\deliveryManager.ts with 1 addition and 1 removal
        94        this.securityManager = securityManager;
        95    
        96        this.setupTransporter();
        97 -      this.createDeliveryTables();
        97 +      this.validateRequiredTables();
        98        this.startDeliveryProcessor();
        99      }
       100    

✻ Thinking…

  Agora preciso substituir o método createDeliveryTables() por validateRequiredTables().

● Update(backend\src\services\deliveryManager.ts)
  ⎿  Updated backend\src\services\deliveryManager.ts with 13 additions and 48 removals
       515        }
       516      }
       517    
       518 -    private async createDeliveryTables(): Promise<void> {
       518 +    private async validateRequiredTables(): Promise<void> {
       519        try {
       520 -        // Tabela principal de fila de entrega
       521 -        const hasDeliveryQueueTable = await db.schema.hasTable('email_delivery_queue');
       522 -        if (!hasDeliveryQueueTable) {
       523 -          await db.schema.createTable('email_delivery_queue', (table) => {
       524 -            table.increments('id').primary();
       525 -            table.string('message_id', 255).notNullable().unique();
       526 -            table.string('from_address', 255).notNullable();
       527 -            table.string('to_address', 255).notNullable();
       528 -            table.string('subject', 500);
       529 -            table.text('body', 'longtext');
       530 -            table.json('headers');
       531 -            table.enum('status', ['pending', 'processing', 'delivered', 'failed', 'bounced', 
           - 'deferred']).defaultTo('pending');
       532 -            table.integer('attempts').defaultTo(0);
       533 -            table.timestamp('last_attempt');
       534 -            table.timestamp('next_attempt');
       535 -            table.timestamp('delivered_at');
       536 -            table.integer('delivery_time'); // ms
       537 -            table.text('error_message');
       538 -            table.integer('priority').defaultTo(50);
       539 -            table.integer('user_id').references('id').inTable('users');
       540 -            table.integer('campaign_id');
       541 -            table.string('bounce_type', 50);
       542 -            table.json('delivery_report');
       543 -            table.timestamps(true, true);
       544 -
       545 -            table.index(['status', 'next_attempt']);
       546 -            table.index(['priority', 'created_at']);
       547 -            table.index('to_address');
       548 -            table.index('user_id');
       549 -          });
       550 -        }
       520 +        const requiredTables = [
       521 +          'email_delivery_queue',
       522 +          'delivery_stats'
       523 +        ];
       524
       525 -        // Tabela de estatísticas de entrega
       526 -        const hasDeliveryStatsTable = await db.schema.hasTable('delivery_stats');
       527 -        if (!hasDeliveryStatsTable) {
       528 -          await db.schema.createTable('delivery_stats', (table) => {
       529 -            table.increments('id').primary();
       530 -            table.integer('delivery_id').references('id').inTable('email_delivery_queue');
       531 -            table.string('status', 20).notNullable();
       532 -            table.integer('delivery_time');
       533 -            table.text('error_message');
       534 -            table.timestamps(true, true);
       535 -
       536 -            table.index(['status', 'created_at']);
       537 -            table.index('delivery_id');
       538 -          });
       525 +        for (const tableName of requiredTables) {
       526 +          const hasTable = await db.schema.hasTable(tableName);
       527 +          if (!hasTable) {
       528 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);       
       529 +          }
       530          }
       531
       532 -        logger.info('Delivery tables verified/created');
       532 +        logger.info('DeliveryManager: Todas as tabelas obrigatórias validadas com sucesso');
       533        } catch (error) {
       534 -        logger.error('Failed to create delivery tables', { error });
       534 +        logger.error('Erro ao validar tabelas do DeliveryManager:', error);
       535 +        throw error;
       536        }
       537      }
       538

✻ Thinking…

  Excelente! DeliveryManager refatorado com sucesso (54 linhas → 19 linhas). Agora vou ler o próximo serviço: DKIMManager.

● ✅ DeliveryManager refatorado! (54 linhas → 19 linhas)

  Vou ler o próximo: DKIMManager:

● Read(backend\src\services\dkimManager.ts)
  ⎿  Read 120 lines (ctrl+r to expand)

✻ Thinking…

  Perfeito! Encontrei o DKIMManager. Posso ver que:
  
  1. Linha 36: O construtor chama this.initializeDKIM()
  2. Linha 48: initializeDKIM() chama await this.createDKIMTables()
  3. Linhas 71-119: O método createDKIMTables() cria 2 tabelas:
    - dkim_keys
    - dkim_signature_logs
  
  Vou refatorar seguindo o mesmo padrão.

● 🔍 Análise DKIMManager:
  - Linha 36: Construtor chama initializeDKIM()
  - Linha 48: initializeDKIM() chama createDKIMTables()
  - Linhas 71-119: Cria 2 tabelas: dkim_keys, dkim_signature_logs

● Update(backend\src\services\dkimManager.ts)
  ⎿  Updated backend\src\services\dkimManager.ts with 1 addition and 1 removal
       45          // Aguardar um momento para garantir que outras tabelas foram criadas
       46          await new Promise(resolve => setTimeout(resolve, 500));
       47
       48 -        await this.createDKIMTables();
       48 +        await this.validateRequiredTables();
       49          await this.loadDKIMConfigs();
       50
       51          // Aguardar mais um momento antes de tentar criar domínio/chaves

✻ Thinking…

  Agora preciso substituir o método createDKIMTables() por validateRequiredTables().

● Update(backend\src\services\dkimManager.ts)
  ⎿  Updated backend\src\services\dkimManager.ts with 13 additions and 42 removals
       68        }
       69      }
       70    
       71 -    private async createDKIMTables() {
       71 +    private async validateRequiredTables() {
       72        try {
       73 -        const hasDKIMTable = await db.schema.hasTable('dkim_keys');
       74 -        if (!hasDKIMTable) {
       75 -          await db.schema.createTable('dkim_keys', (table) => {
       76 -            table.increments('id').primary();
       77 -            table.string('domain', 255).notNullable();
       78 -            table.string('selector', 100).notNullable().defaultTo('default');
       79 -            table.text('private_key').notNullable();
       80 -            table.text('public_key');
       81 -            table.string('algorithm', 20).defaultTo('rsa-sha256');
       82 -            table.string('canonicalization', 50).defaultTo('relaxed/relaxed');
       83 -            table.integer('key_size').defaultTo(2048);
       84 -            table.boolean('is_active').defaultTo(true);
       85 -            table.timestamp('created_at').defaultTo(db.fn.now());
       86 -            table.timestamp('expires_at');
       87 -            table.timestamps(true, true);
       88 -
       89 -            table.unique(['domain', 'selector']);
       90 -            table.index('domain');
       91 -            table.index('is_active');
       92 -          });
       93 -        }
       73 +        const requiredTables = [
       74 +          'dkim_keys',
       75 +          'dkim_signature_logs'
       76 +        ];
       77
       78 -        // Tabela para logs de assinatura DKIM
       79 -        const hasDKIMLogsTable = await db.schema.hasTable('dkim_signature_logs');
       80 -        if (!hasDKIMLogsTable) {
       81 -          await db.schema.createTable('dkim_signature_logs', (table) => {
       82 -            table.increments('id').primary();
       83 -            table.string('domain', 255).notNullable();
       84 -            table.string('selector', 100).notNullable();
       85 -            table.string('message_id', 255);
       86 -            table.string('recipient_domain', 255);
       87 -            table.boolean('signature_valid').defaultTo(true);
       88 -            table.string('algorithm', 20);
       89 -            table.text('signature_hash');
       90 -            table.timestamp('signed_at').defaultTo(db.fn.now());
       91 -            table.timestamps(true, true);
       92 -
       93 -            table.index(['domain', 'signed_at']);
       94 -            table.index('signature_valid');
       95 -          });
       78 +        for (const tableName of requiredTables) {
       79 +          const hasTable = await db.schema.hasTable(tableName);
       80 +          if (!hasTable) {
       81 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);        
       82 +          }
       83          }
       84
       85 -        logger.info('DKIM tables created successfully');
       85 +        logger.info('DKIMManager: Todas as tabelas obrigatórias validadas com sucesso');
       86        } catch (error) {
       87 -        logger.error('Failed to create DKIM tables', { error });
       87 +        logger.error('Erro ao validar tabelas do DKIMManager:', error);
       88 +        throw error;
       89        }
       90      }
       91

✻ Thinking…

  Excelente! DKIMManager refatorado com sucesso (48 linhas → 19 linhas). Agora vou ler o próximo serviço: WebhookService.

● ✅ DKIMManager refatorado! (48 linhas → 19 linhas)

  Vou ler o próximo: WebhookService:

● Read(backend\src\services\webhookService.ts)
  ⎿  Read 150 lines (ctrl+r to expand)

✻ Thinking…

  Preciso ler mais do WebhookService para encontrar onde ele cria tabelas. Vou buscar por métodos de criação de tabelas.

● Vou buscar por métodos de criação de tabelas no WebhookService:

● Search(pattern: "createTable|hasTable.*webhook|initializeTables", path: "backend\src\services\webhookService.ts", output_mode:
        "content")
  ⎿  Found 203 lines (ctrl+r to expand)

✻ Thinking…

  Interessante! O WebhookService é diferente dos outros - ele não tem um construtor que inicializa tabelas diretamente. Em vez 
  disso, ele cria tabelas "lazy" (sob demanda) em vários métodos:

  1. Linha 154: Cria tabela webhook_logs no método logWebhookAttempt
  2. Linha 471: Cria tabela webhook_job_logs no método logWebhookJobResult

  Esse é um padrão diferente - criação de tabelas sob demanda. Para manter a consistência com os outros serviços, vou:

  1. Adicionar um construtor que chama validateRequiredTables()
  2. Remover as criações de tabelas dinâmicas e substituir por validações

  Vou refatorar este serviço de forma diferente.

● Interessante! O WebhookService é diferente - ele cria tabelas "sob demanda" em métodos específicos:

  🔍 Análise WebhookService:
  - Linha 154: Cria webhook_logs no método logWebhookAttempt()
  - Linha 471: Cria webhook_job_logs no método logWebhookJobResult()

  Vou refatorar adicionando um construtor e validações:

● Update(backend\src\services\webhookService.ts)
  ⎿  Updated backend\src\services\webhookService.ts with 25 additions
       12    }
       13    
       14    export class WebhookService {
       15 +    constructor() {
       16 +      this.validateRequiredTables();
       17 +    }
       18 +  
       19 +    private async validateRequiredTables() {
       20 +      try {
       21 +        const requiredTables = [
       22 +          'webhook_logs',
       23 +          'webhook_job_logs'
       24 +        ];
       25 +  
       26 +        for (const tableName of requiredTables) {
       27 +          const hasTable = await db.schema.hasTable(tableName);
       28 +          if (!hasTable) {
       29 +            throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);        
       30 +          }
       31 +        }
       32 +  
       33 +        logger.info('WebhookService: Todas as tabelas obrigatórias validadas com sucesso');
       34 +      } catch (error) {
       35 +        logger.error('Erro ao validar tabelas do WebhookService:', error);
       36 +        throw error;
       37 +      }
       38 +    }
       39 +  
       40      async sendWebhook(event: string, payload: any, webhookId?: number): Promise<void> {
       41        try {
       42          let webhooks;

✻ Thinking…

  Agora preciso remover as criações dinâmicas de tabelas nos métodos. Vou começar removendo a criação da tabela webhook_logs no 
  método logWebhookAttempt().

● Agora vou remover a criação dinâmica da tabela webhook_logs:

● Update(backend\src\services\webhookService.ts)
  ⎿  Updated backend\src\services\webhookService.ts with 22 removals
       172        }
       173      ): Promise<void> {
       174        try {
       175 -        // Create a webhook_logs table if it doesn't exist
       176 -        const logExists = await db.schema.hasTable('webhook_logs');
       177 -        
       178 -        if (!logExists) {
       179 -          await db.schema.createTable('webhook_logs', (table) => {
       180 -            table.increments('id').primary();
       181 -            table.integer('webhook_id').unsigned().notNullable();
       182 -            table.string('event').notNullable();
       183 -            table.text('payload');
       184 -            table.boolean('success').notNullable();
       185 -            table.integer('status_code').nullable();
       186 -            table.text('response_body').nullable();
       187 -            table.integer('attempt').notNullable();
       188 -            table.text('error_message').nullable();
       189 -            table.datetime('created_at').defaultTo(db.fn.now());
       190 -
       191 -            table.foreign('webhook_id').references('id').inTable('webhooks').onDelete('CASCADE');
       192 -            table.index(['webhook_id', 'created_at']);
       193 -            table.index(['event']);
       194 -          });
       195 -        }
       196 -  
       175          await db('webhook_logs').insert({
       176            webhook_id: webhookId,
       177            event,

✻ Thinking…

  Agora preciso remover a criação dinâmica da tabela webhook_job_logs no método logWebhookJobResult().

● Agora vou remover a criação dinâmica da tabela webhook_job_logs:

● Update(backend\src\services\webhookService.ts)
  ⎿  Error editing file

✻ Thinking…

  Vou buscar pela exata localização da criação da tabela webhook_job_logs no arquivo.

● Vou buscar pela localização exata da segunda criação de tabela:

● Search(pattern: "webhook_job_logs.*createTable", path: "backend\src\services\webhookService.ts", output_mode: "content")
  ⎿  Found 0 lines

✻ Thinking…

  Vou buscar por todas as criações de tabelas restantes no arquivo.

● Search(pattern: "createTable.*webhook_job_logs", path: "backend\src\services\webhookService.ts", output_mode: "content")
  ⎿  Found 26 lines (ctrl+r to expand)
  ⎿  5-hour limit reached ∙ resets 3pm
     /upgrade to increase your usage limit.