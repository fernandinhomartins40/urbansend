/**
 * Migration: Populate local_domains table
 * Adds comprehensive list of email providers for relay functionality
 * CORREÇÃO: Fix "550 Not a local domain" SMTP error
 */

exports.up = async function(knex) {
  console.log('📧 Populating local_domains table with comprehensive provider list...');
  
  const domains = [
    // === DOMÍNIO PRINCIPAL ===
    {
      domain: 'ultrazend.com.br',
      is_active: true,
      accept_all: false,
      description: 'Domínio principal do UltraZend'
    },

    // === 🌍 PROVEDORES GLOBAIS POPULARES ===
    {
      domain: 'gmail.com',
      is_active: true,
      accept_all: true,
      description: 'Gmail (Google) - Global'
    },
    {
      domain: 'outlook.com',
      is_active: true,
      accept_all: true,
      description: 'Outlook (Microsoft) - Global'
    },
    {
      domain: 'hotmail.com',
      is_active: true,
      accept_all: true,
      description: 'Hotmail (Microsoft) - Global'
    },
    {
      domain: 'live.com',
      is_active: true,
      accept_all: true,
      description: 'Live Mail (Microsoft) - Global'
    },
    {
      domain: 'msn.com',
      is_active: true,
      accept_all: true,
      description: 'MSN Mail (Microsoft) - Global'
    },
    {
      domain: 'yahoo.com',
      is_active: true,
      accept_all: true,
      description: 'Yahoo Mail - Global'
    },
    {
      domain: 'icloud.com',
      is_active: true,
      accept_all: true,
      description: 'iCloud Mail (Apple) - Global'
    },
    {
      domain: 'me.com',
      is_active: true,
      accept_all: true,
      description: 'Me.com (Apple) - Global'
    },
    {
      domain: 'mac.com',
      is_active: true,
      accept_all: true,
      description: 'Mac.com (Apple) - Global'
    },
    {
      domain: 'aol.com',
      is_active: true,
      accept_all: true,
      description: 'AOL Mail - Global'
    },

    // === 🇧🇷 PROVEDORES BRASILEIROS ===
    {
      domain: 'uol.com.br',
      is_active: true,
      accept_all: true,
      description: 'UOL - Brasil'
    },
    {
      domain: 'bol.com.br',
      is_active: true,
      accept_all: true,
      description: 'BOL - Brasil'
    },
    {
      domain: 'terra.com.br',
      is_active: true,
      accept_all: true,
      description: 'Terra - Brasil'
    },
    {
      domain: 'ig.com.br',
      is_active: true,
      accept_all: true,
      description: 'iG Mail - Brasil'
    },
    {
      domain: 'globo.com',
      is_active: true,
      accept_all: true,
      description: 'Globo Mail - Brasil'
    },
    {
      domain: 'r7.com',
      is_active: true,
      accept_all: true,
      description: 'R7 Mail - Brasil'
    },
    {
      domain: 'zipmail.com.br',
      is_active: true,
      accept_all: true,
      description: 'Zipmail - Brasil'
    },

    // === 🔒 PROVEDORES FOCADOS EM PRIVACIDADE ===
    {
      domain: 'protonmail.com',
      is_active: true,
      accept_all: true,
      description: 'ProtonMail - Privacidade'
    },
    {
      domain: 'tutanota.com',
      is_active: true,
      accept_all: true,
      description: 'Tutanota - Privacidade'
    },
    {
      domain: 'startmail.com',
      is_active: true,
      accept_all: true,
      description: 'StartMail - Privacidade'
    },
    {
      domain: 'mailfence.com',
      is_active: true,
      accept_all: true,
      description: 'Mailfence - Privacidade'
    },

    // === 💼 SERVIÇOS EMPRESARIAIS ===
    {
      domain: 'zoho.com',
      is_active: true,
      accept_all: true,
      description: 'Zoho Mail - Empresarial'
    },
    {
      domain: 'fastmail.com',
      is_active: true,
      accept_all: true,
      description: 'FastMail - Empresarial'
    },

    // === 🌐 OUTROS PROVEDORES POPULARES ===
    {
      domain: 'mail.com',
      is_active: true,
      accept_all: true,
      description: 'Mail.com - Internacional'
    },
    {
      domain: 'gmx.com',
      is_active: true,
      accept_all: true,
      description: 'GMX Mail - Internacional'
    },
    {
      domain: 'yandex.com',
      is_active: true,
      accept_all: true,
      description: 'Yandex Mail - Rússia'
    },
    {
      domain: 'yandex.ru',
      is_active: true,
      accept_all: true,
      description: 'Yandex.ru - Rússia'
    },
    {
      domain: 'web.de',
      is_active: true,
      accept_all: true,
      description: 'Web.de - Alemanha'
    },
    {
      domain: 'orange.fr',
      is_active: true,
      accept_all: true,
      description: 'Orange Mail - França'
    },
    {
      domain: 'free.fr',
      is_active: true,
      accept_all: true,
      description: 'Free Mail - França'
    },
    {
      domain: 'laposte.net',
      is_active: true,
      accept_all: true,
      description: 'La Poste - França'
    },
    {
      domain: 'qq.com',
      is_active: true,
      accept_all: true,
      description: 'QQ Mail - China'
    },
    {
      domain: '163.com',
      is_active: true,
      accept_all: true,
      description: 'NetEase 163 - China'
    },
    {
      domain: '126.com',
      is_active: true,
      accept_all: true,
      description: 'NetEase 126 - China'
    },
    {
      domain: 'naver.com',
      is_active: true,
      accept_all: true,
      description: 'Naver Mail - Coreia do Sul'
    },
    {
      domain: 'daum.net',
      is_active: true,
      accept_all: true,
      description: 'Daum Mail - Coreia do Sul'
    },
    {
      domain: 'rediffmail.com',
      is_active: true,
      accept_all: true,
      description: 'Rediffmail - Índia'
    }
  ];

  for (const domainData of domains) {
    await knex('local_domains')
      .insert(domainData)
      .onConflict('domain')
      .ignore();
    
    console.log(`✅ Domain configured: ${domainData.domain} (${domainData.accept_all ? 'relay' : 'local'})`);
  }

  console.log('✅ local_domains populated successfully');
};

exports.down = async function(knex) {
  console.log('🗑️ Removing all populated domains...');
  
  const domainsToRemove = [
    // Principal
    'ultrazend.com.br',
    
    // Globais populares
    'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
    
    // Brasileiros
    'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 
    'globo.com', 'r7.com', 'zipmail.com.br',
    
    // Privacidade
    'protonmail.com', 'tutanota.com', 'startmail.com', 'mailfence.com',
    
    // Empresariais
    'zoho.com', 'fastmail.com',
    
    // Internacionais
    'mail.com', 'gmx.com', 'yandex.com', 'yandex.ru', 'web.de',
    'orange.fr', 'free.fr', 'laposte.net', 'qq.com', '163.com', '126.com',
    'naver.com', 'daum.net', 'rediffmail.com'
  ];

  await knex('local_domains')
    .whereIn('domain', domainsToRemove)
    .del();
    
  console.log(`✅ ${domainsToRemove.length} domains removed`);
};