/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('users', function (table) {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password', 255).notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.string('role', 50).defaultTo('user');
    table.boolean('is_active').defaultTo(true);
    table.string('email_verification_token', 255);
    table.timestamp('verified_at');
    table.string('password_reset_token', 255);
    table.timestamp('password_reset_expires');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Índices
    table.index(['email'], 'idx_users_email');
    table.index(['email_verification_token'], 'idx_users_verification_token');
    table.index(['password_reset_token'], 'idx_users_password_reset');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('users');
};