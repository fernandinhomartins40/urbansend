import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import validator from 'validator';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

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

// Enhanced validation schemas with security improvements
export const emailSchema = z.string()
  .email('Email deve ter formato válido')
  .min(5, 'Email deve ter pelo menos 5 caracteres')
  .max(255, 'Email deve ter no máximo 255 caracteres')
  .refine(email => validator.isEmail(email), 'Email inválido')
  .transform(email => validator.normalizeEmail(email) || email);

export const passwordSchema = z.string()
  .min(12, 'Senha deve ter pelo menos 12 caracteres')
  .max(128, 'Senha deve ter no máximo 128 caracteres')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 
    'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial')
  .refine(password => !validator.contains(password, 'password'), 
    'Senha não pode conter a palavra "password"')
  .refine(password => !validator.contains(password, '123456'), 
    'Senha não pode conter sequências numéricas óbvias');

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
  to: z.union([emailSchema, z.array(emailSchema).max(50, 'Máximo de 50 destinatários por envio')]),
  subject: z.string()
    .min(1, 'Assunto é obrigatório')
    .max(255, 'Assunto deve ter no máximo 255 caracteres')
    .refine(subject => !validator.contains(subject.toLowerCase(), 'spam'), 'Assunto contém palavras proibidas')
    .refine(subject => !validator.contains(subject.toLowerCase(), 'free money'), 'Assunto contém palavras proibidas'),
  html: z.string()
    .max(1024 * 1024, 'Conteúdo HTML deve ter no máximo 1MB')
    .transform(html => html ? sanitizeHtml(html) : html)
    .optional(),
  text: z.string()
    .max(1024 * 1024, 'Conteúdo texto deve ter no máximo 1MB')
    .optional(),
  template_id: z.number().int().positive().optional(),
  variables: z.record(z.string().max(1000)).optional(),
  tags: z.array(z.string().max(50)).max(10, 'Máximo de 10 tags por email').optional(),
  reply_to: emailSchema.optional(),
  cc: z.union([emailSchema, z.array(emailSchema).max(10)]).optional(),
  bcc: z.union([emailSchema, z.array(emailSchema).max(10)]).optional(),
  attachments: z.array(z.object({
    filename: z.string()
      .min(1)
      .max(100)
      .refine(name => !/[<>:"/\\|?*]/.test(name), 'Nome de arquivo inválido'),
    content: z.string().max(10 * 1024 * 1024, 'Arquivo deve ter no máximo 10MB'),
    contentType: z.string().refine(type => 
      ['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/msword'].includes(type), 
      'Tipo de arquivo não permitido'
    ),
    encoding: z.string().optional()
  })).max(5, 'Máximo de 5 anexos por email').optional()
}).refine(data => data.html || data.text || data.template_id, {
  message: "Conteúdo do email é obrigatório: 'html', 'text', ou 'template_id'"
});

// Template validation schemas
export const createTemplateSchema = z.object({
  template_name: z.string()
    .min(1, 'Nome do template é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .refine(name => /^[a-zA-Z0-9\s\-_]+$/.test(name), 'Nome contém caracteres inválidos'),
  subject: z.string()
    .min(1, 'Assunto é obrigatório')
    .max(255, 'Assunto deve ter no máximo 255 caracteres'),
  html_content: z.string()
    .max(1024 * 1024, 'Conteúdo HTML deve ter no máximo 1MB')
    .transform(html => html ? sanitizeHtml(html) : html)
    .optional(),
  text_content: z.string()
    .max(1024 * 1024, 'Conteúdo texto deve ter no máximo 1MB')
    .optional(),
  variables: z.array(z.string().max(50)).max(20, 'Máximo de 20 variáveis').optional()
}).refine(data => data.html_content || data.text_content, {
  message: "Either 'html_content' or 'text_content' must be provided"
});

// Domain validation schemas
export const addDomainSchema = z.object({
  domain_name: z.string()
    .min(4, 'Domínio deve ter pelo menos 4 caracteres')
    .max(253, 'Domínio deve ter no máximo 253 caracteres')
    .refine(val => validator.isFQDN(val), 'Formato de domínio inválido')
    .refine(val => !val.includes('..'), 'Domínio não pode conter pontos consecutivos')
    .transform(val => val.toLowerCase())
});

// API Key validation schemas
export const createApiKeySchema = z.object({
  key_name: z.string()
    .min(1, 'Nome da chave é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .refine(name => /^[a-zA-Z0-9\s\-_]+$/.test(name), 'Nome contém caracteres inválidos'),
  permissions: z.array(z.enum([
    'email:send',
    'email:read',
    'template:read',
    'template:write',
    'domain:read',
    'analytics:read',
    'webhook:read',
    'webhook:write'
  ])).min(1, 'Pelo menos uma permissão é obrigatória').max(8, 'Máximo de 8 permissões')
});

// Webhook validation schemas
export const createWebhookSchema = z.object({
  url: z.string()
    .url('URL inválida')
    .refine(url => url.startsWith('https://'), 'Webhook deve usar HTTPS')
    .refine(url => !validator.isIP(new URL(url).hostname), 'URLs com IP não são permitidas'),
  events: z.array(z.enum([
    'email.sent',
    'email.delivered',
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.failed'
  ])).min(1, 'Pelo menos um evento é obrigatório'),
  secret: z.string()
    .min(16, 'Secret deve ter pelo menos 16 caracteres')
    .max(64, 'Secret deve ter no máximo 64 caracteres')
    .optional()
});

// Auth validation schemas
export const registerSchema = z.object({
  name: z.string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .refine(name => /^[a-zA-ZÀ-ÿ\s]+$/.test(name), 'Nome deve conter apenas letras e espaços')
    .transform(name => name.trim()),
  email: emailSchema,
  password: passwordSchema
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Senha é obrigatória')
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

// Initialize DOMPurify with JSDOM for server-side usage
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

/**
 * Robust HTML sanitization using DOMPurify
 * Removes all potentially dangerous elements and attributes
 */
export const sanitizeHtml = (html: string): string => {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return purify.sanitize(html, {
    // Allow only safe HTML elements
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'blockquote', 'pre', 'code',
      'a', 'img'
    ],
    // Allow only safe attributes
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src', 'width', 'height',
      'style', 'class', 'id', 'target'
    ],
    // Remove all protocols except safe ones
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Additional security options
    KEEP_CONTENT: false, // Remove content of forbidden tags
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'], // Block event handlers
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    // Remove data attributes that could be used for XSS
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
  });
};

/**
 * Extra strict sanitization for email templates
 * Removes even more elements that could be problematic in email context
 */
export const sanitizeEmailHtml = (html: string): string => {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'a', 'img'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src', 'width', 'height', 'style'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: false,
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false
  });
};