import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  requestId?: string; // Para tracking de requests
}