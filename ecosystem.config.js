module.exports = {
  apps: [{
    name: 'urbansend',
    cwd: '/var/www/urbansend/backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      HTTPS_PORT: 443,
      DATABASE_URL: '/var/www/urbansend/data/database.sqlite'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HTTPS_PORT: 443
    },
    
    // Log configuration with rotation
    log_file: '/var/www/urbansend/logs/app.log',
    out_file: '/var/www/urbansend/logs/out.log',
    error_file: '/var/www/urbansend/logs/error.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Log rotation settings
    max_log_size: '10M',
    retain_log: 5, // Keep 5 rotated log files
    
    // Process management
    kill_timeout: 3000,
    listen_timeout: 3000,
    
    // Auto restart on crashes
    max_restarts: 3,
    restart_delay: 4000,
    
    // Monitoring
    min_uptime: '10s',
    max_unstable_restarts: 5
  }],

  // PM2 Deploy configuration
  deploy: {
    production: {
      user: 'root',
      host: '31.97.162.155',
      ref: 'origin/main',
      repo: 'https://github.com/fernandinhomartins40/urbansend.git',
      path: '/var/www/urbansend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /var/www/urbansend/logs /var/www/urbansend/data'
    }
  }
};