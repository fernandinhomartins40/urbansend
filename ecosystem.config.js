// 🚀 ULTRAZEND - Configuração PM2 Enterprise (Sem Gambiarras)
// ✅ Configuração profissional alinhada com 47 migrations centralizadas

module.exports = {
  apps: [
    {
      name: 'ultrazend-api',
      script: 'dist/index.js',
      cwd: '/var/www/ultrazend/backend',
      instances: 1,
      exec_mode: 'fork',
      
      // ✅ Environment alinhado com aplicação corrigida
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '0.0.0.0',
        
        // ✅ Database path relativo (alinhado com aplicação)
        DATABASE_URL: './ultrazend.sqlite',
        
        // ✅ SMTP configuração alinhada com .env.development
        SMTP_HOSTNAME: 'mail.ultrazend.com.br',
        SMTP_MX_PORT: 2525,
        SMTP_SUBMISSION_PORT: 587,
        SMTP_ENABLED: 'false',
        ENABLE_SMTP_HEALTH_CHECK: 'false',
        
        // ✅ URLs e configurações
        FRONTEND_URL: 'https://www.ultrazend.com.br',
        API_BASE_URL: 'https://www.ultrazend.com.br/api',
        BACKEND_URL: 'https://www.ultrazend.com.br',
        
        // ✅ Redis opcional (como desenvolvimento)
        REDIS_URL: 'redis://127.0.0.1:6379',
        REDIS_ENABLED: 'false',
        
        // ✅ Logs estruturados
        LOG_LEVEL: 'info',
        LOG_FILE_PATH: '/var/www/ultrazend/logs',
        
        // ✅ DKIM configuração
        DKIM_ENABLED: 'true',
        DKIM_PRIVATE_KEY_PATH: './configs/dkim-keys/ultrazend.com.br-default-private.pem',
        DKIM_SELECTOR: 'default',
        DKIM_DOMAIN: 'ultrazend.com.br'
      },
      
      // ✅ Logging robusto
      error_file: '/var/www/ultrazend/logs/pm2-error.log',
      out_file: '/var/www/ultrazend/logs/pm2-out.log',
      log_file: '/var/www/ultrazend/logs/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // ✅ Validações robustas
      max_memory_restart: '512M',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 15000,
      
      // ✅ Health check compatível com aplicação corrigida
      health_check_path: '/api/health',
      health_check_grace_period: 3000,
      
      // ✅ Configurações otimizadas
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      merge_logs: true,
      combine_logs: true,
      
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log',
        '.git'
      ],
      
      node_args: [
        '--max-old-space-size=512',
        '--optimize-for-size'
      ]
    }
    
    // ✅ REMOVIDO: Workers temporariamente desabilitados
    // Apenas ultrazend-api principal para deploy determinístico
    // Workers serão reativados após validação completa
  ],

  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'root',
      host: '31.97.162.155',
      ref: 'origin/main',
      repo: 'https://github.com/fernandinhomartins40/urbansend.git',
      path: '/var/www/ultrazend',
      'post-deploy': 'cd backend && npm ci --only=production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /var/www/ultrazend/logs'
    }
  }
};