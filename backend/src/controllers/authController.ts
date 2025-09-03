import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { logger } from '../config/logger';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest, generateJWT, generateRefreshToken, hashPassword, verifyPassword } from '../middleware/auth';
import { generateVerificationToken } from '../utils/crypto';
import { validateEmailAddress } from '../utils/email';
import { Env } from '../utils/env';

// Secure cookie configuration
const getCookieOptions = () => ({
  httpOnly: true, // Prevent XSS attacks
  secure: Env.isProduction, // HTTPS only in production
  sameSite: 'strict' as const, // Prevent CSRF attacks
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/'
});

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: Env.isProduction,
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/api/auth/refresh'
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  logger.info('Registration attempt started', { 
    email, 
    name: name?.substring(0, 20) + '...', // Log partial name for debugging
    passwordLength: password?.length,
    requestIP: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 100)
  });

  // Check if user already exists
  const existingUser = await db('users').where('email', email).first();
  if (existingUser) {
    logger.warn('Registration attempt with existing email', { email, requestIP: req.ip });
    throw createError('User with this email already exists', 409);
  }

  // Validate email address
  logger.info('Validating email address', { email });
  const emailValidation = await validateEmailAddress(email);
  if (!emailValidation.isValid) {
    logger.warn('Email validation failed', { email, reason: emailValidation.reason });
    throw createError(`Invalid email: ${emailValidation.reason}`, 400);
  }
  logger.info('Email validation passed', { email, reason: emailValidation.reason });

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate verification token
  const verificationToken = generateVerificationToken();

  logger.info('Generated verification token for new user', {
    email,
    tokenLength: verificationToken.length,
    tokenPreview: verificationToken.substring(0, 8) + '...'
  });

  // Create user
  logger.info('Creating user in database', { email, name });
  let insertResult;
  let userId;
  
  try {
    insertResult = await db('users').insert({
      name,
      email,
      password: passwordHash,
      email_verification_token: verificationToken,
      is_verified: false,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    // SQLite returns the last inserted row ID
    userId = insertResult[0];
    logger.info('User created successfully in database', { userId, email });
  } catch (dbError) {
    logger.error('Database error during user creation', { 
      error: dbError, 
      email, 
      name,
      errorMessage: (dbError as Error).message 
    });
    throw createError('Database error during user creation', 500);
  }

  // Verify the token was saved correctly
  const savedUser = await db('users').where('id', userId).first();
  logger.info('New user created with verification token', {
    userId,
    email,
    savedTokenLength: savedUser.email_verification_token?.length,
    savedTokenPreview: savedUser.email_verification_token?.substring(0, 8) + '...',
    tokenMatchesGenerated: savedUser.email_verification_token === verificationToken
  });

  // Send verification email (async, don't block response)
  setImmediate(async () => {
    try {
      const { EmailServiceFactory } = await import('../services/EmailServiceFactory');
      // const emailService = EmailServiceFactory.getService(TYPES.EmailService); // Temporarily disabled
    const { EmailService } = await import('../services/emailService');
    const emailService = new EmailService();
      await emailService.sendVerificationEmail(email, name, verificationToken);
      logger.info('Verification email sent successfully', { 
        email,
        userId,
        tokenUsedInEmail: verificationToken.substring(0, 8) + '...'
      });
    } catch (error) {
      logger.error('Failed to send verification email', { error, email, userId });
    }
  });

  logger.info('User registered successfully', { userId, email });

  res.status(201).json({
    message: 'User registered successfully. Please check your email for verification.',
    user: {
      id: userId,
      name,
      email,
      is_verified: false
    }
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Find user
  const user = await db('users').where('email', email).first();
  if (!user) {
    throw createError('Invalid credentials', 401);
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    throw createError('Invalid credentials', 401);
  }

  // Check if email is verified
  if (!user.is_verified) {
    throw createError('Please verify your email before logging in', 403);
  }

  // Generate tokens
  const accessToken = generateJWT({ userId: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

  // Update last login
  await db('users').where('id', user.id).update({ updated_at: new Date() });

  // Set secure HTTP-only cookies instead of returning tokens in body
  res.cookie('access_token', accessToken, getCookieOptions());
  res.cookie('refresh_token', refreshToken, getRefreshCookieOptions());

  logger.info('User logged in successfully', { userId: user.id, email });

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      is_verified: user.is_verified
    }
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  
  // Validação rigorosa do token
  if (!token || typeof token !== 'string' || token.length !== 64) {
    logger.warn('Invalid token format received', { 
      token: token ? 'present' : 'missing', 
      type: typeof token,
      length: token?.length 
    });
    throw createError('Token de verificação inválido', 400);
  }

  // Verificar se é hexadecimal válido SEM normalização
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    logger.warn('Token format validation failed', { 
      tokenPreview: token.substring(0, 8) + '...',
      pattern: 'Expected 64 hex characters'
    });
    throw createError('Formato de token inválido', 400);
  }

  // Buscar usuário SEM qualquer normalização do token
  const user = await db('users')
    .where('email_verification_token', token)
    .first();
  
  if (!user) {
    logger.warn('Token not found or expired', { 
      tokenPreview: token.substring(0, 8) + '...' 
    });
    throw createError('Token inválido ou expirado', 400);
  }

  // Verificação de segurança adicional
  if (user.is_verified) {
    logger.info('User already verified', { userId: user.id, email: user.email });
    return res.json({
      message: 'Email já verificado. Você pode fazer login.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_verified: true
      }
    });
  }

  // Tabela audit_logs criada via migration 010_create_audit_logs.js

  // Transação para verificação com auditoria
  await db.transaction(async (trx) => {
    await trx('users').where('id', user.id).update({
      is_verified: true,
      email_verification_token: null,
      email_verified_at: new Date(),
      updated_at: new Date()
    });

    // Log de auditoria
    try {
      await trx('audit_logs').insert({
        user_id: user.id,
        action: 'email_verified',
        details: JSON.stringify({ email: user.email }),
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        timestamp: new Date()
      });
    } catch (auditError) {
      // Log de auditoria falhou - não impedir a verificação
      logger.warn('Could not insert audit log', { auditError: auditError instanceof Error ? auditError.message : auditError });
    }
  });

  logger.info('Email verified successfully', { 
    userId: user.id, 
    email: user.email 
  });

  res.json({
    message: 'Email verificado com sucesso! Você já pode fazer login.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      is_verified: true
    }
  });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await db('users').where('email', email).first();
  if (!user) {
    // Don't reveal if user exists or not
    return res.json({
      message: 'If an account with that email exists, we have sent a password reset link.'
    });
  }

  // Generate reset token
  const resetToken = generateVerificationToken();

  // Store reset token in database with expiration
  await db('users').where('id', user.id).update({
    password_reset_token: resetToken,
    password_reset_expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    updated_at: new Date()
  });

  // Send password reset email (async, don't block response)
  setImmediate(async () => {
    try {
      // TODO: Implement actual email sending
      logger.info('Reset password email would be sent', { email, resetToken });
    } catch (error) {
      logger.error('Failed to send reset password email', { error, email });
    }
  });

  logger.info('Password reset requested', { email });

  return res.json({
    message: 'If an account with that email exists, we have sent a password reset link.'
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  // Verify token and find user
  const user = await db('users')
    .where('password_reset_token', token)
    .where('password_reset_expires', '>', new Date())
    .first();

  if (!user) {
    throw createError('Invalid or expired reset token', 400);
  }

  // Hash new password
  const passwordHash = await hashPassword(password);

  // Update user password and clear reset token
  await db('users').where('id', user.id).update({
    password: passwordHash,
    password_reset_token: null,
    password_reset_expires: null,
    updated_at: new Date()
  });

  logger.info('Password reset successfully');

  res.json({
    message: 'Password reset successfully. You can now login with your new password.'
  });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Clear authentication cookies
  res.clearCookie('access_token', {
    httpOnly: true,
    secure: Env.isProduction,
    sameSite: 'strict',
    path: '/'
  });
  
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: Env.isProduction,
    sameSite: 'strict',
    path: '/api/auth/refresh'
  });

  res.json({
    message: 'Logged out successfully'
  });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refresh_token;
  
  if (!refreshToken) {
    throw createError('Refresh token not provided', 401);
  }

  try {
    const decoded = jwt.verify(refreshToken, Env.jwtRefreshSecret) as any;
    
    // Find user
    const user = await db('users')
      .select('id', 'email', 'name', 'is_verified')
      .where('id', decoded.userId)
      .first();

    if (!user) {
      throw createError('Invalid refresh token - user not found', 401);
    }

    if (!user.is_verified) {
      throw createError('Email verification required', 403);
    }

    // Generate new access token
    const newAccessToken = generateJWT({ userId: user.id, email: user.email });
    
    // Set new access token cookie
    res.cookie('access_token', newAccessToken, getCookieOptions());

    res.json({
      message: 'Token refreshed successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_verified: user.is_verified
      }
    });
  } catch (error) {
    // Clear invalid refresh token
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: Env.isProduction,
      sameSite: 'strict',
      path: '/api/auth/refresh'
    });
    
    throw createError('Invalid refresh token', 401);
  }
});

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await db('users')
    .select('id', 'name', 'email', 'is_verified', 'created_at', 'updated_at')
    .where('id', req.user!.id)
    .first();

  if (!user) {
    throw createError('User not found', 404);
  }

  res.json({
    user
  });
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  const userId = req.user!.id;

  await db('users').where('id', userId).update({
    name,
    updated_at: new Date()
  });

  const updatedUser = await db('users')
    .select('id', 'name', 'email', 'is_verified', 'created_at', 'updated_at')
    .where('id', userId)
    .first();

  logger.info('Profile updated successfully', { userId });

  res.json({
    message: 'Profile updated successfully',
    user: updatedUser
  });
});

export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { current_password, new_password } = req.body;
  const userId = req.user!.id;

  // Get current password hash
  const user = await db('users').select('password').where('id', userId).first();
  if (!user) {
    throw createError('User not found', 404);
  }

  // Verify current password
  const isValidPassword = await verifyPassword(current_password, user.password);
  if (!isValidPassword) {
    throw createError('Current password is incorrect', 400);
  }

  // Hash new password
  const newPasswordHash = await hashPassword(new_password);

  // Update password
  await db('users').where('id', userId).update({
    password: newPasswordHash,
    updated_at: new Date()
  });

  logger.info('Password changed successfully', { userId });

  res.json({
    message: 'Password changed successfully'
  });
});

export const debugVerificationTokens = asyncHandler(async (req: Request, res: Response) => {
  // This is a temporary debug endpoint - remove in production
  if (process.env.NODE_ENV === 'production') {
    throw createError('Debug endpoint not available in production', 404);
  }

  const unverifiedUsers = await db('users')
    .select('id', 'email', 'email_verification_token', 'is_verified', 'created_at')
    .where('is_verified', false)
    .limit(10);

  const debugInfo = {
    totalUnverifiedUsers: unverifiedUsers.length,
    users: unverifiedUsers.map(user => ({
      id: user.id,
      email: user.email,
      tokenPreview: user.email_verification_token ? user.email_verification_token.substring(0, 8) + '...' : null,
      tokenLength: user.email_verification_token?.length,
      isVerified: user.is_verified,
      created: user.created_at
    }))
  };

  logger.info('Debug tokens endpoint called', debugInfo);

  res.json(debugInfo);
});

export const resendVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  logger.info('Verification email resend requested', { email });

  // Find user by email
  const user = await db('users').where('email', email).first();
  if (!user) {
    // Don't reveal if user exists or not for security
    return res.json({
      message: 'Se uma conta com este email existir e não estiver verificada, um novo email de verificação foi enviado.'
    });
  }

  // Check if user is already verified
  if (user.is_verified) {
    logger.info('Verification email resend attempted for already verified user', { userId: user.id, email });
    // In development, allow resend for testing purposes
    if (Env.isDevelopment) {
      logger.info('Development mode: allowing resend for verified user', { userId: user.id, email });
    } else {
      return res.json({
        message: 'Esta conta já está verificada. Você pode fazer login normalmente.'
      });
    }
  }

  // Generate new verification token
  const verificationToken = generateVerificationToken();

  logger.info('Generated new verification token for resend', {
    userId: user.id,
    email,
    tokenLength: verificationToken.length,
    tokenPreview: verificationToken.substring(0, 8) + '...',
    oldTokenPreview: user.email_verification_token ? user.email_verification_token.substring(0, 8) + '...' : 'null'
  });

  // Update user with new verification token
  await db('users').where('id', user.id).update({
    email_verification_token: verificationToken,
    updated_at: new Date()
  });

  // Verify the token was saved correctly
  const updatedUser = await db('users').where('id', user.id).first();
  logger.info('Token saved to database', {
    userId: user.id,
    savedTokenLength: updatedUser.email_verification_token?.length,
    savedTokenPreview: updatedUser.email_verification_token?.substring(0, 8) + '...',
    tokenMatchesGenerated: updatedUser.email_verification_token === verificationToken
  });

  // Send verification email (async, don't block response)
  setImmediate(async () => {
    try {
      const { EmailServiceFactory } = await import('../services/EmailServiceFactory');
      // const emailService = EmailServiceFactory.getService(TYPES.EmailService); // Temporarily disabled
    const { EmailService } = await import('../services/emailService');
    const emailService = new EmailService();
      await emailService.sendVerificationEmail(email, user.name, verificationToken);
      logger.info('Verification email resent successfully', { 
        userId: user.id, 
        email,
        tokenUsedInEmail: verificationToken.substring(0, 8) + '...'
      });
    } catch (error) {
      logger.error('Failed to resend verification email', { error, email, userId: user.id });
    }
  });

  logger.info('Verification email resend processed', { userId: user.id, email });

  res.json({
    message: 'Um novo email de verificação foi enviado. Verifique sua caixa de entrada e pasta de spam.'
  });
});