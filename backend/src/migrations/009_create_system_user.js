exports.up = async function(knex) {
  // Criar usuário do sistema para emails internos
  const systemUserId = await knex('users').insert({
    name: 'UrbanSend System',
    email: 'system@urbansend.local',
    password_hash: '$2b$12$dummy.hash.for.system.user.that.cannot.login',
    is_verified: true,
    plan_type: 'system',
    created_at: new Date(),
    updated_at: new Date()
  });

  // Armazenar o ID do usuário sistema para referência
  console.log('Sistema criado usuário ID:', systemUserId[0]);
  
  return systemUserId;
};

exports.down = function(knex) {
  return knex('users').where('email', 'system@urbansend.local').del();
};