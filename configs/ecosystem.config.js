module.exports = {
  apps: [{
    name: 'ultrazend',
    cwd: '/var/www/ultrazend/backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DATABASE_URL: '/var/www/ultrazend/data/database.sqlite'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    log_file: '/var/www/ultrazend/logs/app.log',
    out_file: '/var/www/ultrazend/logs/out.log',
    error_file: '/var/www/ultrazend/logs/error.log',
    time: true,
    
    // Process management
    kill_timeout: 3000,
    listen_timeout: 3000,
    
    // Auto restart on crashes
    max_restarts: 3,
    restart_delay: 4000
  }],

  deploy: {
    production: {
      user: 'root',
      host: '31.97.162.155',
      ref: 'origin/main',
      repo: 'https://github.com/fernandinhomartins40/ultrazend.git',
      path: '/var/www/ultrazend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};