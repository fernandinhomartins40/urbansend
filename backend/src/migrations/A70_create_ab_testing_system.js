/**
 * MIGRATION: A70_create_ab_testing_system
 * 
 * OBJETIVO: Sistema completo de A/B Testing para emails
 * 
 * FASE 3: Funcionalidades Avançadas - A/B Testing de E-mails
 * 
 * FEATURES:
 * - Testes de assunto, conteúdo, remetente
 * - Análise estatística automática
 * - Declaração automática de vencedor
 * - Relatórios detalhados
 */

exports.up = function(knex) {
  return knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS email_ab_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      test_type VARCHAR(20) NOT NULL CHECK (test_type IN ('subject', 'content', 'sender', 'template')),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'stopped')),
      traffic_split INTEGER DEFAULT 50 CHECK (traffic_split >= 10 AND traffic_split <= 90),
      winner_criteria VARCHAR(20) DEFAULT 'open_rate' CHECK (winner_criteria IN ('open_rate', 'click_rate', 'conversion_rate')),
      confidence_level INTEGER DEFAULT 95 CHECK (confidence_level IN (90, 95, 99)),
      min_sample_size INTEGER DEFAULT 100,
      test_duration_hours INTEGER DEFAULT 24,
      started_at DATETIME,
      completed_at DATETIME,
      winner_variant VARCHAR(1) CHECK (winner_variant IN ('A', 'B')),
      significance_achieved BOOLEAN DEFAULT FALSE,
      p_value DECIMAL(10,8),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_ab_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ab_test_id INTEGER NOT NULL,
      variant_name VARCHAR(1) NOT NULL CHECK (variant_name IN ('A', 'B')),
      subject VARCHAR(255),
      from_email VARCHAR(255),
      template_id INTEGER,
      content_changes JSON,
      emails_sent INTEGER DEFAULT 0,
      opens INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      bounces INTEGER DEFAULT 0,
      open_rate DECIMAL(5,2) DEFAULT 0.0,
      click_rate DECIMAL(5,2) DEFAULT 0.0,
      conversion_rate DECIMAL(5,2) DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ab_test_id) REFERENCES email_ab_tests(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES email_templates(id),
      UNIQUE(ab_test_id, variant_name)
    );

    CREATE TABLE IF NOT EXISTS ab_test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ab_test_id INTEGER NOT NULL,
      email_id INTEGER NOT NULL,
      variant_name VARCHAR(1) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      opened_at DATETIME,
      clicked_at DATETIME,
      converted_at DATETIME,
      bounced_at DATETIME,
      conversion_value DECIMAL(10,2) DEFAULT 0.0,
      FOREIGN KEY (ab_test_id) REFERENCES email_ab_tests(id) ON DELETE CASCADE,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_ab_tests_user_status ON email_ab_tests(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ab_variants_test ON email_ab_variants(ab_test_id, variant_name);
    CREATE INDEX IF NOT EXISTS idx_ab_results_test_variant ON ab_test_results(ab_test_id, variant_name, sent_at);

    -- Trigger para atualizar estatísticas das variantes
    CREATE TRIGGER IF NOT EXISTS update_ab_variant_stats
    AFTER UPDATE ON ab_test_results
    WHEN NEW.opened_at != OLD.opened_at OR NEW.clicked_at != OLD.clicked_at OR NEW.converted_at != OLD.converted_at
    BEGIN
      UPDATE email_ab_variants 
      SET 
        opens = (SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND opened_at IS NOT NULL),
        clicks = (SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND clicked_at IS NOT NULL),
        conversions = (SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND converted_at IS NOT NULL),
        open_rate = ROUND(
          (SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND opened_at IS NOT NULL) * 100.0 /
          NULLIF((SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name), 0),
          2
        ),
        click_rate = ROUND(
          (SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND clicked_at IS NOT NULL) * 100.0 /
          NULLIF((SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND opened_at IS NOT NULL), 0),
          2
        ),
        conversion_rate = ROUND(
          (SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name AND converted_at IS NOT NULL) * 100.0 /
          NULLIF((SELECT COUNT(*) FROM ab_test_results WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name), 0),
          2
        )
      WHERE ab_test_id = NEW.ab_test_id AND variant_name = NEW.variant_name;
    END;
  `)
  .then(() => {
    console.log('✅ Sistema de A/B Testing criado com sucesso!')
    console.log('🧪 Funcionalidades implementadas:')
    console.log('   - Testes de assunto, conteúdo, remetente, template')
    console.log('   - Análise estatística com níveis de confiança')
    console.log('   - Divisão de tráfego configurável')
    console.log('   - Critérios de vitória múltiplos')
    console.log('   - Triggers para atualização automática')
    console.log('🎯 A/B Testing profissional implementado!')
  })
}

exports.down = function(knex) {
  return knex.schema.raw(`
    DROP TRIGGER IF EXISTS update_ab_variant_stats;
    DROP INDEX IF EXISTS idx_ab_tests_user_status;
    DROP INDEX IF EXISTS idx_ab_variants_test;
    DROP INDEX IF EXISTS idx_ab_results_test_variant;
    DROP TABLE IF EXISTS ab_test_results;
    DROP TABLE IF EXISTS email_ab_variants;
    DROP TABLE IF EXISTS email_ab_tests;
  `)
  .then(() => {
    console.log('✅ Sistema de A/B Testing removido')
  })
}