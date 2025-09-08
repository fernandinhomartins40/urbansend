/**
 * SPRINT 3 - Sistema de Alertas
 * Tabela para gerenciar alertas automáticos do sistema
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('system_alerts', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    
    // Tipo e configuração do alerta
    table.string('alert_type').notNullable(); // HIGH_BOUNCE_RATE, LOW_DELIVERY_RATE, etc.
    table.string('title').notNullable();
    table.text('message').notNullable();
    
    // Severidade e priorização
    table.enum('severity', ['critical', 'warning', 'info', 'low']).notNullable();
    table.integer('severity_order').notNullable(); // Para ordenação (4=critical, 3=warning, 2=info, 1=low)
    
    // Status do alerta
    table.enum('status', ['active', 'acknowledged', 'resolved']).defaultTo('active');
    table.timestamp('acknowledged_at').nullable();
    table.timestamp('resolved_at').nullable();
    table.string('resolved_by').nullable(); // 'system', 'user', email do usuário
    
    // Dados adicionais
    table.json('metadata').nullable().comment('Dados específicos do alerta (métricas, contexto, etc.)');
    table.string('action_url').nullable().comment('URL para ação de resolução');
    
    // Configurações de notificação
    table.boolean('email_sent').defaultTo(false);
    table.timestamp('email_sent_at').nullable();
    table.boolean('push_sent').defaultTo(false);
    table.timestamp('push_sent_at').nullable();
    
    // Configurações de recorrência
    table.boolean('is_recurring').defaultTo(false);
    table.timestamp('last_occurrence').nullable();
    table.integer('occurrence_count').defaultTo(1);
    table.integer('suppression_minutes').nullable(); // Suprimir por X minutos após resolver
    
    table.timestamps(true, true);

    // Foreign keys e índices
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Índices para performance
    table.index(['user_id', 'status']);
    table.index(['user_id', 'severity', 'status']);
    table.index(['alert_type', 'status']);
    table.index(['severity_order', 'created_at']);
    table.index('created_at');
    table.index('resolved_at');
    
    // Índice composto para alertas ativos por usuário
    table.index(['user_id', 'status', 'severity_order', 'created_at'], 'idx_user_active_alerts');
  });

  // Tabela para histórico de notificações de alertas
  await knex.schema.createTable('alert_notifications', function (table) {
    table.increments('id').primary();
    table.integer('alert_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    
    // Tipo de notificação
    table.enum('notification_type', ['email', 'push', 'sms', 'webhook']).notNullable();
    table.enum('status', ['pending', 'sent', 'failed', 'delivered', 'opened']).defaultTo('pending');
    
    // Dados da notificação
    table.string('recipient').notNullable(); // email, phone, webhook URL, etc.
    table.text('subject').nullable();
    table.text('content').nullable();
    table.json('notification_data').nullable();
    
    // Status de entrega
    table.timestamp('sent_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.timestamp('opened_at').nullable();
    table.timestamp('failed_at').nullable();
    table.text('failure_reason').nullable();
    table.string('external_id').nullable(); // ID do provedor externo
    
    // Configurações
    table.integer('retry_count').defaultTo(0);
    table.timestamp('next_retry_at').nullable();
    table.json('metadata').nullable();
    
    table.timestamps(true, true);

    table.foreign('alert_id').references('id').inTable('system_alerts').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    table.index(['alert_id', 'notification_type']);
    table.index(['user_id', 'status']);
    table.index(['status', 'next_retry_at']);
    table.index('sent_at');
  });

  // Tabela para configurações de alertas do usuário
  await knex.schema.createTable('user_alert_settings', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    
    // Configurações globais
    table.boolean('alerts_enabled').defaultTo(true);
    table.boolean('email_notifications').defaultTo(true);
    table.boolean('push_notifications').defaultTo(true);
    table.boolean('sms_notifications').defaultTo(false);
    
    // Configurações por severidade
    table.json('severity_settings').nullable().comment('Configurações específicas por severidade');
    
    // Configurações por tipo de alerta
    table.json('alert_type_settings').nullable().comment('Configurações específicas por tipo de alerta');
    
    // Configurações de horário
    table.string('timezone').defaultTo('America/Sao_Paulo');
    table.time('quiet_hours_start').nullable(); // Início do período silencioso
    table.time('quiet_hours_end').nullable(); // Fim do período silencioso
    table.json('quiet_days').nullable().comment('Dias da semana para período silencioso');
    
    // Configurações de frequência
    table.integer('max_alerts_per_hour').defaultTo(10);
    table.integer('max_alerts_per_day').defaultTo(50);
    table.integer('digest_frequency_hours').defaultTo(24); // Frequência do resumo em horas
    
    // Contatos de notificação
    table.string('notification_email').nullable();
    table.string('notification_phone').nullable();
    table.string('webhook_url').nullable();
    table.string('slack_webhook').nullable();
    
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique('user_id'); // Um registro por usuário
    table.index('alerts_enabled');
  });

  // Inserir configurações padrão para usuários existentes
  const existingUsers = await knex('users').select('id');
  
  if (existingUsers.length > 0) {
    const defaultSettings = existingUsers.map(user => ({
      user_id: user.id,
      alerts_enabled: true,
      email_notifications: true,
      push_notifications: true,
      sms_notifications: false,
      timezone: 'America/Sao_Paulo',
      max_alerts_per_hour: 10,
      max_alerts_per_day: 50,
      digest_frequency_hours: 24,
      created_at: new Date(),
      updated_at: new Date()
    }));
    
    await knex('user_alert_settings').insert(defaultSettings);
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('user_alert_settings');
  await knex.schema.dropTableIfExists('alert_notifications');
  await knex.schema.dropTableIfExists('system_alerts');
};