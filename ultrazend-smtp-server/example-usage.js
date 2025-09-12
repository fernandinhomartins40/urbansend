/**
 * @ultrazend/smtp-server - Exemplo Completo de Uso
 * Demonstra como usar o servidor SMTP completo
 */

const { SMTPServer } = require('./dist/index.js');
const nodemailer = require('nodemailer');

async function exemploCompleto() {
  console.log('🚀 UltraZend SMTP Server - Exemplo Completo\n');

  // 1. Criar e configurar servidor SMTP
  const server = new SMTPServer({
    hostname: 'mail.exemplo.com',
    mxPort: 2525,        // Porta não privilegiada para teste
    submissionPort: 2587, // Porta não privilegiada para teste
    databasePath: './exemplo-smtp.sqlite',
    authRequired: true,
    logLevel: 'info'
  });

  try {
    // 2. Iniciar servidor
    console.log('📡 Iniciando servidor SMTP...');
    await server.start();
    console.log('✅ Servidor SMTP iniciado!');

    // 3. Configurar usuário para autenticação
    console.log('👤 Criando usuário SMTP...');
    const userId = await server.createUser(
      'admin@exemplo.com',
      'senha123',
      'Administrador'
    );
    console.log(`✅ Usuário criado com ID: ${userId}`);

    // 4. Adicionar domínio
    console.log('🌐 Adicionando domínio...');
    const domainId = await server.addDomain('exemplo.com', userId);
    console.log(`✅ Domínio adicionado com ID: ${domainId}`);

    // 5. Configurar DKIM
    console.log('🔐 Configurando DKIM...');
    const dnsRecord = await server.setupDKIM('exemplo.com');
    console.log('✅ DKIM configurado!');

    // 6. Aguardar um momento para servidor estar pronto
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 7. Testar envio de email via nosso próprio servidor
    console.log('📧 Testando envio de email...');
    
    // Configurar nodemailer para usar NOSSO servidor SMTP
    const transporter = nodemailer.createTransporter({
      host: 'localhost',
      port: 2587, // Nossa porta de submission
      secure: false,
      auth: {
        user: 'admin@exemplo.com',
        pass: 'senha123'
      },
      // Aceitar certificados auto-assinados para teste
      tls: {
        rejectUnauthorized: false
      }
    });

    // Testar conectividade
    await transporter.verify();
    console.log('✅ Conexão SMTP verificada!');

    // Enviar email de teste
    const emailResult = await transporter.sendMail({
      from: 'noreply@exemplo.com',
      to: 'teste@gmail.com', // Vai tentar entregar diretamente no Gmail!
      subject: 'Email de teste do meu servidor SMTP próprio!',
      html: `
        <h1>🎉 Sucesso!</h1>
        <p>Este email foi enviado pelo meu próprio servidor SMTP!</p>
        <ul>
          <li>✅ Servidor próprio rodando</li>
          <li>✅ Autenticação funcionando</li>
          <li>✅ DKIM configurado</li>
          <li>✅ Entrega direta via MX records</li>
        </ul>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><small>Powered by UltraZend SMTP Server</small></p>
      `,
      text: 'Email de teste do meu servidor SMTP próprio!'
    });

    console.log('✅ Email enviado!', {
      messageId: emailResult.messageId,
      accepted: emailResult.accepted,
      rejected: emailResult.rejected
    });

    // 8. Verificar estatísticas
    console.log('\n📊 Obtendo estatísticas...');
    const stats = await server.getStats();
    console.log('📈 Estatísticas do servidor:', {
      totalEmails: stats.totalEmails,
      conexoesRecentes: stats.recentConnections,
      tentativasAuth: stats.authAttempts,
      dominiosAtivos: stats.activeDomains,
      uptime: `${Math.floor(stats.uptime / 60)} minutos`
    });

    // 9. Verificar status
    const status = server.getStatus();
    console.log('🟢 Status do servidor:', {
      rodando: status.isRunning,
      configuracao: {
        hostname: status.config.hostname,
        portaMX: status.config.mxPort,
        portaSubmission: status.config.submissionPort
      }
    });

    // 10. Listar emails processados
    console.log('\n📋 Emails processados:');
    const db = server.getDatabase();
    const emails = await db('emails')
      .select('message_id', 'from_email', 'to_email', 'status', 'sent_at')
      .orderBy('sent_at', 'desc')
      .limit(5);

    emails.forEach((email, index) => {
      console.log(`   ${index + 1}. ${email.status.toUpperCase()} - ${email.from_email} → ${email.to_email}`);
      console.log(`      ID: ${email.message_id}`);
      console.log(`      Data: ${email.sent_at}`);
    });

    // 11. Mostrar informações de configuração DNS
    console.log('\n🌐 Configuração DNS necessária:');
    console.log('   1. Registro MX:');
    console.log(`      exemplo.com.  IN  MX  10  mail.exemplo.com.`);
    console.log('\n   2. Registro A:');
    console.log(`      mail.exemplo.com.  IN  A  ${getLocalIP()}`);
    console.log('\n   3. Registro SPF:');
    console.log(`      exemplo.com.  IN  TXT  "v=spf1 mx ~all"`);
    console.log('\n   4. Registro DKIM:');
    console.log(`      default._domainkey.exemplo.com.  IN  TXT  "${dnsRecord.substring(0, 50)}..."`);

    console.log('\n🎯 Próximos passos:');
    console.log('   1. Configure os registros DNS acima');
    console.log('   2. Use portas padrão (25, 587) em produção');
    console.log('   3. Configure TLS/SSL com certificados válidos');
    console.log('   4. Ajuste configurações de segurança conforme necessário');
    console.log('   5. Monitore logs e estatísticas regularmente');

    // Manter servidor rodando por um tempo para testes
    console.log('\n⏰ Servidor ficará rodando por 2 minutos para testes...');
    console.log('💡 Teste enviando emails via localhost:2587');
    console.log('🛑 Pressione Ctrl+C para parar');

    // Aguardar ou manter rodando
    await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutos

  } catch (error) {
    console.error('❌ Erro no exemplo:', error.message);
    console.error(error.stack);
  } finally {
    // 12. Parar servidor
    console.log('\n🛑 Parando servidor...');
    await server.stop();
    console.log('👋 Servidor parado. Exemplo finalizado!');
  }
}

// Função helper para obter IP local
function getLocalIP() {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  
  for (const interfaceName in networkInterfaces) {
    const addresses = networkInterfaces[interfaceName];
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  
  return '192.168.1.100'; // Fallback
}

// Executar se chamado diretamente
if (require.main === module) {
  exemploCompleto().catch(console.error);
}

module.exports = exemploCompleto;