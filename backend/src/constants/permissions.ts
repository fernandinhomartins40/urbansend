/**
 * Constantes para permissões do sistema
 * Centraliza todas as permissões disponíveis e padrões
 */

// Permissões disponíveis no sistema
export const PERMISSIONS = {
  EMAIL_SEND: 'email:send',
  EMAIL_READ: 'email:read',
  DOMAIN_MANAGE: 'domain:manage',
  TEMPLATE_MANAGE: 'template:manage',
  ANALYTICS_READ: 'analytics:read',
  ADMIN: 'admin'
} as const;

// Permissões padrão para novos usuários
export const DEFAULT_USER_PERMISSIONS = [
  PERMISSIONS.EMAIL_SEND,
  PERMISSIONS.EMAIL_READ,
  PERMISSIONS.DOMAIN_MANAGE,
  PERMISSIONS.TEMPLATE_MANAGE,
  PERMISSIONS.ANALYTICS_READ
];

// Permissões de administrador
export const ADMIN_PERMISSIONS = [
  ...DEFAULT_USER_PERMISSIONS,
  PERMISSIONS.ADMIN
];

// Validador de permissões
export const isValidPermission = (permission: string): boolean => {
  return Object.values(PERMISSIONS).includes(permission as any);
};

// Helper para converter array de permissões para JSON string
export const permissionsToJson = (permissions: string[]): string => {
  return JSON.stringify(permissions);
};

// Helper para converter JSON string para array de permissões
export const permissionsFromJson = (permissionsJson: string | null): string[] => {
  if (!permissionsJson) return DEFAULT_USER_PERMISSIONS;

  try {
    const parsed = JSON.parse(permissionsJson);
    return Array.isArray(parsed) ? parsed : DEFAULT_USER_PERMISSIONS;
  } catch {
    return DEFAULT_USER_PERMISSIONS;
  }
};