/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const crypto = require('crypto');
  const bcrypt = require('bcrypt');
  
  // Generate a random password for the system user
  const systemPassword = crypto.randomBytes(32).toString('hex');
  const hashedPassword = await bcrypt.hash(systemPassword, 12);
  
  // Create the system user (CORRIGIDO: usar is_verified)
  await knex('users').insert({
    name: 'System Administrator',
    email: 'system@ultrazend.local',
    password: hashedPassword,
    is_verified: true, // CORRIGIDO: era email_verified, agora is_verified
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  });
  
  // Store the system password in environment variable or log it
  console.log('Sistema criado com usuário: system@ultrazend.local');
  console.log('Senha auto-gerada disponível via SYSTEM_USER_PASSWORD');
  
  // Set environment variable for the session
  process.env.SYSTEM_USER_PASSWORD = systemPassword;
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex('users').where('email', 'system@ultrazend.local').del();
};