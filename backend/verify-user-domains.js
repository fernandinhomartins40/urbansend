const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './ultrazend.sqlite'
  },
  useNullAsDefault: true
});

async function verifyUserDomainsTable() {
  try {
    console.log('🔍 Verificando tabela user_domains...');
    
    // Verificar se tabela existe
    const tableExists = await knex.schema.hasTable('user_domains');
    console.log(`Tabela user_domains existe: ${tableExists}`);
    
    if (tableExists) {
      // Verificar estrutura da tabela
      const columns = await knex.raw("PRAGMA table_info(user_domains)");
      console.log('\n📋 Estrutura da tabela user_domains:');
      columns.forEach(col => {
        console.log(`- ${col.name}: ${col.type} ${col.notnull ? '(NOT NULL)' : ''} ${col.pk ? '(PRIMARY KEY)' : ''}`);
      });
      
      // Verificar campos obrigatórios da Fase 2.1
      const requiredFields = ['user_id', 'domain', 'verified', 'verified_at'];
      const existingFields = columns.map(col => col.name);
      
      console.log('\n✅ Verificação de campos obrigatórios (Fase 2.1):');
      requiredFields.forEach(field => {
        const exists = existingFields.includes(field);
        console.log(`- ${field}: ${exists ? '✅ PRESENTE' : '❌ AUSENTE'}`);
      });
      
      // Contar registros
      const count = await knex('user_domains').count('* as total').first();
      console.log(`\n📊 Total de registros: ${count.total}`);
      
      // Mostrar alguns registros de exemplo
      if (count.total > 0) {
        const sample = await knex('user_domains').limit(3);
        console.log('\n📄 Registros de exemplo:');
        sample.forEach((record, i) => {
          console.log(`${i+1}. ${JSON.stringify(record)}`);
        });
      }
    }
    
    console.log('\n🎯 FASE 2.1 - STATUS:');
    console.log(tableExists ? '✅ Tabela user_domains encontrada' : '❌ Tabela user_domains NÃO encontrada');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await knex.destroy();
  }
}

verifyUserDomainsTable();