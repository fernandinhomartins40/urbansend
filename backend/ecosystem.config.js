module.exports = {
  apps: [
    {
      name: 'ultrazend-api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      log_file: './logs/ultrazend-api.log',
      out_file: './logs/ultrazend-api-out.log',
      error_file: './logs/ultrazend-api-error.log',
      time: true,
      merge_logs: true,
      kill_timeout: 5000,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'ultrazend-email-worker',
      script: 'dist/workers/emailWorker.js',
      instances: 2,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        WORKER_TYPE: 'email'
      },
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'email'
      },
      log_file: './logs/ultrazend-email-worker.log',
      out_file: './logs/ultrazend-email-worker-out.log',
      error_file: './logs/ultrazend-email-worker-error.log',
      time: true,
      merge_logs: true,
      kill_timeout: 10000,
      restart_delay: 5000,
      max_restarts: 5,
      min_uptime: '30s',
      cron_restart: '0 4 * * *' // Restart diário às 4h
    },
    {
      name: 'ultrazend-queue-processor',
      script: 'dist/workers/queueProcessor.js', 
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        WORKER_TYPE: 'queue'
      },
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'queue'
      },
      log_file: './logs/ultrazend-queue-processor.log',
      out_file: './logs/ultrazend-queue-processor-out.log',
      error_file: './logs/ultrazend-queue-processor-error.log',
      time: true,
      merge_logs: true,
      kill_timeout: 15000,
      restart_delay: 5000,
      max_restarts: 3,
      min_uptime: '60s',
      cron_restart: '0 2 * * *' // Restart diário às 2h
    }
  ],

  deploy: {
    production: {
      user: 'root',
      host: '31.97.162.155',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/ultrazend.git',
      path: '/var/www/ultrazend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};

// Configuração específica para diferentes ambientes
const envConfig = {
  development: {
    instances: 1,
    max_memory_restart: '512M',
    log_level: 'debug'
  },
  
  staging: {
    instances: 1,
    max_memory_restart: '1G',
    log_level: 'info'
  },
  
  production: {
    instances: 'max', // Usar todos os CPUs disponíveis para API
    max_memory_restart: '2G',
    log_level: 'warn',
    error_file: '/var/log/ultrazend/error.log',
    out_file: '/var/log/ultrazend/out.log',
    log_file: '/var/log/ultrazend/combined.log'
  }
};

// Aplicar configuração baseada no ambiente
const currentEnv = process.env.NODE_ENV || 'development';
if (envConfig[currentEnv]) {
  module.exports.apps.forEach(app => {
    Object.assign(app, envConfig[currentEnv]);
  });
}

// Configurações específicas por processo
if (currentEnv === 'production') {
  // API: Multiple instances
  module.exports.apps[0].instances = 2;
  module.exports.apps[0].max_memory_restart = '2G';
  
  // Email Worker: Mais instâncias para alta demanda
  module.exports.apps[1].instances = 4;
  module.exports.apps[1].max_memory_restart = '1G';
  
  // Queue Processor: Instância única mais robusta
  module.exports.apps[2].instances = 1;
  module.exports.apps[2].max_memory_restart = '512M';
}