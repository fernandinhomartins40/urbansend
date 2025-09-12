import { Router, Request, Response } from 'express';
import { validateRequest } from '../middleware/validation';
import { authenticateJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { Env } from '../utils/env';
import db from '../config/database';
import { 
  advancedLoginRateLimit, 
  advancedRegistrationRateLimit, 
  advancedPasswordResetRateLimit,
  advancedVerificationRateLimit 
} from '../middleware/advancedRateLimiting';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resetPasswordSchema,
  emailSchema
} from '../middleware/validation';
import {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  resendVerificationEmail
} from '../controllers/authController';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 128
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post('/register', advancedRegistrationRateLimit, validateRequest({ body: registerSchema }), register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 */
router.post('/login', advancedLoginRateLimit, validateRequest({ body: loginSchema }), login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', logout);

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid token
 */
router.post('/verify-email', validateRequest({ body: verifyEmailSchema }), verifyEmail);

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email resent (or security message)
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/resend-verification', 
  advancedVerificationRateLimit, // 🆕 Rate limiting avançado Fase 3
  validateRequest({ body: z.object({ email: emailSchema }) }), 
  resendVerificationEmail
);

// Debug endpoint - only available in development
if (!Env.isProduction) {
  router.get('/debug/verification-tokens', asyncHandler(async (req: Request, res: Response) => {
    const users = await db('users')
      .select('id', 'email', 'verification_token', 'is_verified', 'created_at')
      .whereNotNull('verification_token')
      .orderBy('created_at', 'desc')
      .limit(10);
    
    res.json({
      message: 'Debug: Recent verification tokens (development only)',
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        token: user.verification_token,
        isVerified: user.is_verified,
        createdAt: user.created_at,
        verifyUrl: `${process.env['FRONTEND_URL'] || 'https://www.ultrazend.com.br'}/verify-email?token=${user.verification_token}`
      }))
    });
  }));
}

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 */
router.post('/forgot-password', advancedPasswordResetRateLimit, validateRequest({ 
  body: z.object({ email: emailSchema }) 
}), forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid token
 */
router.post('/reset-password', validateRequest({ body: resetPasswordSchema }), resetPassword);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly cookie
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', refreshToken);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', authenticateJWT, getProfile);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put('/profile', authenticateJWT, validateRequest({
  body: z.object({ name: z.string().min(2).max(100) })
}), updateProfile);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 *       401:
 *         description: Unauthorized
 */
router.post('/change-password', authenticateJWT, validateRequest({
  body: z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8).max(128)
  })
}), changePassword);

export default router;