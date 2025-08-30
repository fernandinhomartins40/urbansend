module.exports = {
  apps: [{
    name: 'urbansend',
    cwd: '/var/www/urbansend/backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DATABASE_URL: '/var/www/urbansend/data/database.sqlite'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    log_file: '/var/www/urbansend/logs/app.log',
    out_file: '/var/www/urbansend/logs/out.log',
    error_file: '/var/www/urbansend/logs/error.log',
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
      repo: 'git@github.com:your-username/urbansend.git',
      path: '/var/www/urbansend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};