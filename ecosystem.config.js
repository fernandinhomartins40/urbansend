// Load environment variables from .env file
require('dotenv').config({ path: '/var/www/ultrazend/backend/.env' });

module.exports = {
  apps: [{
    name: 'ultrazend',
    cwd: '/var/www/ultrazend/backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Explicit env file loading
    env_file: '/var/www/ultrazend/backend/.env',
    
    // Unified restart configuration
    restart_delay: 3000,
    kill_timeout: 10000,
    listen_timeout: 10000,
    max_restarts: 3,
    min_uptime: '30s',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      HTTPS_PORT: 443,
      HOST: '0.0.0.0',
      DATABASE_URL: '/var/www/ultrazend/data/database.sqlite',
      FRONTEND_URL: 'https://www.ultrazend.com.br',
      API_BASE_URL: 'https://www.ultrazend.com.br',
      ALLOWED_ORIGINS: 'https://ultrazend.com.br,https://www.ultrazend.com.br',
      TRUST_PROXY: 1,
      LOG_LEVEL: 'info',
      LOG_FILE_PATH: '/var/www/ultrazend/logs/app.log',
      LOG_MAX_SIZE: '20m',
      LOG_MAX_FILES: 14,
      RATE_LIMIT_MAX_REQUESTS: 100,
      BCRYPT_SALT_ROUNDS: 12,
      ENABLE_SWAGGER: false,
      ENABLE_METRICS: true,
      ENABLE_HEALTH_CHECKS: true,
      ENABLE_DETAILED_HEALTH_CHECKS: true,
      ENABLE_SECURITY_HEADERS: true,
      ENABLE_REQUEST_LOGGING: true,
      ENABLE_PERFORMANCE_MONITORING: true,
      ENABLE_CORRELATION_IDS: true,
      HEALTH_CHECK_TIMEOUT: 5000,
      HSTS_MAX_AGE: 31536000,
      CSP_REPORT_ONLY: false,
      // Version info - updated automatically by CI/CD
      APP_VERSION: '1.0.0',
      BUILD_NUMBER: '1',
      COMMIT_SHA: 'unknown',
      BUILD_DATE: new Date().toISOString(),
      // Cache busting
      CACHE_BUST: Date.now().toString()
    },
    
    // Staging environment
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3001,
      HTTPS_PORT: 443,
      ENABLE_SWAGGER: true,
      LOG_LEVEL: 'debug',
      CACHE_BUST: Date.now().toString()
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HTTPS_PORT: 443,
      ENABLE_SWAGGER: false,
      LOG_LEVEL: 'warn'
    },
    
    // Log configuration with rotation
    log_file: '/var/www/ultrazend/logs/app.log',
    out_file: '/var/www/ultrazend/logs/out.log',
    error_file: '/var/www/ultrazend/logs/error.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Log rotation settings
    max_log_size: '10M',
    retain_log: 5, // Keep 5 rotated log files
    
    // Process management (consistent with restart settings above)
    // kill_timeout and listen_timeout already defined above
    
    // Monitoring and stability
    max_unstable_restarts: 3
  }],

  // PM2 Deploy configuration
  deploy: {
    production: {
      user: 'root',
      host: '31.97.162.155',
      ref: 'origin/main',
      repo: 'https://github.com/fernandinhomartins40/ultrazend.git',
      path: '/var/www/ultrazend',
      'pre-deploy-local': '',
      'post-deploy': 'cd backend && npm ci --only=production && npm run build && pm2 reload ecosystem.config.js --env production && sleep 10 && curl -f http://localhost:3001/health || exit 1',
      'pre-setup': 'mkdir -p /var/www/ultrazend/logs /var/www/ultrazend/data'
    }
  }
};