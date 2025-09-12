/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('user_plans', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('plan_name').notNullable().defaultTo('free');
    table.boolean('is_active').defaultTo(true);
    table.decimal('monthly_price', 10, 2).defaultTo(0);
    table.date('started_at').defaultTo(knex.fn.now());
    table.date('expires_at');
    table.string('stripe_subscription_id');
    table.string('payment_method');
    table.text('features').comment('JSON string of plan features');
    table.timestamps(true, true);

    // Foreign key constraint
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index('user_id');
    table.index('plan_name');
    table.index('is_active');
    table.index(['user_id', 'is_active']);
  });

  // Insert default plan for existing users
  const users = await knex('users').select('id');
  for (const user of users) {
    await knex('user_plans').insert({
      user_id: user.id,
      plan_name: 'free',
      is_active: true,
      monthly_price: 0,
      started_at: knex.fn.now()
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('user_plans');
};