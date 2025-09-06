/**
 * FASE 2.2 - Sistema de Contatos e Segmentação
 * Tabelas para gerenciar contatos e segmentação avançada
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Tabela principal de contatos
  await knex.schema.createTable('contacts', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('email').notNullable();
    table.string('first_name', 100).nullable();
    table.string('last_name', 100).nullable();
    table.string('full_name', 200).nullable(); // Campo calculado para busca
    table.string('phone', 20).nullable();
    table.string('company', 150).nullable();
    table.string('job_title', 100).nullable();
    table.string('website', 255).nullable();
    table.text('notes').nullable();
    
    // Status e preferências
    table.enum('status', ['active', 'unsubscribed', 'bounced', 'complained', 'inactive']).defaultTo('active');
    table.enum('subscription_status', ['subscribed', 'unsubscribed', 'pending', 'cleaned']).defaultTo('subscribed');
    table.timestamp('subscribed_at').nullable();
    table.timestamp('unsubscribed_at').nullable();
    table.string('unsubscribe_reason').nullable();
    table.timestamp('last_activity_at').nullable();
    
    // Informações geográficas
    table.string('country', 2).nullable(); // Código ISO
    table.string('state', 100).nullable();
    table.string('city', 100).nullable();
    table.string('postal_code', 20).nullable();
    table.string('timezone', 50).nullable();
    table.string('language', 10).defaultTo('pt-BR');
    
    // Dados de engajamento
    table.integer('total_emails_sent').defaultTo(0);
    table.integer('total_emails_opened').defaultTo(0);
    table.integer('total_emails_clicked').defaultTo(0);
    table.integer('total_emails_bounced').defaultTo(0);
    table.decimal('engagement_score', 5, 2).defaultTo(0); // Score 0-100
    table.timestamp('last_opened_at').nullable();
    table.timestamp('last_clicked_at').nullable();
    
    // Dados personalizados (JSON flexível)
    table.json('custom_fields').nullable().comment('Campos personalizados definidos pelo usuário');
    table.json('tags').nullable().comment('Tags associadas ao contato');
    table.json('preferences').nullable().comment('Preferências de comunicação');
    
    // Informações de origem
    table.string('source', 100).nullable(); // Como chegou à lista
    table.string('source_details').nullable();
    table.integer('imported_from_list_id').nullable(); // Se foi importado de uma lista
    table.timestamp('first_seen_at').nullable();
    
    // Dados de GDPR/Compliance
    table.boolean('gdpr_consent').defaultTo(false);
    table.timestamp('gdpr_consent_date').nullable();
    table.string('gdpr_consent_method').nullable(); // 'form', 'api', 'import', etc
    table.string('opt_in_ip', 45).nullable();
    table.string('opt_in_country', 2).nullable();
    
    table.timestamps(true, true);

    // Foreign keys e índices
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['user_id', 'email']); // Um email por usuário
    table.index('email');
    table.index('status');
    table.index('subscription_status');
    table.index(['user_id', 'status']);
    table.index(['user_id', 'subscription_status']);
    table.index('engagement_score');
    table.index('last_activity_at');
    table.index('created_at');
  });

  // Tabela para definir segmentos
  await knex.schema.createTable('contact_segments', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name').notNullable();
    table.text('description').nullable();
    table.enum('type', ['static', 'dynamic', 'behavioral']).defaultTo('dynamic');
    table.boolean('is_active').defaultTo(true);
    
    // Critérios de segmentação (JSON para flexibilidade)
    table.json('criteria').nullable().comment('Regras para inclusão automática no segmento');
    table.text('criteria_description').nullable().comment('Descrição legível dos critérios');
    
    // Estatísticas do segmento
    table.integer('contact_count').defaultTo(0);
    table.timestamp('last_calculated_at').nullable();
    table.boolean('auto_update').defaultTo(true); // Se deve recalcular automaticamente
    table.integer('update_frequency_minutes').defaultTo(60); // Frequência de atualização em minutos
    
    // Configurações
    table.json('settings').nullable().comment('Configurações específicas do segmento');
    table.string('color', 7).defaultTo('#3B82F6'); // Cor para UI (hex)
    table.integer('sort_order').defaultTo(0);
    
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'is_active']);
    table.index(['user_id', 'type']);
    table.index('last_calculated_at');
    table.index('auto_update');
  });

  // Tabela pivot para relacionar contatos com segmentos
  await knex.schema.createTable('contact_segment_members', function (table) {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable();
    table.integer('segment_id').unsigned().notNullable();
    table.timestamp('added_at').defaultTo(knex.fn.now());
    table.string('added_by').nullable(); // 'system', 'manual', 'import', 'api'
    table.json('metadata').nullable(); // Dados adicionais sobre a inclusão
    
    table.foreign('contact_id').references('id').inTable('contacts').onDelete('CASCADE');
    table.foreign('segment_id').references('id').inTable('contact_segments').onDelete('CASCADE');
    table.unique(['contact_id', 'segment_id']); // Um contato por segmento apenas uma vez
    table.index(['segment_id', 'added_at']);
    table.index('contact_id');
  });

  // Tabela para listas de contatos (diferentes de segmentos - mais simples)
  await knex.schema.createTable('contact_lists', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name').notNullable();
    table.text('description').nullable();
    table.enum('type', ['imported', 'manual', 'form', 'api']).defaultTo('manual');
    table.integer('contact_count').defaultTo(0);
    
    // Configurações da lista
    table.boolean('is_active').defaultTo(true);
    table.string('import_source').nullable(); // CSV, API, etc
    table.json('import_metadata').nullable();
    table.timestamp('last_imported_at').nullable();
    
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'is_active']);
    table.index('type');
  });

  // Tabela pivot para contatos em listas
  await knex.schema.createTable('contact_list_members', function (table) {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable();
    table.integer('list_id').unsigned().notNullable();
    table.timestamp('added_at').defaultTo(knex.fn.now());
    table.string('added_by').nullable();
    
    table.foreign('contact_id').references('id').inTable('contacts').onDelete('CASCADE');
    table.foreign('list_id').references('id').inTable('contact_lists').onDelete('CASCADE');
    table.unique(['contact_id', 'list_id']);
    table.index(['list_id', 'added_at']);
  });

  // Tabela para histórico de atividades dos contatos
  await knex.schema.createTable('contact_activities', function (table) {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable(); // Para particionamento
    table.string('activity_type').notNullable(); // 'email_opened', 'email_clicked', 'subscribed', etc
    table.string('email_id').nullable(); // Se relacionado a um email específico
    table.integer('campaign_id').nullable(); // Se relacionado a uma campanha
    table.text('description').nullable();
    table.json('activity_data').nullable().comment('Dados específicos da atividade');
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.timestamp('activity_at').notNullable();
    
    table.timestamps(true, true);

    table.foreign('contact_id').references('id').inTable('contacts').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['contact_id', 'activity_at']);
    table.index(['user_id', 'activity_type', 'activity_at']);
    table.index('activity_type');
    table.index('email_id');
    table.index('campaign_id');
  });

  // Tabela para preferências de comunicação globais
  await knex.schema.createTable('contact_preferences', function (table) {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable();
    table.string('preference_key').notNullable(); // 'frequency', 'content_type', etc
    table.string('preference_value').notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('contact_id').references('id').inTable('contacts').onDelete('CASCADE');
    table.unique(['contact_id', 'preference_key']);
    table.index('preference_key');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('contact_preferences');
  await knex.schema.dropTableIfExists('contact_activities');
  await knex.schema.dropTableIfExists('contact_list_members');
  await knex.schema.dropTableIfExists('contact_lists');
  await knex.schema.dropTableIfExists('contact_segment_members');
  await knex.schema.dropTableIfExists('contact_segments');
  await knex.schema.dropTableIfExists('contacts');
};