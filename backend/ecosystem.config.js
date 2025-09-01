module.exports = {
  apps: [
    {
      // Production Configuration
      name: 'urbansend-prod',
      script: 'dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // Performance & Memory Management
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process Management
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      
      // Health Monitoring
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // Advanced Options
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      
      // Environment Variables Override
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'warn',
        ENABLE_SWAGGER: false,
        BCRYPT_SALT_ROUNDS: 12
      }
    },
    
    {
      // Staging Configuration
      name: 'urbansend-staging',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'staging',
        PORT: 3002
      },
      
      // Performance & Memory Management
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=512',
      
      // Logging
      log_file: './logs/staging-combined.log',
      out_file: './logs/staging-out.log',
      error_file: './logs/staging-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process Management
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '5s',
      restart_delay: 3000,
      
      // Environment Variables Override
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3002,
        LOG_LEVEL: 'info',
        ENABLE_SWAGGER: true,
        BCRYPT_SALT_ROUNDS: 10
      }
    },

    {
      // Development Configuration
      name: 'urbansend-dev',
      script: 'src/server.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      
      // Development specific settings
      watch: true,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'dist',
        'logs',
        '*.log',
        '.git',
        '.env*',
        'database.sqlite*'
      ],
      
      // Logging for development
      log_file: './logs/dev-combined.log',
      out_file: './logs/dev-out.log',
      error_file: './logs/dev-error.log',
      
      // Process Management
      autorestart: true,
      max_restarts: 3,
      min_uptime: '3s',
      restart_delay: 1000,
      
      // Environment Variables Override
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug',
        ENABLE_SWAGGER: true,
        BCRYPT_SALT_ROUNDS: 10
      }
    }
  ],

  // Deployment Configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-production-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/urbansend.git',
      path: '/var/www/urbansend',
      'post-deploy': 'npm ci --only=production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y',
      'post-setup': 'npm install pm2 -g'
    },
    
    staging: {
      user: 'deploy',
      host: ['your-staging-server.com'],
      ref: 'origin/staging',
      repo: 'git@github.com:yourusername/urbansend.git', 
      path: '/var/www/urbansend-staging',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': 'apt update && apt install git -y'
    }
  }
};