exports.up = function(knex) {
  return knex('emails').insert([
    {
      user_id: 2, // Using test user ID
      from_email: 'noreply@urbansend.com',
      to_email: 'teste1@exemplo.com',
      subject: 'Bem-vindo ao UrbanSend!',
      html_content: '<h1>Bem-vindo!</h1><p>Obrigado por se cadastrar.</p>',
      text_content: 'Bem-vindo! Obrigado por se cadastrar.',
      status: 'delivered',
      sent_at: knex.fn.now(),
      delivered_at: knex.fn.now(),
      created_at: knex.raw("datetime('now', '-2 hours')")
    },
    {
      user_id: 2,
      from_email: 'marketing@urbansend.com',
      to_email: 'teste2@exemplo.com',
      subject: 'Newsletter Semanal',
      html_content: '<h2>Newsletter</h2><p>Confira as novidades desta semana.</p>',
      text_content: 'Newsletter - Confira as novidades desta semana.',
      status: 'delivered',
      sent_at: knex.fn.now(),
      delivered_at: knex.fn.now(),
      opened_at: knex.fn.now(),
      created_at: knex.raw("datetime('now', '-5 hours')")
    },
    {
      user_id: 2,
      from_email: 'vendas@urbansend.com',
      to_email: 'teste3@exemplo.com',
      subject: 'Oferta Especial',
      html_content: '<h2>Oferta Especial!</h2><p>50% de desconto só hoje!</p><a href="#">Clique aqui</a>',
      text_content: 'Oferta Especial! 50% de desconto só hoje!',
      status: 'delivered',
      sent_at: knex.fn.now(),
      delivered_at: knex.fn.now(),
      opened_at: knex.fn.now(),
      clicked_at: knex.fn.now(),
      created_at: knex.raw("datetime('now', '-8 hours')")
    },
    {
      user_id: 2,
      from_email: 'suporte@urbansend.com',
      to_email: 'teste4@exemplo.com',
      subject: 'Confirmação de Pedido',
      html_content: '<h2>Pedido Confirmado</h2><p>Seu pedido foi processado com sucesso.</p>',
      text_content: 'Pedido Confirmado - Seu pedido foi processado com sucesso.',
      status: 'delivered',
      sent_at: knex.fn.now(),
      delivered_at: knex.fn.now(),
      created_at: knex.raw("datetime('now', '-12 hours')")
    },
    {
      user_id: 2,
      from_email: 'info@urbansend.com',
      to_email: 'invalid@exemplo.com',
      subject: 'Informações Importantes',
      html_content: '<h2>Informações</h2><p>Algumas informações importantes para você.</p>',
      text_content: 'Informações - Algumas informações importantes para você.',
      status: 'bounced',
      sent_at: knex.fn.now(),
      bounce_reason: 'Invalid email address',
      created_at: knex.raw("datetime('now', '-1 day')")
    },
    {
      user_id: 2,
      from_email: 'admin@urbansend.com',
      to_email: 'teste5@exemplo.com',
      subject: 'Atualização do Sistema',
      html_content: '<h2>Sistema Atualizado</h2><p>Novos recursos disponíveis!</p>',
      text_content: 'Sistema Atualizado - Novos recursos disponíveis!',
      status: 'delivered',
      sent_at: knex.fn.now(),
      delivered_at: knex.fn.now(),
      opened_at: knex.fn.now(),
      created_at: knex.raw("datetime('now', '-1 day')")
    }
  ]);
};

exports.down = function(knex) {
  return knex('emails').where('user_id', 2).del();
};