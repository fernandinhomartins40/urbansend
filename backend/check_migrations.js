const db = require('./dist/config/database.js').default;

async function checkMigrations() {
  try {
    console.log('=== VERIFICANDO ESTRUTURA knex_migrations ===');
    const structure = await db.raw("PRAGMA table_info(knex_migrations)");
    console.table(structure);
    
    console.log('\n=== CONTEÚDO knex_migrations ===');
    const migrations = await db.raw("SELECT * FROM knex_migrations ORDER BY batch, migration_time");
    console.log(`Total de registros: ${migrations.length}`);
    migrations.forEach((m, i) => {
      console.log(`${i+1}. ${m.name} - Batch: ${m.batch} - ${m.migration_time}`);
    });
    
    console.log('\n=== VERIFICANDO SE queue_job_failures EXISTE ===');
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='queue_job_failures'");
    console.log('Tabela queue_job_failures existe:', tables.length > 0 ? 'SIM' : 'NÃO');
    
    process.exit(0);
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
}

checkMigrations();
