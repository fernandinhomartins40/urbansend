/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('domains', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('domain', 255).notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.string('verification_token', 255);
    table.string('verification_method', 50).defaultTo('dns');
    table.boolean('dkim_enabled').defaultTo(false);
    table.boolean('spf_enabled').defaultTo(false);
    table.boolean('dmarc_enabled').defaultTo(false);
    table.timestamp('verified_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Índices
    table.index(['user_id'], 'idx_domains_user_id');
    table.index(['domain'], 'idx_domains_domain');
    table.index(['is_verified'], 'idx_domains_verified');
    table.unique(['user_id', 'domain'], 'idx_domains_user_domain_unique');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('domains');
};