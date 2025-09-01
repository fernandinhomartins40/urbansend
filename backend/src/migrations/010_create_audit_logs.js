exports.up = async function(knex) {
  // Criar tabela de auditoria para rastreamento de ações do sistema
  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary();
    table.integer('user_id').nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable().index(); // Ações como 'email_verified', 'login', 'password_changed'
    table.text('details').nullable(); // JSON com detalhes da ação
    table.string('ip_address', 45).nullable(); // IPv4 ou IPv6
    table.string('user_agent', 500).nullable();
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['user_id', 'timestamp']);
    table.index(['action', 'timestamp']);
    table.index('timestamp');
  });

  // Remover implementação temporária do authController se existir
  // A tabela será criada pela migration apropriada
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};