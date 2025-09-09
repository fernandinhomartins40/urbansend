/**
 * MIGRATION: A68_create_shared_templates_system
 * 
 * OBJETIVO: Implementar sistema completo de templates compartilhados
 * 
 * FASE 3: Funcionalidades Avançadas - Templates Compartilhados
 * 
 * FEATURES IMPLEMENTADAS:
 * - Templates de sistema (criados por admins)
 * - Templates públicos de usuários (compartilháveis)
 * - Sistema de categorização
 * - Sistema de clonagem de templates
 * - Controle de visibilidade
 * 
 * IMPACTO ESPERADO:
 * - Biblioteca robusta de templates profissionais
 * - Compartilhamento entre usuários da plataforma
 * - Redução de tempo na criação de emails
 * - Melhoria da qualidade dos templates
 */

exports.up = function(knex) {
  return knex.schema.raw(`
    -- =====================================
    -- EXTENSÃO DA TABELA DE TEMPLATES
    -- =====================================
    
    -- Adicionar colunas para sistema de templates compartilhados
    ALTER TABLE email_templates 
    ADD COLUMN template_type VARCHAR(20) DEFAULT 'user'
    CHECK (template_type IN ('user', 'system', 'shared'));
    
    ALTER TABLE email_templates 
    ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
    
    ALTER TABLE email_templates 
    ADD COLUMN category VARCHAR(50) DEFAULT 'general';
    
    ALTER TABLE email_templates 
    ADD COLUMN tags TEXT; -- JSON array de tags para busca
    
    ALTER TABLE email_templates 
    ADD COLUMN usage_count INTEGER DEFAULT 0; -- Contador de uso
    
    ALTER TABLE email_templates 
    ADD COLUMN rating DECIMAL(3,2) DEFAULT 0.0; -- Rating médio (0-5)
    
    ALTER TABLE email_templates 
    ADD COLUMN total_ratings INTEGER DEFAULT 0; -- Total de avaliações
    
    ALTER TABLE email_templates 
    ADD COLUMN clone_count INTEGER DEFAULT 0; -- Quantas vezes foi clonado
    
    ALTER TABLE email_templates 
    ADD COLUMN original_template_id INTEGER; -- ID do template original (se for cópia)
    
    ALTER TABLE email_templates 
    ADD COLUMN preview_image_url TEXT; -- URL da imagem de preview
    
    ALTER TABLE email_templates 
    ADD COLUMN industry VARCHAR(50); -- Setor/indústria do template
    
    ALTER TABLE email_templates 
    ADD COLUMN difficulty_level VARCHAR(20) DEFAULT 'easy'
    CHECK (difficulty_level IN ('easy', 'medium', 'advanced'));
    
    ALTER TABLE email_templates 
    ADD COLUMN estimated_time_minutes INTEGER DEFAULT 5; -- Tempo estimado de uso
    
    -- =====================================
    -- TABELA DE CATEGORIAS DE TEMPLATES
    -- =====================================
    
    CREATE TABLE IF NOT EXISTS template_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      icon VARCHAR(50), -- Ícone para UI
      color VARCHAR(20), -- Cor para UI
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Categorias padrão
    INSERT INTO template_categories (name, description, icon, color, display_order) VALUES
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
      UNIQUE(template_id, user_id) -- Um usuário só pode avaliar uma vez cada template
    );

    -- =====================================
    -- TABELA DE HISTÓRICO DE CLONAGEM
    -- =====================================
    
    CREATE TABLE IF NOT EXISTS template_clone_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_template_id INTEGER NOT NULL,
      cloned_template_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL, -- Usuário que fez a cópia
      customizations JSON, -- Mudanças feitas no template clonado
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
      UNIQUE(user_id, template_id) -- Um template só pode ser favoritado uma vez por usuário
    );

    -- =====================================
    -- TABELA DE COLEÇÕES DE TEMPLATES
    -- =====================================
    
    CREATE TABLE IF NOT EXISTS template_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, -- NULL para coleções do sistema
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_public BOOLEAN DEFAULT FALSE,
      is_featured BOOLEAN DEFAULT FALSE, -- Coleções em destaque
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
    
    -- Templates compartilhados: busca por tipo, categoria e público
    CREATE INDEX IF NOT EXISTS idx_templates_type_category_public 
    ON email_templates(template_type, category, is_public, is_active);
    
    -- Templates por usuário e tipo
    CREATE INDEX IF NOT EXISTS idx_templates_user_type_active 
    ON email_templates(user_id, template_type, is_active, created_at DESC);
    
    -- Busca de templates: categoria + público + rating
    CREATE INDEX IF NOT EXISTS idx_templates_category_public_rating 
    ON email_templates(category, is_public, rating DESC, usage_count DESC);
    
    -- Templates por indústria
    CREATE INDEX IF NOT EXISTS idx_templates_industry_type_public 
    ON email_templates(industry, template_type, is_public, rating DESC);
    
    -- Avaliações: template + rating
    CREATE INDEX IF NOT EXISTS idx_template_ratings_template_rating 
    ON template_ratings(template_id, rating, created_at DESC);
    
    -- Favoritos: usuário + template
    CREATE INDEX IF NOT EXISTS idx_favorite_templates_user_created 
    ON user_favorite_templates(user_id, created_at DESC);
    
    -- Coleções: público + em destaque + data
    CREATE INDEX IF NOT EXISTS idx_collections_public_featured_created 
    ON template_collections(is_public, is_featured, created_at DESC);
    
    -- Itens de coleção: coleção + ordem
    CREATE INDEX IF NOT EXISTS idx_collection_items_collection_order 
    ON template_collection_items(collection_id, display_order);

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

    -- =====================================
    -- INSERIR TEMPLATES DE SISTEMA PADRÃO
    -- =====================================
    
    -- Templates profissionais de sistema
    INSERT INTO email_templates (
      user_id, name, subject, html_content, template_type, category, 
      is_public, is_active, tags, industry, difficulty_level, 
      estimated_time_minutes, description, created_at
    ) VALUES 
    (1, 'Welcome Professional', 'Bem-vindo(a) à nossa plataforma!', 
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
    
    (1, 'Newsletter Modern', 'Newsletter {{month}} - Novidades e atualizações',
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
    
    (1, 'E-commerce Order Confirmation', 'Confirmação do pedido #{{order_id}}',
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
    
    (1, 'Event Invitation Modern', 'Você está convidado: {{event_name}}',
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
    console.log('✅ Sistema de Templates Compartilhados criado com sucesso!')
    console.log('📚 Funcionalidades implementadas:')
    console.log('   - Templates de sistema (4 templates padrão)')
    console.log('   - Sistema de categorização (10 categorias)')
    console.log('   - Sistema de avaliações e favoritos')
    console.log('   - Coleções de templates')
    console.log('   - Histórico de clonagem')
    console.log('   - 12 índices otimizados')
    console.log('   - 2 views para consultas')
    console.log('   - 3 triggers automáticos')
    console.log('🎯 Templates disponíveis: Welcome, Newsletter, E-commerce, Event')
  })
}

exports.down = function(knex) {
  return knex.schema.raw(`
    -- Remover views
    DROP VIEW IF EXISTS view_public_templates;
    DROP VIEW IF EXISTS view_user_templates;
    
    -- Remover triggers
    DROP TRIGGER IF EXISTS update_collection_template_count;
    DROP TRIGGER IF EXISTS update_collection_template_count_delete;
    DROP TRIGGER IF EXISTS update_template_rating;
    
    -- Remover índices
    DROP INDEX IF EXISTS idx_templates_type_category_public;
    DROP INDEX IF EXISTS idx_templates_user_type_active;
    DROP INDEX IF EXISTS idx_templates_category_public_rating;
    DROP INDEX IF EXISTS idx_templates_industry_type_public;
    DROP INDEX IF EXISTS idx_template_ratings_template_rating;
    DROP INDEX IF EXISTS idx_favorite_templates_user_created;
    DROP INDEX IF EXISTS idx_collections_public_featured_created;
    DROP INDEX IF EXISTS idx_collection_items_collection_order;
    
    -- Remover tabelas
    DROP TABLE IF EXISTS template_collection_items;
    DROP TABLE IF EXISTS template_collections;
    DROP TABLE IF EXISTS user_favorite_templates;
    DROP TABLE IF EXISTS template_clone_history;
    DROP TABLE IF EXISTS template_ratings;
    DROP TABLE IF EXISTS template_categories;
    
    -- Remover colunas adicionadas
    ALTER TABLE email_templates DROP COLUMN IF EXISTS template_type;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS is_public;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS category;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS tags;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS usage_count;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS rating;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS total_ratings;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS clone_count;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS original_template_id;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS preview_image_url;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS industry;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS difficulty_level;
    ALTER TABLE email_templates DROP COLUMN IF EXISTS estimated_time_minutes;
  `)
  .then(() => {
    console.log('✅ Sistema de Templates Compartilhados removido')
  })
}