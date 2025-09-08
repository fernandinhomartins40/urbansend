/**
 * Enhanced Analytics - Adiciona campos para analytics mais precisos
 * Fase Final - Sprint 1: Analytics com dados reais
 */

exports.up = async function(knex) {
  console.log('🔧 Enhanced Analytics: Adicionando campos para analytics em tempo real...');

  // Adicionar novos campos para analytics mais precisos
  // Nota: hour_sent e day_of_week já existem da migração ZV48
  await knex.schema.table('email_analytics', function(table) {
    // Campos para análise temporal (complementares)
    table.integer('week_of_year').comment('Semana do ano (1-53)');
    table.integer('month_of_year').comment('Mês do ano (1-12)');
    
    // Campos para reputação e deliverability
    table.decimal('ip_reputation_score', 4, 2).comment('Score de reputação do IP (0-100)');
    table.decimal('domain_reputation_score', 4, 2).comment('Score de reputação do domínio (0-100)');
    table.decimal('deliverability_score', 4, 2).comment('Score geral de deliverability (0-100)');
    
    // Campos para métricas avançadas
    table.integer('forward_count').defaultTo(0).comment('Número de forwards');
    table.integer('reply_count').defaultTo(0).comment('Número de replies');
    table.integer('print_count').defaultTo(0).comment('Número de impressões');
    table.json('geographic_data').comment('Dados geográficos de abertura/clique');
    table.json('device_data').comment('Dados de dispositivo (mobile, desktop, etc)');
    table.json('client_data').comment('Dados de cliente de email (Gmail, Outlook, etc)');
    
    // Campos para tracking avançado
    table.boolean('is_spam_filtered').defaultTo(false).comment('Email foi filtrado como spam');
    table.boolean('is_promotional').defaultTo(false).comment('Email é promocional');
    table.text('campaign_tags').comment('Tags da campanha (JSON array)');
    table.decimal('engagement_score', 4, 2).comment('Score de engajamento calculado');
  });

  // Criar índices para performance dos novos campos
  // Nota: hour_sent e day_of_week já têm índices da migração ZV48
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_email_analytics_week_year 
    ON email_analytics(week_of_year, month_of_year);
  `);
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_email_analytics_reputation 
    ON email_analytics(ip_reputation_score, domain_reputation_score);
  `);
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_email_analytics_deliverability 
    ON email_analytics(deliverability_score);
  `);
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_email_analytics_engagement 
    ON email_analytics(engagement_score);
  `);
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_email_analytics_created_at_temporal 
    ON email_analytics(created_at, hour_sent, day_of_week);
  `);

  // Trigger para popular campos automáticos quando SQLite suportar
  // Para SQLite, vamos fazer isso no código da aplicação
  
  console.log('✅ Enhanced Analytics: Campos e índices criados com sucesso!');
  console.log('📊 Novos campos disponíveis:');
  console.log('   - Análise temporal: hour_sent, day_of_week, week_of_year, month_of_year');
  console.log('   - Reputação: ip_reputation_score, domain_reputation_score, deliverability_score'); 
  console.log('   - Métricas avançadas: forward_count, reply_count, engagement_score');
  console.log('   - Dados contextuais: geographic_data, device_data, client_data');
};

exports.down = async function(knex) {
  console.log('🔄 Revertendo Enhanced Analytics...');
  
  // Remover apenas índices criados nesta migração
  // Nota: idx_email_analytics_hour e idx_email_analytics_dow pertencem à migração ZV48
  await knex.raw('DROP INDEX IF EXISTS idx_email_analytics_week_year');
  await knex.raw('DROP INDEX IF EXISTS idx_email_analytics_reputation');
  await knex.raw('DROP INDEX IF EXISTS idx_email_analytics_deliverability');
  await knex.raw('DROP INDEX IF EXISTS idx_email_analytics_engagement');
  await knex.raw('DROP INDEX IF EXISTS idx_email_analytics_created_at_temporal');
  
  // Remover apenas as colunas adicionadas nesta migração
  // Nota: hour_sent e day_of_week pertencem à migração ZV48, não removemos aqui
  await knex.schema.table('email_analytics', function(table) {
    table.dropColumn('week_of_year');
    table.dropColumn('month_of_year');
    table.dropColumn('ip_reputation_score');
    table.dropColumn('domain_reputation_score');
    table.dropColumn('deliverability_score');
    table.dropColumn('forward_count');
    table.dropColumn('reply_count');
    table.dropColumn('print_count');
    table.dropColumn('geographic_data');
    table.dropColumn('device_data');
    table.dropColumn('client_data');
    table.dropColumn('is_spam_filtered');
    table.dropColumn('is_promotional');
    table.dropColumn('campaign_tags');
    table.dropColumn('engagement_score');
  });

  console.log('✅ Enhanced Analytics: Revertido com sucesso!');
};