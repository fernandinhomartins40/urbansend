#!/usr/bin/env node
/**
 * @ultrazend/smtp-server - Migration Runner
 * Script para executar migrations do banco de dados
 */

const knex = require('knex');
const path = require('path');

async function runMigrations() {
  const databasePath = process.argv[2] || './smtp-server.sqlite';
  
  console.log('🗄️  UltraZend SMTP Server - Migration Runner');
  console.log(`📁 Database: ${databasePath}`);
  
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: databasePath
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '.')
    }
  });

  try {
    console.log('🔄 Running migrations...');
    const [batch, migrations] = await db.migrate.latest();
    
    if (migrations.length === 0) {
      console.log('✅ Database is up to date!');
    } else {
      console.log(`✅ Migrations completed! Batch: ${batch}`);
      console.log('📋 Applied migrations:');
      migrations.forEach((migration, index) => {
        console.log(`   ${index + 1}. ${migration}`);
      });
    }

    // Verificar se há usuários
    const userCount = await db('users').count('* as count').first();
    if (userCount.count === 0) {
      console.log('\n⚠️  No users found. Create a user to enable SMTP authentication:');
      console.log('   server.createUser("admin@localhost", "password123", "Admin")');
    }

    // Verificar se há domínios
    const domainCount = await db('domains').count('* as count').first();
    if (domainCount.count === 0) {
      console.log('\n⚠️  No domains found. Add a domain to enable DKIM:');
      console.log('   server.addDomain("localhost")');
      console.log('   server.setupDKIM("localhost")');
    }

    console.log('\n🚀 Ready to start SMTP server!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;