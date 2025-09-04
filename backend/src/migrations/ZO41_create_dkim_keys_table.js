exports.up = async function(knex) {
  await knex.schema.createTable('dkim_keys', function (table) {
    table.increments('id').primary();
    table.integer('domain_id').unsigned().notNullable();
    table.string('selector', 100).notNullable().defaultTo('default');
    table.text('private_key').notNullable();
    table.text('public_key');
    table.string('algorithm', 20).defaultTo('rsa-sha256');
    table.string('canonicalization', 50).defaultTo('relaxed/relaxed');
    table.integer('key_size').defaultTo(2048);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('expires_at');
    table.timestamps(true, true);
    
    table.foreign('domain_id').references('id').inTable('domains').onDelete('CASCADE');
    table.unique(['domain_id', 'selector']);
    table.index('domain_id');
    table.index('is_active');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('dkim_keys');
};
