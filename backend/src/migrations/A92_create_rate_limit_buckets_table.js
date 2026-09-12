/** @param { import("knex").Knex } knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('rate_limit_buckets', (table) => {
    table.string('bucket_key', 512).primary();
    table.integer('count').notNullable().defaultTo(0);
    table.timestamp('reset_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index('reset_at');
  });
};

/** @param { import("knex").Knex } knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('rate_limit_buckets');
};
