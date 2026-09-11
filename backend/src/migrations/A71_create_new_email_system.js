/**
 * MIGRATION: Complemento Sistema de Email Externo 
 * Versão: 1.0.0 - Apenas tabelas novas (evita conflitos)
 * 
 * Cria apenas as tabelas que ainda não existem para o novo sistema de email.
 * ATENÇÃO: Remove criação de email_metrics (já existe em A29) e email_events (já existe em A21)
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Verificar e atualizar tabela emails existente para novo schema simplificado
  const hasColumns = await knex.schema.hasColumn('emails', 'tenant_id');
  
  if (!hasColumns) {
    await knex.schema.alterTable('emails', function (table) {
      // Adicionar campos do novo sistema (se não existirem)
      table.integer('tenant_id').nullable().comment('Para futuro B2B multi-tenant');
      table.boolean('domain_validated').defaultTo(false).comment('Se o domínio foi validado');
      table.boolean('fallback_applied').defaultTo(false).comment('Se foi aplicado fallback');
      table.integer('delivery_latency_ms').nullable().comment('Latência de entrega em ms');
      table.text('smtp_response').nullable().comment('Resposta do servidor SMTP');
      
      // Indexes para performance
      table.index(['user_id', 'sent_at'], 'idx_user_sent_at');
      table.index(['domain_validated'], 'idx_domain_validated');  
      table.index(['tenant_id'], 'idx_tenant_id');
    });
    console.log('🔧 Tabela emails atualizada com novos campos');
  } else {
    console.log('ℹ️  Campos já existem na tabela emails, pulando alteração');
  }

  // 2. REMOVIDO: email_metrics (já existe em A29_create_email_metrics_table.js)

  // 3. Tabela de domínios de usuários (simplificada) - COM TRY/CATCH
  try {
    await knex.schema.createTable('user_domains', function (table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().comment('ID do usuário');
      table.string('domain', 255).notNullable().comment('Nome do domínio');
      table.boolean('verified').defaultTo(false).comment('Se o domínio foi verificado');
      table.timestamp('verified_at').nullable().comment('Quando foi verificado');
      table.string('verification_method', 50).nullable().comment('Método de verificação usado');
      table.text('verification_token').nullable().comment('Token de verificação');
      table.timestamps(true, true);

      // Constraints e indexes
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.unique(['user_id', 'domain'], 'unique_user_domain');
      table.index(['domain'], 'idx_domain');
      table.index(['verified'], 'idx_verified');
      table.index(['user_id', 'verified'], 'idx_user_verified');
    });
    console.log('📊 Tabela user_domains criada');
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('SQLITE_ERROR')) {
      console.log('ℹ️  Tabela user_domains já existe, pulando criação');
    } else {
      throw error; // Re-throw se for outro erro
    }
  }

  // 4. REMOVIDO: email_events (já existe em A21_create_email_events_table.js)

  // 5. Tabela de configurações do sistema de email - COM TRY/CATCH
  let emailSystemConfigCreated = false;
  try {
    await knex.schema.createTable('email_system_config', function (table) {
      table.increments('id').primary();
      table.string('config_key', 100).notNullable().unique().comment('Chave da configuração');
      table.text('config_value').notNullable().comment('Valor da configuração');
      table.string('data_type', 20).defaultTo('string').comment('Tipo de dados (string, number, boolean, json)');
      table.text('description').nullable().comment('Descrição da configuração');
      table.boolean('is_active').defaultTo(true).comment('Se a configuração está ativa');
      table.timestamps(true, true);

      table.index(['config_key'], 'idx_config_key');
      table.index(['is_active'], 'idx_config_active');
    });
    console.log('⚙️ Tabela email_system_config criada');
    emailSystemConfigCreated = true;
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('SQLITE_ERROR')) {
      console.log('ℹ️  Tabela email_system_config já existe, pulando criação');
    } else {
      throw error; // Re-throw se for outro erro
    }
  }

  // 6. Inserir configurações padrão (apenas se tabela foi criada)
  if (emailSystemConfigCreated) {
    await knex('email_system_config').insert([
      {
        config_key: 'default_daily_quota',
        config_value: '1000',
        data_type: 'number',
        description: 'Quota diária padrão para novos usuários',
        is_active: true
      },
      {
        config_key: 'default_hourly_quota',
        config_value: '100',
        data_type: 'number',
        description: 'Quota horária padrão para novos usuários',
        is_active: true
      },
      {
        config_key: 'default_monthly_quota',
        config_value: '10000',
        data_type: 'number',
        description: 'Quota mensal padrão para novos usuários',
        is_active: true
      },
      {
        config_key: 'max_batch_size',
        config_value: '100',
        data_type: 'number',
        description: 'Tamanho máximo de lote para envio em batch',
        is_active: true
      },
      {
        config_key: 'enable_domain_validation',
        config_value: 'true',
        data_type: 'boolean',
        description: 'Se deve validar propriedade de domínios',
        is_active: true
      },
      {
        config_key: 'fallback_domain',
        config_value: 'velomail.com.br',
        data_type: 'string',
        description: 'Domínio de fallback para emails não verificados',
        is_active: true
      }
    ]);
    console.log('⚙️ Configurações padrão inseridas');
  } else {
    console.log('ℹ️  Configurações padrão já existem, pulando inserção');
  }

  console.log('✅ Complemento do sistema de email criado com sucesso!');
  console.log('📊 Tabelas criadas: user_domains, email_system_config');
  console.log('🔧 Tabela emails verificada/atualizada com novos campos');
  console.log('⚙️ Configurações padrão inseridas');
  console.log('ℹ️  NOTA: email_metrics e email_events já existem em outras migrações');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Reverter em ordem inversa - apenas tabelas criadas nesta migração
  await knex.schema.dropTableIfExists('email_system_config');
  await knex.schema.dropTableIfExists('user_domains');
  
  // Remover campos adicionados à tabela emails (com verificação)
  const hasColumns = await knex.schema.hasColumn('emails', 'tenant_id');
  
  if (hasColumns) {
    await knex.schema.alterTable('emails', function (table) {
      table.dropColumn('tenant_id');
      table.dropColumn('domain_validated');
      table.dropColumn('fallback_applied');
      table.dropColumn('delivery_latency_ms');
      table.dropColumn('smtp_response');
      
      // Remover indexes
      table.dropIndex(['user_id', 'sent_at'], 'idx_user_sent_at');
      table.dropIndex(['domain_validated'], 'idx_domain_validated');
      table.dropIndex(['tenant_id'], 'idx_tenant_id');
    });
    console.log('🔄 Campos removidos da tabela emails');
  }

  console.log('🔄 Complemento do sistema de email removido');
  console.log('ℹ️  NOTA: email_metrics e email_events permanecem (são de outras migrações)');
};