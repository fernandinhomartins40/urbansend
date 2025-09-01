const bcrypt = require('bcrypt');
const crypto = require('crypto');

exports.up = async function(knex) {
  // Verificar se usuário sistema já existe
  const existingSystemUser = await knex('users')
    .where('email', 'system@ultrazend.local')
    .first();

  if (existingSystemUser) {
    // Sistema já inicializado - inserir config se não existir
    await knex('system_config')
      .insert({
        key: 'system_user_id',
        value: existingSystemUser.id.toString(),
        description: 'ID do usuário sistema para operações internas',
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('key')
      .merge(['updated_at']);
    
    return;
  }

  // Gerar senha segura para usuário sistema
  const systemPassword = process.env.SYSTEM_USER_PASSWORD || 
    crypto.randomBytes(32).toString('hex');
  
  const systemPasswordHash = await bcrypt.hash(systemPassword, 12);
  
  // Criar usuário sistema
  const [systemUserId] = await knex('users').insert({
    name: 'UltraZend System',
    email: 'system@ultrazend.local',
    password_hash: systemPasswordHash,
    is_verified: true,
    plan_type: 'system',
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // Inserir configuração do sistema
  await knex('system_config')
    .insert({
      key: 'system_user_id',
      value: systemUserId.toString(),
      description: 'ID do usuário sistema para operações internas',
      created_at: new Date(),
      updated_at: new Date()
    })
    .onConflict('key')
    .merge(['value', 'updated_at']);

  // Log de criação (apenas se senha foi auto-gerada)
  if (!process.env.SYSTEM_USER_PASSWORD) {
    console.log(`Sistema criado com usuário: system@ultrazend.local`);
    console.log(`Senha auto-gerada disponível via SYSTEM_USER_PASSWORD`);
  }
};

exports.down = function(knex) {
  return Promise.all([
    knex('system_config').where('key', 'system_user_id').del(),
    knex('users').where('email', 'system@ultrazend.local').del()
  ]);
};