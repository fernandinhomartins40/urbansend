/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('dkim_keys', function (table) {
    table.increments('id').primary();
    table.integer('domain_id').unsigned().notNullable();
    table.string('selector', 100).notNullable();
    table.text('private_key').notNullable();
    table.text('public_key').notNullable();
    table.string('algorithm', 50).defaultTo('rsa-sha256');
    table.string('canonicalization', 50).defaultTo('relaxed/relaxed');
    table.integer('key_size').defaultTo(2048);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('domain_id').references('id').inTable('domains').onDelete('CASCADE');
    
    // Índices
    table.index(['domain_id'], 'idx_dkim_keys_domain_id');
    table.index(['selector'], 'idx_dkim_keys_selector');
    table.index(['is_active'], 'idx_dkim_keys_active');
    table.unique(['domain_id', 'selector'], 'idx_dkim_keys_domain_selector_unique');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dkim_keys');
};