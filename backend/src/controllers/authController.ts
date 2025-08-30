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

  // Check if user already exists
  const existingUser = await db('users').where('email', email).first();
  if (existingUser) {
    throw createError('User with this email already exists', 409);
  }

  // Validate email address
  const emailValidation = await validateEmailAddress(email);
  if (!emailValidation.isValid) {
    throw createError(`Invalid email: ${emailValidation.reason}`, 400);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate verification token
  const verificationToken = generateVerificationToken();

  // Create user
  const insertResult = await db('users').insert({
    name,
    email,
    password_hash: passwordHash,
    verification_token: verificationToken,
    is_verified: false,
    plan_type: 'free',
    created_at: new Date(),
    updated_at: new Date()
  });
  
  // SQLite returns the last inserted row ID
  const userId = insertResult[0];

  // Send verification email (async, don't block response)
  setImmediate(async () => {
    try {
      const emailService = (await import('../services/emailService')).default;
      await emailService.sendVerificationEmail(email, name, verificationToken);
      logger.info('Verification email sent successfully', { email });
    } catch (error) {
      logger.error('Failed to send verification email', { error, email });
    }
  });

  logger.info('User registered successfully', { userId, email });

  res.status(201).json({
    message: 'User registered successfully. Please check your email for verification.',
    user: {
      id: userId,
      name,
      email,
      is_verified: false,
      plan_type: 'free'
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
  const isValidPassword = await verifyPassword(password, user.password_hash);
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
      is_verified: user.is_verified,
      plan_type: user.plan_type
    }
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  // Find user by verification token
  const user = await db('users').where('verification_token', token).first();
  if (!user) {
    throw createError('Invalid or expired verification token', 400);
  }

  // Check if user is already verified
  if (user.is_verified) {
    return res.json({
      message: 'Email already verified',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_verified: true
      }
    });
  }

  // Update user verification status
  await db('users').where('id', user.id).update({
    is_verified: true,
    verification_token: null,
    updated_at: new Date()
  });

  logger.info('Email verified successfully', { userId: user.id, email: user.email });

  return res.json({
    message: 'Email verified successfully. You can now login.',
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
    reset_token: resetToken,
    reset_token_expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
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
    .where('reset_token', token)
    .where('reset_token_expires', '>', new Date())
    .first();

  if (!user) {
    throw createError('Invalid or expired reset token', 400);
  }

  // Hash new password
  const passwordHash = await hashPassword(password);

  // Update user password and clear reset token
  await db('users').where('id', user.id).update({
    password_hash: passwordHash,
    reset_token: null,
    reset_token_expires: null,
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
      .select('id', 'email', 'name', 'plan_type', 'is_verified')
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
        is_verified: user.is_verified,
        plan_type: user.plan_type
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
    .select('id', 'name', 'email', 'is_verified', 'plan_type', 'created_at', 'updated_at')
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
    .select('id', 'name', 'email', 'is_verified', 'plan_type', 'created_at', 'updated_at')
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