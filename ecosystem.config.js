// 🚀 ULTRAZEND - Configuração PM2 para Produção
// Configuração otimizada para VPS dedicada

module.exports = {
  apps: [{
    name: 'ultrazend-backend',
    script: 'backend/dist/index.js',
    cwd: '/var/www/ultrazend',
    
    // Process Management
    instances: 1,
    exec_mode: 'fork',
    
    // Environment Variables
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0',
      REDIS_URL: 'redis://127.0.0.1:6379'
    },
    
    // Logging Configuration
    error_file: '/var/www/ultrazend/logs/pm2-error.log',
    out_file: '/var/www/ultrazend/logs/pm2-out.log',
    log_file: '/var/www/ultrazend/logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Memory and Performance
    max_memory_restart: '512M',
    node_args: [
      '--max-old-space-size=512',
      '--optimize-for-size'
    ],
    
    // Process Control
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 15000,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Auto Restart Configuration  
    autorestart: true,
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      '*.log',
      '.git'
    ],
    
    // Health Monitoring
    health_check_path: '/health',
    health_check_grace_period: 3000,
    
    // Advanced Options
    merge_logs: true,
    combine_logs: true,
    
    // Environment-specific overrides
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      DATABASE_URL: '/var/www/ultrazend/backend/ultrazend.sqlite',
      REDIS_URL: 'redis://127.0.0.1:6379',
      
      // SMTP Configuration - ARQUITETURA DUAL ALINHADA
      SMTP_HOST: '127.0.0.1',            // Postfix local
      SMTP_PORT: 25,                     // Postfix MX (externo)
      SMTP_MX_PORT: 2525,               // SMTPServer interno (não conflita)
      SMTP_SUBMISSION_PORT: 587,        // SMTPServer submission (autenticado)
      SMTP_HOSTNAME: 'mail.ultrazend.com.br',
      
      FRONTEND_URL: 'https://www.ultrazend.com.br',
      API_BASE_URL: 'https://www.ultrazend.com.br/api'
    }
  }],

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