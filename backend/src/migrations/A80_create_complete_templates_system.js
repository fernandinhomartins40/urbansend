/**
 * MIGRATION: A80_create_complete_templates_system
 *
 * OBJETIVO: Criar sistema completo de templates compartilhados
 *
 * FUNCIONALIDADES:
 * - Tabelas base necessárias (users, email_templates)
 * - Sistema completo de templates compartilhados da A68
 * - Evita conflitos com tabelas existentes
 *
 * FEATURES IMPLEMENTADAS:
 * - Templates de sistema e públicos
 * - Sistema de categorização
 * - Avaliações e favoritos
 * - Coleções de templates
 * - Analytics de uso
 * - Views otimizadas
 */

exports.up = function(knex) {
  return knex.schema.raw(`
    -- =====================================
    -- TABELA DE USUÁRIOS (BASE)
    -- =====================================

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      organization VARCHAR(255),
      phone VARCHAR(50),
      is_verified BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      is_admin BOOLEAN DEFAULT FALSE,
      verification_token VARCHAR(255),
      verification_token_expires DATETIME,
      reset_password_token VARCHAR(255),
      reset_password_expires DATETIME,
      last_login DATETIME,
      timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
      language VARCHAR(10) DEFAULT 'pt-BR',
      email_verified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
    CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_password_token);

    -- =====================================
    -- TABELA DE EMAIL TEMPLATES (BASE + EXTENSÕES)
    -- =====================================

    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      html_content TEXT,
      text_content TEXT,
      description TEXT,

      -- Campos básicos (A06)
      category VARCHAR(50) DEFAULT 'general',
      is_active BOOLEAN DEFAULT TRUE,
      variables JSON,

      -- Extensões para sistema compartilhado (A68)
      template_type VARCHAR(20) DEFAULT 'user' CHECK (template_type IN ('user', 'system', 'shared')),
      is_public BOOLEAN DEFAULT FALSE,
      tags TEXT,
      usage_count INTEGER DEFAULT 0,
      rating DECIMAL(3,2) DEFAULT 0.0,
      total_ratings INTEGER DEFAULT 0,
      clone_count INTEGER DEFAULT 0,
      original_template_id INTEGER,
      preview_image_url TEXT,
      industry VARCHAR(50),
      difficulty_level VARCHAR(20) DEFAULT 'easy' CHECK (difficulty_level IN ('easy', 'medium', 'advanced')),
      estimated_time_minutes INTEGER DEFAULT 5,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (original_template_id) REFERENCES email_templates(id)
    );

    -- =====================================
    -- TABELA DE CATEGORIAS DE TEMPLATES
    -- =====================================

    CREATE TABLE IF NOT EXISTS template_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      icon VARCHAR(50),
      color VARCHAR(20),
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Categorias padrão
    INSERT OR IGNORE INTO template_categories (name, description, icon, color, display_order) VALUES
    ('marketing', 'Templates para campanhas de marketing', 'megaphone', '#3b82f6', 1),
    ('transactional', 'Templates para emails transacionais', 'receipt', '#10b981', 2),
    ('newsletter', 'Templates para newsletters', 'newspaper', '#8b5cf6', 3),
    ('welcome', 'Templates de boas-vindas', 'hand-wave', '#f59e0b', 4),
    ('ecommerce', 'Templates para e-commerce', 'shopping-cart', '#ef4444', 5),
    ('event', 'Templates para eventos', 'calendar', '#06b6d4', 6),
    ('education', 'Templates educacionais', 'academic-cap', '#84cc16', 7),
    ('healthcare', 'Templates para área da saúde', 'heart', '#ec4899', 8),
    ('finance', 'Templates para setor financeiro', 'currency-dollar', '#14b8a6', 9),
    ('general', 'Templates gerais', 'template', '#6b7280', 10);

    -- =====================================
    -- TABELA DE AVALIAÇÕES DE TEMPLATES
    -- =====================================

    CREATE TABLE IF NOT EXISTS template_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review TEXT,
      is_helpful BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(template_id, user_id)
    );

    -- =====================================
    -- TABELA DE HISTÓRICO DE CLONAGEM
    -- =====================================

    CREATE TABLE IF NOT EXISTS template_clone_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_template_id INTEGER NOT NULL,
      cloned_template_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      customizations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (original_template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (cloned_template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- =====================================
    -- TABELA DE TEMPLATES FAVORITOS
    -- =====================================

    CREATE TABLE IF NOT EXISTS user_favorite_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
      UNIQUE(user_id, template_id)
    );

    -- =====================================
    -- TABELA DE COLEÇÕES DE TEMPLATES
    -- =====================================

    CREATE TABLE IF NOT EXISTS template_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_public BOOLEAN DEFAULT FALSE,
      is_featured BOOLEAN DEFAULT FALSE,
      cover_image_url TEXT,
      template_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      display_order INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_id) REFERENCES template_collections(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
      UNIQUE(collection_id, template_id)
    );

    -- =====================================
    -- ÍNDICES PARA PERFORMANCE OTIMIZADA
    -- =====================================

    -- Email templates
    CREATE INDEX IF NOT EXISTS idx_templates_user_type_active ON email_templates(user_id, template_type, is_active, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_templates_type_category_public ON email_templates(template_type, category, is_public, is_active);
    CREATE INDEX IF NOT EXISTS idx_templates_category_public_rating ON email_templates(category, is_public, rating DESC, usage_count DESC);
    CREATE INDEX IF NOT EXISTS idx_templates_industry_type_public ON email_templates(industry, template_type, is_public, rating DESC);
    CREATE INDEX IF NOT EXISTS idx_templates_original_id ON email_templates(original_template_id);

    -- Template ratings
    CREATE INDEX IF NOT EXISTS idx_template_ratings_template_rating ON template_ratings(template_id, rating, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_template_ratings_user_template ON template_ratings(user_id, template_id);

    -- User favorites
    CREATE INDEX IF NOT EXISTS idx_favorite_templates_user_created ON user_favorite_templates(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_favorite_templates_template ON user_favorite_templates(template_id);

    -- Collections
    CREATE INDEX IF NOT EXISTS idx_collections_public_featured_created ON template_collections(is_public, is_featured, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collections_user ON template_collections(user_id);
    CREATE INDEX IF NOT EXISTS idx_collection_items_collection_order ON template_collection_items(collection_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_collection_items_template ON template_collection_items(template_id);

    -- =====================================
    -- VIEWS PARA CONSULTAS OTIMIZADAS
    -- =====================================

    -- View para templates públicos com estatísticas
    CREATE VIEW IF NOT EXISTS view_public_templates AS
    SELECT
      t.*,
      c.name as category_name,
      c.icon as category_icon,
      c.color as category_color,
      COALESCE(AVG(tr.rating), 0) as avg_rating,
      COUNT(tr.id) as total_reviews,
      COUNT(uf.id) as favorite_count
    FROM email_templates t
    LEFT JOIN template_categories c ON t.category = c.name
    LEFT JOIN template_ratings tr ON t.id = tr.template_id
    LEFT JOIN user_favorite_templates uf ON t.id = uf.template_id
    WHERE t.is_active = 1 AND (t.is_public = 1 OR t.template_type = 'system')
    GROUP BY t.id;

    -- View para templates do usuário com estatísticas
    CREATE VIEW IF NOT EXISTS view_user_templates AS
    SELECT
      t.*,
      c.name as category_name,
      c.icon as category_icon,
      c.color as category_color,
      CASE WHEN uf.id IS NOT NULL THEN 1 ELSE 0 END as is_favorited,
      COALESCE(t.usage_count, 0) as personal_usage_count
    FROM email_templates t
    LEFT JOIN template_categories c ON t.category = c.name
    LEFT JOIN user_favorite_templates uf ON t.id = uf.template_id AND uf.user_id = t.user_id
    WHERE t.is_active = 1;

    -- =====================================
    -- TRIGGERS PARA MANUTENÇÃO AUTOMÁTICA
    -- =====================================

    -- Trigger para atualizar contador de coleções
    CREATE TRIGGER IF NOT EXISTS update_collection_template_count
    AFTER INSERT ON template_collection_items
    BEGIN
      UPDATE template_collections
      SET template_count = (
        SELECT COUNT(*)
        FROM template_collection_items
        WHERE collection_id = NEW.collection_id
      )
      WHERE id = NEW.collection_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_collection_template_count_delete
    AFTER DELETE ON template_collection_items
    BEGIN
      UPDATE template_collections
      SET template_count = (
        SELECT COUNT(*)
        FROM template_collection_items
        WHERE collection_id = OLD.collection_id
      )
      WHERE id = OLD.collection_id;
    END;

    -- Trigger para atualizar rating médio
    CREATE TRIGGER IF NOT EXISTS update_template_rating
    AFTER INSERT ON template_ratings
    BEGIN
      UPDATE email_templates
      SET
        rating = (
          SELECT ROUND(AVG(rating), 2)
          FROM template_ratings
          WHERE template_id = NEW.template_id
        ),
        total_ratings = (
          SELECT COUNT(*)
          FROM template_ratings
          WHERE template_id = NEW.template_id
        )
      WHERE id = NEW.template_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_template_rating_update
    AFTER UPDATE ON template_ratings
    BEGIN
      UPDATE email_templates
      SET
        rating = (
          SELECT ROUND(AVG(rating), 2)
          FROM template_ratings
          WHERE template_id = NEW.template_id
        ),
        total_ratings = (
          SELECT COUNT(*)
          FROM template_ratings
          WHERE template_id = NEW.template_id
        )
      WHERE id = NEW.template_id;
    END;

    -- =====================================
    -- TEMPLATES DE SISTEMA PADRÃO
    -- =====================================

    -- Inserir usuário sistema se não existir
    INSERT OR IGNORE INTO users (id, email, password_hash, name, is_admin, is_verified, is_active)
    VALUES (1, 'system@ultrazend.com.br', 'system', 'Sistema UltraZend', 1, 1, 1);

    -- Templates profissionais de sistema
    INSERT OR IGNORE INTO email_templates (
      id, user_id, name, subject, html_content, template_type, category,
      is_public, is_active, tags, industry, difficulty_level,
      estimated_time_minutes, description, created_at
    ) VALUES
    (1, 1, 'Welcome Professional', 'Bem-vindo(a) à nossa plataforma!',
     '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <header style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">Bem-vindo(a)!</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Estamos felizes em tê-lo(a) conosco</p>
        </header>
        <main style="padding: 40px 20px;">
          <h2 style="color: #333; margin-bottom: 20px;">Primeiros passos:</h2>
          <div style="background: #f8f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #555;">Complete seu perfil e comece a explorar todas as funcionalidades disponíveis.</p>
          </div>
          <a href="#" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Começar agora</a>
        </main>
        <footer style="background: #f5f5f5; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p style="margin: 0;">© {{year}} {{company_name}}. Todos os direitos reservados.</p>
        </footer>
      </div>',
     'system', 'welcome', 1, 1, '["boas-vindas", "profissional", "onboarding"]', 'general', 'easy', 5,
     'Template profissional de boas-vindas com design moderno e responsivo', datetime('now')),

    (2, 1, 'Newsletter Modern', 'Newsletter {{month}} - Novidades e atualizações',
     '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <header style="background: #1a202c; color: white; padding: 30px 20px;">
          <h1 style="margin: 0; font-size: 24px; text-align: center;">Newsletter</h1>
        </header>
        <section style="padding: 30px 20px;">
          <h2 style="color: #2d3748; border-bottom: 3px solid #4299e1; padding-bottom: 10px;">Destaques do mês</h2>
          <div style="margin: 20px 0;">
            <h3 style="color: #4299e1; margin-bottom: 8px;">Novidade 1</h3>
            <p style="color: #4a5568; line-height: 1.6;">Descrição da primeira novidade com detalhes interessantes.</p>
          </div>
          <div style="margin: 20px 0;">
            <h3 style="color: #4299e1; margin-bottom: 8px;">Novidade 2</h3>
            <p style="color: #4a5568; line-height: 1.6;">Descrição da segunda novidade com informações relevantes.</p>
          </div>
        </section>
        <footer style="background: #edf2f7; padding: 20px; text-align: center;">
          <p style="margin: 0; color: #718096; font-size: 14px;">Você recebeu este email porque está inscrito em nossa newsletter.</p>
          <a href="#" style="color: #4299e1; text-decoration: none; font-size: 14px;">Cancelar inscrição</a>
        </footer>
      </div>',
     'system', 'newsletter', 1, 1, '["newsletter", "moderno", "informativo"]', 'general', 'easy', 10,
     'Template moderno para newsletters com seções organizadas', datetime('now')),

    (3, 1, 'E-commerce Order Confirmation', 'Confirmação do pedido #{{order_id}}',
     '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0;">
        <header style="background: #38a169; color: white; padding: 25px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Pedido Confirmado!</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Obrigado pela sua compra</p>
        </header>
        <main style="padding: 30px 20px;">
          <div style="background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
            <strong style="color: #276749;">Pedido #{{order_id}}</strong>
            <p style="margin: 5px 0 0; color: #2d3748;">Status: <span style="color: #38a169;">Confirmado</span></p>
          </div>
          <h3 style="color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Itens do pedido:</h3>
          <div style="margin: 15px 0;">
            <p style="color: #4a5568; margin: 8px 0;">• {{item_1}} - {{price_1}}</p>
            <p style="color: #4a5568; margin: 8px 0;">• {{item_2}} - {{price_2}}</p>
          </div>
          <div style="background: #edf2f7; padding: 15px; border-radius: 6px; margin-top: 20px;">
            <strong style="color: #2d3748;">Total: {{total_price}}</strong>
          </div>
        </main>
        <footer style="background: #f7fafc; padding: 20px; text-align: center; color: #718096; font-size: 14px;">
          <p style="margin: 0;">Dúvidas? Entre em contato conosco.</p>
        </footer>
      </div>',
     'system', 'ecommerce', 1, 1, '["ecommerce", "confirmacao", "pedido", "transacional"]', 'ecommerce', 'medium', 8,
     'Template para confirmação de pedidos em e-commerce com design profissional', datetime('now')),

    (4, 1, 'Event Invitation Modern', 'Você está convidado: {{event_name}}',
     '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <header style="background: linear-gradient(45deg, #ff6b6b, #ffa726); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 32px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Você está convidado!</h1>
        </header>
        <main style="padding: 40px 20px; background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #2c3e50; margin-bottom: 10px; font-size: 24px;">{{event_name}}</h2>
            <p style="color: #34495e; font-size: 18px; margin: 0;">{{event_date}} às {{event_time}}</p>
          </div>
          <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 25px;">
            <h3 style="color: #2c3e50; margin-top: 0;">Detalhes do evento:</h3>
            <p style="color: #34495e; line-height: 1.6; margin-bottom: 15px;">{{event_description}}</p>
            <p style="color: #7f8c8d; margin: 0;"><strong>Local:</strong> {{event_location}}</p>
          </div>
          <div style="text-align: center;">
            <a href="#" style="display: inline-block; background: linear-gradient(45deg, #ff6b6b, #ffa726); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(255,107,107,0.3);">Confirmar presença</a>
          </div>
        </main>
        <footer style="background: #2c3e50; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p style="margin: 0; opacity: 0.8; font-size: 14px;">Esperamos você lá!</p>
        </footer>
      </div>',
     'system', 'event', 1, 1, '["evento", "convite", "moderno", "colorido"]', 'general', 'medium', 12,
     'Template moderno para convites de evento com gradientes e design atraente', datetime('now'));
  `)
  .then(() => {
    console.log('✅ Sistema Completo de Templates Compartilhados criado com sucesso!')
    console.log('📚 Funcionalidades implementadas:')
    console.log('   - Tabela users (base do sistema)')
    console.log('   - Tabela email_templates (estendida)')
    console.log('   - Templates de sistema (4 templates padrão)')
    console.log('   - Sistema de categorização (10 categorias)')
    console.log('   - Sistema de avaliações e favoritos')
    console.log('   - Coleções de templates')
    console.log('   - Histórico de clonagem')
    console.log('   - 18 índices otimizados')
    console.log('   - 2 views para consultas')
    console.log('   - 4 triggers automáticos')
    console.log('🎯 Templates disponíveis: Welcome, Newsletter, E-commerce, Event')
    console.log('🔧 Sistema pronto para uso!')
  })
}

exports.down = function(knex) {
  return knex.schema.raw(`
    -- Remover triggers
    DROP TRIGGER IF EXISTS update_template_rating_update;
    DROP TRIGGER IF EXISTS update_template_rating;
    DROP TRIGGER IF EXISTS update_collection_template_count_delete;
    DROP TRIGGER IF EXISTS update_collection_template_count;

    -- Remover views
    DROP VIEW IF EXISTS view_user_templates;
    DROP VIEW IF EXISTS view_public_templates;

    -- Remover tabelas (ordem inversa devido a foreign keys)
    DROP TABLE IF EXISTS template_collection_items;
    DROP TABLE IF EXISTS template_collections;
    DROP TABLE IF EXISTS user_favorite_templates;
    DROP TABLE IF EXISTS template_clone_history;
    DROP TABLE IF EXISTS template_ratings;
    DROP TABLE IF EXISTS template_categories;
    DROP TABLE IF EXISTS email_templates;
    DROP TABLE IF EXISTS users;
  `)
  .then(() => {
    console.log('✅ Sistema de Templates Compartilhados removido')
  })
}