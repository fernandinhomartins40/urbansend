declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: 'development' | 'production' | 'test';
      PORT?: string;
      
      // Database
      DB_HOST?: string;
      DB_PORT?: string;
      DB_USER?: string;
      DB_PASSWORD?: string;
      DB_NAME?: string;
      DATABASE_URL?: string;
      
      // Redis
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      REDIS_PASSWORD?: string;
      REDIS_DB?: string;
      
      // JWT
      JWT_SECRET?: string;
      JWT_EXPIRES_IN?: string;
      JWT_REFRESH_EXPIRES_IN?: string;
      
      // Email Service
      SMTP_HOST?: string;
      SMTP_PORT?: string;
      SMTP_SECURE?: string;
      SMTP_USER?: string;
      SMTP_PASS?: string;
      EMAIL_FROM?: string;
      EMAIL_FROM_NAME?: string;
      
      // AWS SES
      AWS_REGION?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      
      // Security
      BCRYPT_SALT_ROUNDS?: string;
      RATE_LIMIT_WINDOW_MS?: string;
      RATE_LIMIT_MAX_REQUESTS?: string;
      
      // CORS
      CORS_ORIGIN?: string;
      
      // API
      API_BASE_URL?: string;
      
      // Logging
      LOG_LEVEL?: string;
      LOG_FILE_PATH?: string;
      
      // Other
      FRONTEND_URL?: string;
      MAX_FILE_SIZE?: string;
    }
  }
}

export {};