import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { Env } from '../utils/env';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UrbanSend API',
      version: '1.0.0',
      description: 'API completa para plataforma de email transacional - Clone do Resend.com',
      contact: {
        name: 'UrbanSend Team',
        email: 'support@urbansend.com'
      }
    },
    servers: [
      {
        url: Env.get('API_BASE_URL', 'http://localhost:3000'),
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            is_verified: { type: 'boolean' },
            plan_type: { type: 'string', enum: ['free', 'pro', 'business'] }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            key_name: { type: 'string' },
            permissions: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            last_used_at: { type: 'string', format: 'date-time' },
            is_active: { type: 'boolean' }
          }
        },
        Email: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            from_email: { type: 'string', format: 'email' },
            to_email: { type: 'string', format: 'email' },
            subject: { type: 'string' },
            html_content: { type: 'string' },
            text_content: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'sent', 'delivered', 'bounced', 'failed'] },
            sent_at: { type: 'string', format: 'date-time' },
            delivered_at: { type: 'string', format: 'date-time' },
            opened_at: { type: 'string', format: 'date-time' },
            clicked_at: { type: 'string', format: 'date-time' }
          }
        },
        Template: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            template_name: { type: 'string' },
            subject: { type: 'string' },
            html_content: { type: 'string' },
            text_content: { type: 'string' },
            variables: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Domain: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            domain_name: { type: 'string' },
            verification_status: { type: 'string', enum: ['pending', 'verified', 'failed'] },
            dns_records: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            verified_at: { type: 'string', format: 'date-time' }
          }
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            url: { type: 'string', format: 'url' },
            events: { type: 'string' },
            secret: { type: 'string' },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    },
    security: [
      { bearerAuth: [] },
      { apiKeyAuth: [] }
    ]
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};

const specs = swaggerJSDoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'UrbanSend API Documentation'
  }));
};