/**
 * @ultrazend/smtp-internal - Exemplo de Uso
 * Demonstração completa do módulo
 */

const UltraZendSMTP = require('./dist/index.js').default;

async function exemploCompleto() {
  console.log('🚀 Iniciando exemplo do @ultrazend/smtp-internal');

  // 1. Configurar o módulo
  const emailService = new UltraZendSMTP({
    smtp: {
      host: 'localhost',
      port: 2525, // Porta de teste (use mailhog ou similar)
      secure: false,
      // user: 'seu-email@gmail.com',
      // password: 'sua-senha'
    },
    database: './exemplo-emails.sqlite',
    defaultFrom: 'noreply@exemplo.com',
    appName: 'Minha App de Exemplo',
    appUrl: 'https://exemplo.com',
    logger: {
      enabled: true,
      level: 'info'
    }
  });

  try {
    // 2. Inicializar (executa migrations)
    console.log('📦 Inicializando módulo...');
    await emailService.initialize();
    console.log('✅ Módulo inicializado com sucesso!');

    // 3. Testar conexão SMTP
    console.log('🔗 Testando conexão SMTP...');
    const connectionOk = await emailService.testConnection();
    console.log(connectionOk ? '✅ SMTP funcionando!' : '❌ SMTP com problemas');

    // 4. Enviar email de verificação
    console.log('📧 Enviando email de verificação...');
    const verificationResult = await emailService.sendVerificationEmail(
      'usuario@exemplo.com',
      'João da Silva',
      'token-verificacao-123456'
    );
    
    if (verificationResult.success) {
      console.log('✅ Email de verificação enviado!', verificationResult.messageId);
    } else {
      console.log('❌ Erro ao enviar verificação:', verificationResult.error);
    }

    // 5. Enviar email de reset de senha
    console.log('🔐 Enviando email de reset de senha...');
    const resetResult = await emailService.sendPasswordResetEmail(
      'usuario@exemplo.com',
      'João da Silva',
      'https://exemplo.com/reset-senha?token=reset-123456'
    );

    if (resetResult.success) {
      console.log('✅ Email de reset enviado!', resetResult.messageId);
    } else {
      console.log('❌ Erro ao enviar reset:', resetResult.error);
    }

    // 6. Enviar notificação do sistema
    console.log('🔔 Enviando notificação do sistema...');
    const notificationResult = await emailService.sendSystemNotification(
      'usuario@exemplo.com',
      {
        type: 'welcome',
        title: 'Bem-vindo à nossa plataforma!',
        message: 'Sua conta foi criada com sucesso. Agora você pode aproveitar todos os recursos da nossa plataforma.',
        actionUrl: 'https://exemplo.com/dashboard',
        actionText: 'Acessar Dashboard'
      }
    );

    if (notificationResult.success) {
      console.log('✅ Notificação enviada!', notificationResult.messageId);
    } else {
      console.log('❌ Erro ao enviar notificação:', notificationResult.error);
    }

    // 7. Consultar histórico de emails
    console.log('📊 Consultando histórico de emails...');
    const db = emailService.getDatabase();
    
    const emailsEnviados = await db('emails')
      .where('status', 'sent')
      .orderBy('sent_at', 'desc')
      .limit(5);

    console.log(`📈 Últimos ${emailsEnviados.length} emails enviados:`);
    emailsEnviados.forEach((email, index) => {
      console.log(`  ${index + 1}. ${email.email_type} para ${email.to_email} - ${email.sent_at}`);
    });

    // 8. Estatísticas
    const stats = await db('emails')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(CASE WHEN status = "sent" THEN 1 END) as enviados'),
        db.raw('COUNT(CASE WHEN status = "failed" THEN 1 END) as falharam')
      )
      .first();

    console.log('📊 Estatísticas:');
    console.log(`  Total: ${stats.total}`);
    console.log(`  Enviados: ${stats.enviados}`);
    console.log(`  Falharam: ${stats.falharam}`);

    // 9. Obter configuração atual
    const config = emailService.getConfig();
    console.log('⚙️ Configuração atual:');
    console.log(`  App: ${config.appName}`);
    console.log(`  From: ${config.defaultFrom}`);
    console.log(`  SMTP: ${config.smtp?.host}:${config.smtp?.port}`);

  } catch (error) {
    console.error('💥 Erro no exemplo:', error.message);
  } finally {
    // 10. Limpar recursos
    console.log('🧹 Fechando conexões...');
    await emailService.close();
    console.log('👋 Exemplo finalizado!');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  exemploCompleto().catch(console.error);
}

module.exports = exemploCompleto;