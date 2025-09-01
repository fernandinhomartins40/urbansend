const bcrypt = require('bcrypt');
const crypto = require('crypto');

exports.up = async function(knex) {
  // Verificar se usuário sistema já existe
  const existingSystemUser = await knex('users')
    .where('email', 'system@ultrazend.local')
    .first();

  if (existingSystemUser) {
    // System user already exists - no migration needed
    return existingSystemUser.id;
  }

  // Gerar password real para usuário sistema
  const systemPassword = process.env.SMTP_SYSTEM_PASSWORD || 
    crypto.randomBytes(32).toString('hex');
  
  // Hash da senha com salt forte
  const systemPasswordHash = await bcrypt.hash(systemPassword, 12);
  
  const insertResult = await knex('users').insert({
    name: 'UltraZend System',
    email: 'system@ultrazend.local',
    password_hash: systemPasswordHash,
    is_verified: true,
    plan_type: 'system',
    created_at: new Date(),
    updated_at: new Date()
  });

  const systemUserId = insertResult[0];
  
  // Verificar se tabela system_config existe, criar se não existir
  const hasSystemConfigTable = await knex.schema.hasTable('system_config');
  if (!hasSystemConfigTable) {
    await knex.schema.createTable('system_config', (table) => {
      table.increments('id').primary();
      table.string('key').notNullable().unique();
      table.text('value').notNullable();
      table.string('description');
      table.timestamps(true, true);
    });
    // System config table created
  }
  
  // Criar entrada no sistema de configurações
  await knex('system_config')
    .insert({
      key: 'system_user_id',
      value: systemUserId.toString(),
      description: 'ID do usuário sistema para operações internas',
      created_at: new Date(),
      updated_at: new Date()
    })
    .onConflict('key')
    .merge();
  
  // Log system password generation info only if not provided via environment
  if (!process.env.SMTP_SYSTEM_PASSWORD) {
    // Password auto-generated - ensure SMTP_SYSTEM_PASSWORD is set in production
    // Generated password: systemPassword (accessible only during migration)
  }
  
  return systemUserId;
};

exports.down = function(knex) {
  return Promise.all([
    knex('system_config').where('key', 'system_user_id').del(),
    knex('users').where('email', 'system@ultrazend.local').del()
  ]);
};