/**
 * FASE 1.2 - User Settings Table
 * Tabela para armazenar configurações personalizadas do usuário
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('user_settings', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().unique();
    
    // Configurações SMTP personalizadas
    table.string('smtp_host').nullable();
    table.integer('smtp_port').nullable();
    table.string('smtp_username').nullable();
    table.text('smtp_password_encrypted').nullable().comment('Senha SMTP criptografada');
    table.boolean('smtp_use_tls').defaultTo(true);
    table.boolean('smtp_use_custom').defaultTo(false).comment('Se deve usar SMTP customizado');
    
    // Configurações de notificação
    table.json('notification_preferences').nullable().defaultTo(JSON.stringify({
      email_delivery_reports: true,
      bounce_notifications: true,
      daily_summary: true,
      weekly_reports: false,
      security_alerts: true,
      webhook_failures: true
    }));
    
    // Preferências de sistema
    table.json('system_preferences').nullable().defaultTo(JSON.stringify({
      theme: 'light',
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      date_format: 'DD/MM/YYYY',
      time_format: '24h',
      items_per_page: 20,
      auto_refresh: true,
      auto_refresh_interval: 30000
    }));
    
    // Configurações de segurança
    table.json('security_settings').nullable().defaultTo(JSON.stringify({
      two_factor_enabled: false,
      session_timeout: 3600,
      ip_whitelist: [],
      api_rate_limit: 1000,
      require_password_confirmation: false
    }));
    
    // Configurações de branding/personalização
    table.json('branding_settings').nullable().defaultTo(JSON.stringify({
      company_name: '',
      company_logo_url: '',
      custom_domain: '',
      footer_text: '',
      primary_color: '#3b82f6',
      secondary_color: '#1e40af'
    }));
    
    // Configurações de analytics e relatórios
    table.json('analytics_settings').nullable().defaultTo(JSON.stringify({
      default_time_range: '30d',
      track_opens: true,
      track_clicks: true,
      track_downloads: true,
      pixel_tracking: true,
      utm_tracking: true
    }));

    table.timestamps(true, true);

    // Foreign key e índices
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('user_id');
  });

  // Criar configurações padrão para usuários existentes
  await knex.raw(`
    INSERT INTO user_settings (user_id, created_at, updated_at)
    SELECT id, datetime('now'), datetime('now')
    FROM users
    WHERE id NOT IN (SELECT user_id FROM user_settings)
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('user_settings');
};