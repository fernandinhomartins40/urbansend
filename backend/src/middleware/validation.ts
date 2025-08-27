import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import validator from 'validator';

export const validateRequest = (schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Common validation schemas
export const emailSchema = z.string().email().min(5).max(255);
export const passwordSchema = z.string().min(8).max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number');

export const paginationSchema = z.object({
  page: z.string().optional().default('1').transform(val => parseInt(val, 10)),
  limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val, 10), 100)),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc')
});

export const idParamSchema = z.object({
  id: z.string().transform(val => parseInt(val, 10))
});

// Email validation schemas
export const sendEmailSchema = z.object({
  from: emailSchema,
  to: z.union([emailSchema, z.array(emailSchema).max(100)]),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  template_id: z.number().optional(),
  variables: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  reply_to: emailSchema.optional(),
  cc: z.union([emailSchema, z.array(emailSchema)]).optional(),
  bcc: z.union([emailSchema, z.array(emailSchema)]).optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string(),
    encoding: z.string().optional()
  })).optional()
}).refine(data => data.html || data.text || data.template_id, {
  message: "Either 'html', 'text', or 'template_id' must be provided"
});

// Template validation schemas
export const createTemplateSchema = z.object({
  template_name: z.string().min(1).max(100),
  subject: z.string().min(1).max(255),
  html_content: z.string().optional(),
  text_content: z.string().optional(),
  variables: z.array(z.string()).optional()
}).refine(data => data.html_content || data.text_content, {
  message: "Either 'html_content' or 'text_content' must be provided"
});

// Domain validation schemas
export const addDomainSchema = z.object({
  domain_name: z.string().refine(val => validator.isFQDN(val), {
    message: "Invalid domain name format"
  })
});

// API Key validation schemas
export const createApiKeySchema = z.object({
  key_name: z.string().min(1).max(100),
  permissions: z.array(z.enum([
    'email:send',
    'email:read',
    'template:read',
    'template:write',
    'domain:read',
    'analytics:read',
    'webhook:read',
    'webhook:write'
  ])).min(1)
});

// Webhook validation schemas
export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum([
    'email.sent',
    'email.delivered',
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.failed'
  ])).min(1),
  secret: z.string().optional()
});

// Auth validation schemas
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: emailSchema,
  password: passwordSchema
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1)
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1)
});

// Custom validation functions
export const isValidEmail = (email: string): boolean => {
  return validator.isEmail(email);
};

export const isValidDomain = (domain: string): boolean => {
  return validator.isFQDN(domain);
};

export const sanitizeHtml = (html: string): string => {
  // Basic HTML sanitization - in production, use a proper library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};