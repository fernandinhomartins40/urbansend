/**
 * @ultrazend/smtp-server - Server Starter
 * Script para iniciar o servidor SMTP rapidamente
 */

const { SMTPServer } = require('./dist/index.js');

async function startServer() {
  console.log('🚀 UltraZend SMTP Server - Starting...\n');

  const server = new SMTPServer({
    hostname: 'localhost',
    mxPort: 2525,        // Porta não privilegiada para testes
    submissionPort: 2587, // Porta não privilegiada para testes
    databasePath: './smtp-server.sqlite',
    authRequired: false,  // Desabilitar auth para facilitar testes
    logLevel: 'info'
  });

  try {
    // Iniciar servidor
    await server.start();

    console.log('📧 SMTP Server is running!');
    console.log('📋 Configuration:');
    console.log(`   • MX Server: localhost:2525`);
    console.log(`   • Submission: localhost:2587`);
    console.log(`   • Database: ./smtp-server.sqlite`);
    console.log(`   • Authentication: disabled (for testing)`);
    console.log('\n🧪 Test commands:');
    console.log('   • Send via telnet: telnet localhost 2587');
    console.log('   • Send via nodemailer to localhost:2587');
    console.log('\n💡 For production, enable auth and use standard ports (25/587)');
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Stopping SMTP server...');
      await server.stop();
      console.log('👋 Server stopped gracefully');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping SMTP server...');
      await server.stop();
      console.log('👋 Server stopped gracefully');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = startServer;