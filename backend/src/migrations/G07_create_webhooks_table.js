/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('webhooks', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name', 255).notNullable();
    table.string('url', 1000).notNullable();
    table.json('events').defaultTo('[]'); // ['email.sent', 'email.delivered', 'email.bounced', etc.]
    table.string('secret', 255);
    table.boolean('is_active').defaultTo(true);
    table.integer('retry_attempts').defaultTo(3);
    table.timestamp('last_triggered_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Índices
    table.index(['user_id'], 'idx_webhooks_user_id');
    table.index(['is_active'], 'idx_webhooks_active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('webhooks');
};