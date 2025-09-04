const knex = require('knex');
const path = require('path');

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'backend', 'ultrazend.sqlite')
  },
  useNullAsDefault: true
});

async function testSchema() {
  try {
    console.log('🔍 Testando schema das tabelas...\n');
    
    // Test users table
    console.log('📋 Tabela USERS:');
    const usersInfo = await db.raw("PRAGMA table_info(users)");
    console.log('Colunas encontradas:', usersInfo.map(col => `${col.name} (${col.type})`).join(', '));
    
    console.log('\n📋 Tabela DOMAINS:');
    const domainsInfo = await db.raw("PRAGMA table_info(domains)");
    console.log('Colunas encontradas:', domainsInfo.map(col => `${col.name} (${col.type})`).join(', '));
    
    console.log('\n✅ Teste de SELECT com first_name e last_name:');
    try {
      const result = await db('users').select('first_name', 'last_name').limit(1);
      console.log('✅ Query funcionou - campos existem');
    } catch (error) {
      console.log('❌ Erro:', error.message);
    }
    
    console.log('\n✅ Teste de SELECT com domain_name:');
    try {
      const result = await db('domains').select('domain_name').limit(1);
      console.log('✅ Query funcionou - campo domain_name existe');
    } catch (error) {
      console.log('❌ Erro:', error.message);
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await db.destroy();
  }
}

testSchema();