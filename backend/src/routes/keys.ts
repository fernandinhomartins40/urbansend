import { Router } from 'express';
import { validateRequest, idParamSchema, createApiKeySchema } from '../middleware/validation';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { apiKeyRateLimit } from '../middleware/rateLimiting';
import {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  regenerateApiKey,
  toggleApiKey,
  getApiKeyUsage
} from '../controllers/keysController';
import { z } from 'zod';
import { API_KEY_GRANTABLE_PERMISSIONS } from '../constants/permissions';

const router = Router();

// All routes require JWT authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/keys:
 *   get:
 *     summary: Get all API keys for the authenticated user
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 api_keys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *                 total:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/', requirePermission('api_key:read'), getApiKeys);

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key_name
 *               - permissions
 *             properties:
 *               key_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum:
 *                     - email:send
 *                     - email:read
 *                     - template:read
 *                     - template:write
 *                     - domain:read
 *                     - analytics:read
 *                     - webhook:read
 *                     - webhook:write
 *     responses:
 *       201:
 *         description: API key created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: API key name already exists
 */
router.post('/', requirePermission('api_key:write'), validateRequest({ body: createApiKeySchema }), createApiKey);

/**
 * @swagger
 * /api/keys/{id}:
 *   put:
 *     summary: Update an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: API key updated successfully
 *       404:
 *         description: API key not found
 *       409:
 *         description: API key name already exists
 */
router.put('/:id', validateRequest({ 
  params: idParamSchema,
  body: z.object({
    key_name: z.string().min(1).max(100).optional(),
    description: z.string().max(300).optional(),
    key_type: z.enum(['standard', 'ai_agent']).optional(),
    permissions: z.array(z.enum(API_KEY_GRANTABLE_PERMISSIONS)).min(1).optional()
  })
}), requirePermission('api_key:write'), updateApiKey);

/**
 * @swagger
 * /api/keys/{id}:
 *   delete:
 *     summary: Delete an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key deleted successfully
 *       404:
 *         description: API key not found
 */
router.delete('/:id', requirePermission('api_key:write'), validateRequest({ params: idParamSchema }), deleteApiKey);

/**
 * @swagger
 * /api/keys/{id}/regenerate:
 *   post:
 *     summary: Regenerate an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key regenerated successfully
 *       404:
 *         description: API key not found
 */
router.post('/:id/regenerate', requirePermission('api_key:write'), validateRequest({ params: idParamSchema }), regenerateApiKey);

/**
 * @swagger
 * /api/keys/{id}/toggle:
 *   post:
 *     summary: Toggle API key active status
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key status toggled successfully
 *       404:
 *         description: API key not found
 */
router.post('/:id/toggle', requirePermission('api_key:write'), validateRequest({ params: idParamSchema }), toggleApiKey);

/**
 * @swagger
 * /api/keys/{id}/usage:
 *   get:
 *     summary: Get API key usage statistics
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 api_key:
 *                   type: object
 *                 usage_stats:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     total_emails:
 *                       type: integer
 *                     sent_emails:
 *                       type: integer
 *                     delivered_emails:
 *                       type: integer
 *                     bounced_emails:
 *                       type: integer
 *                     failed_emails:
 *                       type: integer
 *                     daily_usage:
 *                       type: array
 *       404:
 *         description: API key not found
 */
router.get('/:id/usage', requirePermission('api_key:read'), validateRequest({ params: idParamSchema }), getApiKeyUsage);

export default router;
