import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createError } from './errorHandler';
import { Env } from '../utils/env';
import { verifyApiKey, legacyHashApiKey } from '../utils/crypto';
import db from '../config/database';
import { logger } from '../config/logger';
import { permissionsFromJson } from '../constants/permissions';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    permissions?: string[];
  };
  apiKey?: {
    id: number;
    user_id: number;
    permissions: string[];
  };
}

export const generateJWT = (payload: any): string => {
  return jwt.sign(payload, Env.jwtSecret, {
    expiresIn: Env.get('JWT_EXPIRES_IN', '7d')
  } as any);
};

export const generateRefreshToken = (payload: any): string => {
  return jwt.sign(payload, Env.jwtRefreshSecret, {
    expiresIn: Env.get('JWT_REFRESH_EXPIRES_IN', '30d')
  } as any);
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = Env.getNumber('BCRYPT_SALT_ROUNDS', 12);
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Try to get token from cookie first (secure method)
    let token = req.cookies.access_token;
    
    // Fallback to Authorization header for API compatibility
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      throw createError('Access token required', 401);
    }
    
    const decoded = jwt.verify(token, Env.jwtSecret) as any;
    
    const user = await db('users')
      .select('id', 'email', 'name', 'is_verified', 'permissions')
      .where('id', decoded.userId)
      .first();

    if (!user) {
      throw createError('Invalid token - user not found', 401);
    }

    if (!user.is_verified) {
      throw createError('Email verification required', 403);
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      permissions: permissionsFromJson(user.permissions),
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', message: 'Please login again' });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token', message: 'Please login again' });
    }
    
    return next(error);
  }
};

export const authenticateApiKey = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const apiKeyHeader = req.headers['x-api-key'] as string;
    
    if (!apiKeyHeader) {
      throw createError('API key required', 401);
    }

    // API keys should start with 're_'
    if (!apiKeyHeader.startsWith('re_')) {
      throw createError('Invalid API key format', 401);
    }

    // First try to find API keys to verify against
    const apiKeys = await db('api_keys')
      .select('api_keys.*', 'users.id as user_id', 'users.email', 'users.name')
      .join('users', 'api_keys.user_id', 'users.id')
      .where('api_keys.is_active', true);

    let matchedApiKey = null;

    // Try to verify against each active API key
    for (const key of apiKeys) {
      try {
        // First try bcrypt verification (new secure method)
        if (await verifyApiKey(apiKeyHeader, key.api_key_hash)) {
          matchedApiKey = key;
          break;
        }
      } catch {
        // If bcrypt fails, try legacy SHA256 verification for existing keys
        const legacyHash = legacyHashApiKey(apiKeyHeader);
        if (legacyHash === key.api_key_hash) {
          matchedApiKey = key;
          
          // Migrate to secure hash asynchronously (don't wait for it)
          (async () => {
            try {
              const { hashApiKey } = await import('../utils/crypto');
              const newHash = await hashApiKey(apiKeyHeader);
              await db('api_keys')
                .where('id', key.id)
                .update({ api_key_hash: newHash });
            } catch (error) {
              logger.error('Failed to migrate API key hash:', error);
            }
          })();
          break;
        }
      }
    }

    if (!matchedApiKey) {
      throw createError('Invalid API key', 401);
    }

    const apiKey = matchedApiKey;

    // Update last used timestamp
    await db('api_keys')
      .where('id', apiKey.id)
      .update({ last_used_at: new Date() });

    const permissions = permissionsFromJson(apiKey.permissions);

    req.user = {
      id: apiKey.user_id,
      email: apiKey.email,
      name: apiKey.name
    };

    req.apiKey = {
      id: apiKey.id,
      user_id: apiKey.user_id,
      permissions
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    // If authenticated via JWT, allow all operations
    if (req.user && !req.apiKey) {
      return next();
    }

    // If authenticated via API key, check permissions
    if (req.apiKey && req.apiKey.permissions.includes(permission)) {
      return next();
    }

    throw createError('Insufficient permissions', 403);
  };
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authenticateJWT(req, res, next);
    }

    if (apiKeyHeader) {
      return authenticateApiKey(req, res, next);
    }

    // No authentication provided, continue without user
    next();
  } catch (error) {
    // For optional auth, we don't throw errors, just continue without user
    next();
  }
};