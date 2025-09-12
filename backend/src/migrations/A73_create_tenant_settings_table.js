/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('tenant_settings', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().unique();
    table.string('timezone').defaultTo('America/Sao_Paulo');
    table.string('default_from_email');
    table.string('default_from_name');
    table.boolean('bounce_handling').defaultTo(true);
    table.boolean('open_tracking').defaultTo(true);
    table.boolean('click_tracking').defaultTo(true);
    table.boolean('unsubscribe_tracking').defaultTo(true);
    table.boolean('suppression_list_enabled').defaultTo(true);
    table.string('webhook_url');
    table.string('webhook_secret');
    table.boolean('webhook_enabled').defaultTo(false);
    table.json('custom_headers').comment('Custom SMTP headers as JSON');
    table.json('notification_preferences').comment('Notification settings as JSON');
    table.timestamps(true, true);

    // Foreign key constraint
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index('user_id');
    table.index('timezone');
  });

  // Insert default settings for existing users
  const users = await knex('users').select('id', 'email', 'name');
  for (const user of users) {
    await knex('tenant_settings').insert({
      user_id: user.id,
      timezone: 'America/Sao_Paulo',
      default_from_email: user.email,
      default_from_name: user.name || 'UltraZend User',
      bounce_handling: true,
      open_tracking: true,
      click_tracking: true,
      unsubscribe_tracking: true,
      suppression_list_enabled: true,
      webhook_enabled: false
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('tenant_settings');
};