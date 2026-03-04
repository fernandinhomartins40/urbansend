const TEMPLATE_CATEGORIES = [
  { name: 'marketing', description: 'Templates para campanhas de marketing', icon: 'megaphone', color: '#0ea5e9', display_order: 1 },
  { name: 'transactional', description: 'Templates para emails transacionais', icon: 'receipt', color: '#10b981', display_order: 2 },
  { name: 'newsletter', description: 'Templates para newsletters', icon: 'newspaper', color: '#6366f1', display_order: 3 },
  { name: 'welcome', description: 'Templates de boas-vindas', icon: 'hand-wave', color: '#f59e0b', display_order: 4 },
  { name: 'ecommerce', description: 'Templates para e-commerce', icon: 'shopping-cart', color: '#ef4444', display_order: 5 },
  { name: 'event', description: 'Templates para eventos', icon: 'calendar', color: '#06b6d4', display_order: 6 },
  { name: 'education', description: 'Templates educacionais', icon: 'academic-cap', color: '#84cc16', display_order: 7 },
  { name: 'healthcare', description: 'Templates para saude', icon: 'heart', color: '#ec4899', display_order: 8 },
  { name: 'finance', description: 'Templates para setor financeiro', icon: 'currency-dollar', color: '#14b8a6', display_order: 9 },
  { name: 'general', description: 'Templates gerais', icon: 'template', color: '#6b7280', display_order: 10 }
];

const SYSTEM_TEMPLATES = [
  {
    name: 'Welcome Professional',
    subject: 'Bem-vindo(a) a {{company_name}}',
    category: 'welcome',
    difficulty_level: 'easy',
    estimated_time_minutes: 5,
    tags: ['boas-vindas', 'onboarding', 'institucional'],
    variables: ['company_name', 'user_name', 'cta_url'],
    description: 'Template de boas-vindas com CTA principal.',
    html_content: `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;color:#ffffff;padding:28px 32px;">
                <h1 style="margin:0;font-size:24px;">Bem-vindo(a), {{user_name}}!</h1>
                <p style="margin:10px 0 0;font-size:14px;opacity:.9;">Sua conta na {{company_name}} ja esta pronta para uso.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:#0f172a;">
                <p style="margin:0 0 18px;">Agora voce pode concluir seu onboarding e começar a enviar com seguranca.</p>
                <a href="{{cta_url}}" style="display:inline-block;padding:12px 20px;background:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:bold;">Comecar agora</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
  },
  {
    name: 'Transactional Receipt',
    subject: 'Recebemos seu pedido {{order_id}}',
    category: 'transactional',
    difficulty_level: 'medium',
    estimated_time_minutes: 8,
    tags: ['transacional', 'pedido', 'recibo'],
    variables: ['order_id', 'customer_name', 'total_amount', 'support_email'],
    description: 'Template transacional para confirmação de pedido.',
    html_content: `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;padding:24px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#16a34a;color:#ffffff;">
                <h2 style="margin:0;">Pedido confirmado</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;color:#0f172a;">
                <p style="margin-top:0;">Ola {{customer_name}}, seu pedido <strong>{{order_id}}</strong> foi registrado.</p>
                <p style="margin:0;">Total: <strong>{{total_amount}}</strong></p>
                <p style="margin:14px 0 0;font-size:13px;color:#64748b;">Dúvidas? Fale com {{support_email}}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
  },
  {
    name: 'Newsletter Modern',
    subject: 'Novidades de {{month}} na {{company_name}}',
    category: 'newsletter',
    difficulty_level: 'easy',
    estimated_time_minutes: 10,
    tags: ['newsletter', 'marketing', 'conteudo'],
    variables: ['month', 'company_name', 'headline', 'cta_url'],
    description: 'Template para comunicação periódica com foco em leitura.',
    html_content: `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;padding:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#1d4ed8;color:#ffffff;padding:26px 30px;">
                <h1 style="margin:0;font-size:22px;">{{headline}}</h1>
                <p style="margin:10px 0 0;font-size:14px;">Resumo de {{month}} em {{company_name}}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 30px;color:#0f172a;">
                <p style="margin-top:0;">Compartilhe atualizações, indicadores e novidades da sua operação.</p>
                <a href="{{cta_url}}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:10px;">Ver detalhes</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
  }
];

const addColumnIfMissing = async (knex, tableName, columnName, alterCallback) => {
  const hasColumn = await knex.schema.hasColumn(tableName, columnName);
  if (!hasColumn) {
    await knex.schema.alterTable(tableName, alterCallback);
  }
};

const createIndexIfMissing = async (knex, indexName, tableName, columns) => {
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  await knex.raw(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${quotedColumns})`);
};

const ensureTemplateColumns = async (knex) => {
  const hasTemplatesTable = await knex.schema.hasTable('email_templates');
  if (!hasTemplatesTable) {
    return;
  }

  await addColumnIfMissing(knex, 'email_templates', 'template_type', (table) => {
    table.string('template_type', 20).notNullable().defaultTo('user');
  });

  await addColumnIfMissing(knex, 'email_templates', 'description', (table) => {
    table.text('description').nullable();
  });

  await addColumnIfMissing(knex, 'email_templates', 'is_public', (table) => {
    table.boolean('is_public').notNullable().defaultTo(false);
  });

  await addColumnIfMissing(knex, 'email_templates', 'tags', (table) => {
    table.text('tags').nullable();
  });

  await addColumnIfMissing(knex, 'email_templates', 'usage_count', (table) => {
    table.integer('usage_count').notNullable().defaultTo(0);
  });

  await addColumnIfMissing(knex, 'email_templates', 'rating', (table) => {
    table.decimal('rating', 3, 2).notNullable().defaultTo(0);
  });

  await addColumnIfMissing(knex, 'email_templates', 'total_ratings', (table) => {
    table.integer('total_ratings').notNullable().defaultTo(0);
  });

  await addColumnIfMissing(knex, 'email_templates', 'clone_count', (table) => {
    table.integer('clone_count').notNullable().defaultTo(0);
  });

  await addColumnIfMissing(knex, 'email_templates', 'original_template_id', (table) => {
    table.integer('original_template_id').nullable();
  });

  await addColumnIfMissing(knex, 'email_templates', 'preview_image_url', (table) => {
    table.text('preview_image_url').nullable();
  });

  await addColumnIfMissing(knex, 'email_templates', 'industry', (table) => {
    table.string('industry', 80).nullable();
  });

  await addColumnIfMissing(knex, 'email_templates', 'difficulty_level', (table) => {
    table.string('difficulty_level', 20).notNullable().defaultTo('easy');
  });

  await addColumnIfMissing(knex, 'email_templates', 'estimated_time_minutes', (table) => {
    table.integer('estimated_time_minutes').notNullable().defaultTo(5);
  });
};

const ensureCategoriesTable = async (knex) => {
  const hasTable = await knex.schema.hasTable('template_categories');
  if (!hasTable) {
    await knex.schema.createTable('template_categories', (table) => {
      table.increments('id').primary();
      table.string('name', 100).notNullable().unique();
      table.text('description').nullable();
      table.string('icon', 50).nullable();
      table.string('color', 20).nullable();
      table.integer('display_order').notNullable().defaultTo(0);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamps(true, true);
    });
  }

  for (const category of TEMPLATE_CATEGORIES) {
    const existing = await knex('template_categories').where({ name: category.name }).first();
    if (!existing) {
      await knex('template_categories').insert({
        ...category,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }
};

const ensureRatingsTable = async (knex) => {
  const hasTable = await knex.schema.hasTable('template_ratings');
  if (!hasTable) {
    await knex.schema.createTable('template_ratings', (table) => {
      table.increments('id').primary();
      table.integer('template_id').unsigned().notNullable();
      table.integer('user_id').unsigned().notNullable();
      table.integer('rating').notNullable();
      table.text('review').nullable();
      table.boolean('is_helpful').notNullable().defaultTo(false);
      table.timestamps(true, true);

      table.unique(['template_id', 'user_id']);
      table.index(['template_id', 'rating', 'created_at'], 'idx_template_ratings_template_rating');
      table.index(['user_id', 'template_id'], 'idx_template_ratings_user_template');
      table.foreign('template_id').references('id').inTable('email_templates').onDelete('CASCADE');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }
};

const ensureCloneHistoryTable = async (knex) => {
  const hasTable = await knex.schema.hasTable('template_clone_history');
  if (!hasTable) {
    await knex.schema.createTable('template_clone_history', (table) => {
      table.increments('id').primary();
      table.integer('original_template_id').unsigned().notNullable();
      table.integer('cloned_template_id').unsigned().notNullable();
      table.integer('user_id').unsigned().notNullable();
      table.text('customizations').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.index(['original_template_id', 'created_at'], 'idx_template_clone_history_original_created');
      table.index(['user_id', 'created_at'], 'idx_template_clone_history_user_created');
      table.foreign('original_template_id').references('id').inTable('email_templates').onDelete('CASCADE');
      table.foreign('cloned_template_id').references('id').inTable('email_templates').onDelete('CASCADE');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }
};

const ensureFavoritesTable = async (knex) => {
  const hasTable = await knex.schema.hasTable('user_favorite_templates');
  if (!hasTable) {
    await knex.schema.createTable('user_favorite_templates', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.integer('template_id').unsigned().notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.unique(['user_id', 'template_id']);
      table.index(['user_id', 'created_at'], 'idx_user_favorite_templates_user_created');
      table.index(['template_id', 'created_at'], 'idx_user_favorite_templates_template_created');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('template_id').references('id').inTable('email_templates').onDelete('CASCADE');
    });
  }
};

const ensureCollectionsTables = async (knex) => {
  const hasCollections = await knex.schema.hasTable('template_collections');
  if (!hasCollections) {
    await knex.schema.createTable('template_collections', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().nullable();
      table.string('name', 120).notNullable();
      table.text('description').nullable();
      table.boolean('is_public').notNullable().defaultTo(false);
      table.boolean('is_featured').notNullable().defaultTo(false);
      table.text('cover_image_url').nullable();
      table.integer('template_count').notNullable().defaultTo(0);
      table.timestamps(true, true);

      table.index(['user_id', 'created_at'], 'idx_template_collections_user_created');
      table.index(['is_public', 'is_featured', 'created_at'], 'idx_template_collections_public_featured_created');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }

  const hasCollectionItems = await knex.schema.hasTable('template_collection_items');
  if (!hasCollectionItems) {
    await knex.schema.createTable('template_collection_items', (table) => {
      table.increments('id').primary();
      table.integer('collection_id').unsigned().notNullable();
      table.integer('template_id').unsigned().notNullable();
      table.integer('display_order').notNullable().defaultTo(0);
      table.timestamp('added_at').notNullable().defaultTo(knex.fn.now());

      table.unique(['collection_id', 'template_id']);
      table.index(['collection_id', 'display_order'], 'idx_template_collection_items_collection_order');
      table.foreign('collection_id').references('id').inTable('template_collections').onDelete('CASCADE');
      table.foreign('template_id').references('id').inTable('email_templates').onDelete('CASCADE');
    });
  }
};

const ensureTemplateIndexes = async (knex) => {
  await createIndexIfMissing(knex, 'idx_templates_user_type_active', 'email_templates', ['user_id', 'template_type', 'is_active', 'created_at']);
  await createIndexIfMissing(knex, 'idx_templates_type_category_public', 'email_templates', ['template_type', 'category', 'is_public', 'is_active']);
  await createIndexIfMissing(knex, 'idx_templates_category_public_rating', 'email_templates', ['category', 'is_public', 'rating', 'usage_count']);
  await createIndexIfMissing(knex, 'idx_templates_industry_type_public', 'email_templates', ['industry', 'template_type', 'is_public', 'rating']);
  await createIndexIfMissing(knex, 'idx_templates_original_id', 'email_templates', ['original_template_id']);
};

const ensurePublicTemplatesView = async (knex) => {
  await knex.raw('DROP VIEW IF EXISTS view_public_templates');
  await knex.raw(`
    CREATE VIEW view_public_templates AS
    SELECT
      t.id,
      t.user_id,
      t.name,
      t.subject,
      t.html_content,
      t.text_content,
      t.description,
      t.category,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      t.template_type,
      t.tags,
      t.usage_count,
      t.clone_count,
      t.rating,
      t.total_ratings,
      t.is_public,
      t.is_active,
      t.industry,
      t.difficulty_level,
      t.estimated_time_minutes,
      t.preview_image_url,
      t.created_at,
      t.updated_at,
      COALESCE(NULLIF(t.rating, 0), AVG(tr.rating), 0) AS avg_rating,
      COALESCE(NULLIF(t.total_ratings, 0), COUNT(DISTINCT tr.id), 0) AS total_reviews,
      COUNT(DISTINCT uf.id) AS favorite_count
    FROM email_templates t
    LEFT JOIN template_categories c ON c.name = t.category
    LEFT JOIN template_ratings tr ON tr.template_id = t.id
    LEFT JOIN user_favorite_templates uf ON uf.template_id = t.id
    WHERE t.is_active = TRUE AND (t.is_public = TRUE OR t.template_type = 'system')
    GROUP BY
      t.id, t.user_id, t.name, t.subject, t.html_content, t.text_content,
      t.description, t.category, c.name, c.icon, c.color, t.template_type,
      t.tags, t.usage_count, t.clone_count, t.rating, t.total_ratings,
      t.is_public, t.is_active, t.industry, t.difficulty_level,
      t.estimated_time_minutes, t.preview_image_url, t.created_at, t.updated_at
  `);
};

const ensureSystemTemplates = async (knex) => {
  const user = await knex('users').select('id').orderBy('id', 'asc').first();
  if (!user) {
    return;
  }

  for (const template of SYSTEM_TEMPLATES) {
    const existing = await knex('email_templates')
      .where('template_type', 'system')
      .where('name', template.name)
      .first();

    if (!existing) {
      await knex('email_templates').insert({
        user_id: user.id,
        name: template.name,
        subject: template.subject,
        html_content: template.html_content,
        text_content: template.html_content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        description: template.description,
        category: template.category,
        variables: JSON.stringify(template.variables),
        template_type: 'system',
        is_public: true,
        is_active: true,
        tags: JSON.stringify(template.tags),
        usage_count: 0,
        rating: 4.5,
        total_ratings: 0,
        clone_count: 0,
        industry: 'general',
        difficulty_level: template.difficulty_level,
        estimated_time_minutes: template.estimated_time_minutes,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }
};

exports.up = async function up(knex) {
  const hasTemplatesTable = await knex.schema.hasTable('email_templates');
  if (!hasTemplatesTable) {
    return;
  }

  await ensureTemplateColumns(knex);
  await ensureCategoriesTable(knex);
  await ensureRatingsTable(knex);
  await ensureCloneHistoryTable(knex);
  await ensureFavoritesTable(knex);
  await ensureCollectionsTables(knex);
  await ensureTemplateIndexes(knex);
  await ensurePublicTemplatesView(knex);
  await ensureSystemTemplates(knex);
};

exports.down = async function down(knex) {
  await knex.raw('DROP VIEW IF EXISTS view_public_templates');
  await knex.schema.dropTableIfExists('template_collection_items');
  await knex.schema.dropTableIfExists('template_collections');
  await knex.schema.dropTableIfExists('user_favorite_templates');
  await knex.schema.dropTableIfExists('template_clone_history');
  await knex.schema.dropTableIfExists('template_ratings');
  await knex.schema.dropTableIfExists('template_categories');
};
