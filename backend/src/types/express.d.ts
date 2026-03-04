import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    correlationId?: string;
    userId?: string;
    user?: {
      id: number;
      email: string;
      name: string;
      permissions?: string[];
      account_id?: number;
      organization_id?: number | null;
      organization_name?: string;
      organization_role?: 'owner' | 'admin' | 'member';
    };
    apiKey?: {
      id: number;
      user_id: number;
      permissions: string[];
    };
  }
}
