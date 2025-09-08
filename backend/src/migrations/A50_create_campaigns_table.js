/**
 * FASE 2.1 - Sistema de Campanhas
 * Tabela para gerenciar campanhas de email marketing
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('campaigns', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name').notNullable();
    table.text('description').nullable();
    table.enum('status', ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled']).defaultTo('draft');
    table.enum('type', ['one_time', 'recurring', 'trigger', 'a_b_test']).defaultTo('one_time');
    
    // Configurações de envio
    table.timestamp('scheduled_at').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.integer('template_id').unsigned().nullable();
    table.string('subject_line').nullable();
    table.string('from_email').nullable();
    table.string('from_name').nullable();
    table.string('reply_to').nullable();
    
    // Configurações de segmentação
    table.json('segment_criteria').nullable().comment('Critérios para segmentação automática');
    table.json('recipient_list').nullable().comment('Lista específica de destinatários');
    table.boolean('use_segmentation').defaultTo(false);
    
    // Configurações A/B Test
    table.string('ab_test_type').nullable(); // 'subject', 'content', 'send_time'
    table.decimal('ab_test_split', 5, 2).nullable(); // Percentual para teste A (ex: 50.00)
    table.integer('ab_winner_template_id').unsigned().nullable();
    table.timestamp('ab_decision_time').nullable();
    
    // Configurações de recorrência  
    table.string('recurrence_pattern').nullable(); // 'daily', 'weekly', 'monthly'
    table.json('recurrence_config').nullable();
    table.timestamp('next_run_at').nullable();
    
    // Métricas e estatísticas
    table.integer('total_recipients').defaultTo(0);
    table.integer('emails_sent').defaultTo(0);
    table.integer('emails_delivered').defaultTo(0);
    table.integer('emails_bounced').defaultTo(0);
    table.integer('emails_opened').defaultTo(0);
    table.integer('emails_clicked').defaultTo(0);
    table.integer('unsubscribes').defaultTo(0);
    table.integer('spam_reports').defaultTo(0);
    
    // Taxas calculadas
    table.decimal('delivery_rate', 5, 2).defaultTo(0);
    table.decimal('open_rate', 5, 2).defaultTo(0);
    table.decimal('click_rate', 5, 2).defaultTo(0);
    table.decimal('unsubscribe_rate', 5, 2).defaultTo(0);
    
    // Configurações avançadas
    table.json('send_settings').nullable().comment('Configurações de throttling, retry, etc');
    table.json('tracking_settings').nullable().comment('Configurações de tracking');
    table.json('metadata').nullable().comment('Dados adicionais da campanha');
    
    // Campos de auditoria
    table.text('notes').nullable();
    table.integer('created_by').unsigned().nullable();
    table.integer('last_modified_by').unsigned().nullable();
    table.timestamps(true, true);

    // Foreign keys e índices
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('template_id').references('id').inTable('email_templates').onDelete('SET NULL');
    table.foreign('ab_winner_template_id').references('id').inTable('email_templates').onDelete('SET NULL');
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('last_modified_by').references('id').inTable('users').onDelete('SET NULL');

    // Índices para performance
    table.index(['user_id', 'status']);
    table.index(['status', 'scheduled_at']);
    table.index(['type', 'status']);
    table.index('created_at');
    table.index('scheduled_at');
    table.index('next_run_at');
  });

  // Tabela para histórico de execuções de campanhas
  await knex.schema.createTable('campaign_executions', function (table) {
    table.increments('id').primary();
    table.integer('campaign_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.enum('status', ['running', 'completed', 'failed', 'cancelled']).defaultTo('running');
    
    // Métricas da execução
    table.integer('total_recipients').defaultTo(0);
    table.integer('emails_sent').defaultTo(0);
    table.integer('emails_failed').defaultTo(0);
    table.json('execution_stats').nullable();
    table.text('error_message').nullable();
    table.json('execution_log').nullable().comment('Log detalhado da execução');
    
    table.timestamps(true, true);

    table.foreign('campaign_id').references('id').inTable('campaigns').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['campaign_id', 'started_at']);
    table.index(['user_id', 'status']);
  });

  // Tabela para recipients individuais da campanha
  await knex.schema.createTable('campaign_recipients', function (table) {
    table.increments('id').primary();
    table.integer('campaign_id').unsigned().notNullable();
    table.integer('execution_id').unsigned().nullable();
    table.string('email').notNullable();
    table.string('first_name').nullable();
    table.string('last_name').nullable();
    table.json('custom_fields').nullable();
    
    // Status do envio
    table.enum('status', ['pending', 'sent', 'delivered', 'bounced', 'failed', 'unsubscribed']).defaultTo('pending');
    table.string('message_id').nullable();
    table.timestamp('sent_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.timestamp('opened_at').nullable();
    table.timestamp('clicked_at').nullable();
    table.timestamp('bounced_at').nullable();
    table.text('bounce_reason').nullable();
    table.text('failure_reason').nullable();
    
    table.timestamps(true, true);

    table.foreign('campaign_id').references('id').inTable('campaigns').onDelete('CASCADE');
    table.foreign('execution_id').references('id').inTable('campaign_executions').onDelete('SET NULL');
    table.index(['campaign_id', 'status']);
    table.index(['execution_id', 'status']);
    table.index('email');
    table.index(['email', 'campaign_id']); // Para verificar duplicatas
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('campaign_recipients');
  await knex.schema.dropTableIfExists('campaign_executions');
  await knex.schema.dropTableIfExists('campaigns');
};