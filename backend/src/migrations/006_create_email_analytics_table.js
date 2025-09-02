/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('email_analytics', function (table) {
    table.increments('id').primary();
    table.integer('email_id').unsigned().notNullable();
    table.string('event_type', 50).notNullable(); // 'open', 'click', 'bounce', 'delivery', 'unsubscribe'
    table.string('tracking_id', 100);
    table.string('link_url', 1000);
    table.string('user_agent', 1000);
    table.string('ip_address', 45);
    table.string('location', 255);
    table.json('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('email_id').references('id').inTable('emails').onDelete('CASCADE');
    
    // Índices
    table.index(['email_id'], 'idx_analytics_email_id');
    table.index(['event_type'], 'idx_analytics_event_type');
    table.index(['tracking_id'], 'idx_analytics_tracking_id');
    table.index(['created_at'], 'idx_analytics_created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('email_analytics');
};