import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { logger } from '../config/logger';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest, generateJWT, generateRefreshToken, hashPassword, verifyPassword } from '../middleware/auth';
import { generateVerificationToken } from '../utils/crypto';
import { validateEmailAddress } from '../utils/email';
import { Env } from '../utils/env';
import { InternalEmailService } from '../services/InternalEmailService';
import { DEFAULT_USER_PERMISSIONS, permissionsToJson } from '../constants/permissions';

// Secure cookie configuration
const getCookieOptions = () => ({
  httpOnly: true, // Prevent XSS attacks
  secure: Env.isProduction, // HTTPS only in production
  sameSite: 'lax' as const, // Allow same-site requests for SPAs
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/'
});

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: Env.isProduction,
  sameSite: 'lax' as const, // Allow same-site requests for SPAs
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/'
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, password } = req.body;
  const email = normalizeEmail(req.body.email);
  const dbClient = String((db as any)?.client?.config?.client || '').toLowerCase();
  const isPostgres = dbClient === 'pg' || dbClient === 'postgres' || dbClient === 'postgresql';

  logger.info('Registration attempt started', { 
    email, 
    name: name?.substring(0, 20) + '...', // Log partial name for debugging
    passwordLength: password?.length,
    requestIP: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 100)
  });

  // Check if user already exists
  const existingUser = await db('users').whereRaw('LOWER(email) = ?', [email]).first();
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

  // Generate verification token with 24h expiration
  const verificationToken = generateVerificationToken();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  logger.info('Generated verification token for new user', {
    email,
    tokenLength: verificationToken.length,
    tokenPreview: verificationToken.substring(0, 8) + '...',
    expiresAt: verificationExpires.toISOString()
  });

  // Create user
  logger.info('Creating user in database', { email, name });
  let insertResult;
  let userId;
  
  try {
    const insertQuery = db('users').insert({
      name,
      email,
      password_hash: passwordHash,
      verification_token: verificationToken,
      verification_token_expires: verificationExpires,
      is_verified: false,
      permissions: permissionsToJson(DEFAULT_USER_PERMISSIONS),
      created_at: new Date(),
      updated_at: new Date()
    });

    insertResult = isPostgres
      ? await insertQuery.returning('id')
      : await insertQuery;

    const firstInsertResult = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    userId = typeof firstInsertResult === 'object' && firstInsertResult !== null
      ? firstInsertResult.id
      : firstInsertResult;

    if (!userId) {
      throw new Error(`Unable to determine inserted user id from database response: ${JSON.stringify(insertResult)}`);
    }

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
    savedTokenLength: savedUser.verification_token?.length,
    savedTokenPreview: savedUser.verification_token?.substring(0, 8) + '...',
    tokenMatchesGenerated: savedUser.verification_token === verificationToken
  });

  // Send verification email (async, don't block response)
  setImmediate(async () => {
    try {
      const internalEmailService = new InternalEmailService();
      await internalEmailService.sendVerificationEmail(email, name, verificationToken);
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
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  // Find user
  const user = await db('users').whereRaw('LOWER(email) = ?', [email]).first();
  if (!user) {
    throw createError('Invalid credentials', 401);
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, user.password_hash);
  if (!isValidPassword) {
    throw createError('Invalid credentials', 401);
  }

  if (!user.is_verified && user.email_verified_at) {
    await db('users').where('id', user.id).update({
      is_verified: true,
      updated_at: new Date()
    });
    user.is_verified = true;
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
    .where('verification_token', token)
    .first();
  
  if (!user) {
    logger.warn('Token not found', { 
      tokenPreview: token.substring(0, 8) + '...' 
    });
    throw createError('Token inválido ou expirado', 400);
  }

  // NOVA VALIDAÇÃO: Verificar se o token expirou
  const now = new Date();
  const tokenExpires = user.verification_token_expires;
  
  if (tokenExpires && now > new Date(tokenExpires)) {
    logger.warn('Token expired', { 
      tokenPreview: token.substring(0, 8) + '...',
      expiresAt: tokenExpires,
      currentTime: now,
      userId: user.id,
      email: user.email
    });
    
    // Limpar token expirado da base de dados
    await db('users').where('id', user.id).update({
      verification_token: null,
      verification_token_expires: null,
      updated_at: new Date()
    });
    
    throw createError('Token de verificação expirado. Solicite um novo email de verificação.', 400);
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

  const verifiedAt = new Date();

  // Keep verification independent so audit logging cannot roll it back.
  await db('users').where('id', user.id).update({
    is_verified: true,
    verification_token: null,
    verification_token_expires: null,
    email_verified_at: verifiedAt,
    updated_at: verifiedAt
  });

  try {
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'email_verified',
      resource_type: 'user',
      resource_id: user.id,
      details: JSON.stringify({ email: user.email }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: verifiedAt,
      updated_at: verifiedAt
    });
  } catch (auditError) {
    logger.warn('Could not insert audit log after email verification', {
      userId: user.id,
      auditError: auditError instanceof Error ? auditError.message : auditError
    });
  }

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
  const email = normalizeEmail(req.body.email);

  const user = await db('users').whereRaw('LOWER(email) = ?', [email]).first();
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
    reset_password_token: resetToken,
    reset_password_expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    updated_at: new Date()
  });

  // Send password reset email (async, don't block response)
  setImmediate(async () => {
    try {
      const internalEmailService = new InternalEmailService();
      const resetUrl = `${process.env['FRONTEND_URL'] || 'https://ultrazend.com.br'}/reset-password?token=${resetToken}`;
      await internalEmailService.sendPasswordResetEmail(email, user.name, resetUrl);
      logger.info('Reset password email sent successfully', { email });
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
    .where('reset_password_token', token)
    .where('reset_password_expires', '>', new Date())
    .first();

  if (!user) {
    throw createError('Invalid or expired reset token', 400);
  }

  // Hash new password
  const passwordHash = await hashPassword(password);

  // Update user password and clear reset token
  await db('users').where('id', user.id).update({
    password_hash: passwordHash,
    reset_password_token: null,
    reset_password_expires: null,
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
    sameSite: 'lax',
    path: '/'
  });
  
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: Env.isProduction,
    sameSite: 'lax',
    path: '/'
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
      sameSite: 'lax',
      path: '/'
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
  const user = await db('users').select('password_hash').where('id', userId).first();
  if (!user) {
    throw createError('User not found', 404);
  }

  // Verify current password
  const isValidPassword = await verifyPassword(current_password, user.password_hash);
  if (!isValidPassword) {
    throw createError('Current password is incorrect', 400);
  }

  // Hash new password
  const newPasswordHash = await hashPassword(new_password);

  // Update password
  await db('users').where('id', userId).update({
    password_hash: newPasswordHash,
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
    .select('id', 'email', 'verification_token', 'is_verified', 'created_at')
    .where('is_verified', false)
    .limit(10);

  const debugInfo = {
    totalUnverifiedUsers: unverifiedUsers.length,
    users: unverifiedUsers.map(user => ({
      id: user.id,
      email: user.email,
      tokenPreview: user.verification_token ? user.verification_token.substring(0, 8) + '...' : null,
      tokenLength: user.verification_token?.length,
      isVerified: user.is_verified,
      created: user.created_at
    }))
  };

  logger.info('Debug tokens endpoint called', debugInfo);

  res.json(debugInfo);
});

export const resendVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);

  logger.info('Verification email resend requested', { email });

  // Find user by email
  const user = await db('users').whereRaw('LOWER(email) = ?', [email]).first();
  if (!user) {
    logger.info('Verification email resend attempted for non-existent user', { email });
    return res.status(404).json({
      message: 'Este email não está cadastrado em nosso sistema. Faça seu cadastro primeiro para criar uma conta.',
      action: 'register'
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
        message: 'Esta conta já está verificada. Você pode fazer login normalmente.',
        action: 'login'
      });
    }
  }

  // Generate new verification token with 24h expiration
  const verificationToken = generateVerificationToken();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  logger.info('Generated new verification token for resend', {
    userId: user.id,
    email,
    tokenLength: verificationToken.length,
    tokenPreview: verificationToken.substring(0, 8) + '...',
    oldTokenPreview: user.verification_token ? user.verification_token.substring(0, 8) + '...' : 'null',
    newExpiresAt: verificationExpires.toISOString()
  });

  // Update user with new verification token and expiration
  await db('users').where('id', user.id).update({
    verification_token: verificationToken,
    verification_token_expires: verificationExpires,
    updated_at: new Date()
  });

  // Verify the token was saved correctly
  const updatedUser = await db('users').where('id', user.id).first();
  logger.info('Token saved to database', {
    userId: user.id,
    savedTokenLength: updatedUser.verification_token?.length,
    savedTokenPreview: updatedUser.verification_token?.substring(0, 8) + '...',
    tokenMatchesGenerated: updatedUser.verification_token === verificationToken
  });

  // Send verification email (async, don't block response)
  setImmediate(async () => {
    try {
      const internalEmailService = new InternalEmailService();
      await internalEmailService.sendVerificationEmail(email, user.name, verificationToken);
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
