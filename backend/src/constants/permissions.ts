/**
 * Constantes para permissões do sistema
 * Centraliza todas as permissões disponíveis e padrões
 */

// Permissões disponíveis no sistema
export const PERMISSIONS = {
  EMAIL_SEND: 'email:send',
  EMAIL_READ: 'email:read',
  EMAIL_MANAGE: 'email:manage',
  DOMAIN_READ: 'domain:read',
  DOMAIN_WRITE: 'domain:write',
  DOMAIN_MANAGE: 'domain:manage',
  TEMPLATE_READ: 'template:read',
  TEMPLATE_WRITE: 'template:write',
  TEMPLATE_MANAGE: 'template:manage',
  ANALYTICS_READ: 'analytics:read',
  WEBHOOK_READ: 'webhook:read',
  WEBHOOK_WRITE: 'webhook:write',
  API_KEY_READ: 'api_key:read',
  API_KEY_WRITE: 'api_key:write',
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  WORKSPACE_READ: 'workspace:read',
  WORKSPACE_WRITE: 'workspace:write',
  ADMIN: 'admin',
  PLATFORM_SUPER_ADMIN: 'platform:super_admin',
  ADMIN_DKIM: 'admin:dkim',
  ADMIN_SCHEDULER: 'admin:scheduler',
  ADMIN_MONITORING: 'admin:monitoring',
  ADMIN_FEATURE_FLAGS: 'admin:feature_flags'
} as const;

// Permissões padrão para novos usuários
export const DEFAULT_USER_PERMISSIONS = [
  PERMISSIONS.EMAIL_SEND,
  PERMISSIONS.EMAIL_READ,
  PERMISSIONS.DOMAIN_READ,
  PERMISSIONS.DOMAIN_MANAGE,
  PERMISSIONS.TEMPLATE_READ,
  PERMISSIONS.TEMPLATE_WRITE,
  PERMISSIONS.TEMPLATE_MANAGE,
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.WEBHOOK_READ,
  PERMISSIONS.WEBHOOK_WRITE,
  PERMISSIONS.API_KEY_READ,
  PERMISSIONS.API_KEY_WRITE,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.SETTINGS_WRITE,
  PERMISSIONS.WORKSPACE_READ
];

// Permissões de administrador
export const ADMIN_PERMISSIONS = [
  ...DEFAULT_USER_PERMISSIONS,
  PERMISSIONS.WORKSPACE_WRITE,
  PERMISSIONS.ADMIN
];

export const API_KEY_GRANTABLE_PERMISSIONS = [
  PERMISSIONS.EMAIL_SEND,
  PERMISSIONS.EMAIL_READ,
  PERMISSIONS.EMAIL_MANAGE,
  PERMISSIONS.DOMAIN_READ,
  PERMISSIONS.DOMAIN_WRITE,
  PERMISSIONS.DOMAIN_MANAGE,
  PERMISSIONS.TEMPLATE_READ,
  PERMISSIONS.TEMPLATE_WRITE,
  PERMISSIONS.TEMPLATE_MANAGE,
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.WEBHOOK_READ,
  PERMISSIONS.WEBHOOK_WRITE,
  PERMISSIONS.API_KEY_READ,
  PERMISSIONS.API_KEY_WRITE,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.SETTINGS_WRITE,
  PERMISSIONS.WORKSPACE_READ
] as const;

const PERMISSION_IMPLICATIONS: Record<string, string[]> = {
  [PERMISSIONS.ADMIN]: [
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
    PERMISSIONS.ADMIN_DKIM,
    PERMISSIONS.ADMIN_SCHEDULER,
    PERMISSIONS.ADMIN_MONITORING,
    PERMISSIONS.ADMIN_FEATURE_FLAGS
  ],
  [PERMISSIONS.EMAIL_MANAGE]: [
    PERMISSIONS.EMAIL_SEND,
    PERMISSIONS.EMAIL_READ
  ],
  [PERMISSIONS.DOMAIN_MANAGE]: [
    PERMISSIONS.DOMAIN_READ,
    PERMISSIONS.DOMAIN_WRITE
  ],
  [PERMISSIONS.DOMAIN_WRITE]: [
    PERMISSIONS.DOMAIN_READ
  ],
  [PERMISSIONS.TEMPLATE_MANAGE]: [
    PERMISSIONS.TEMPLATE_READ,
    PERMISSIONS.TEMPLATE_WRITE
  ],
  [PERMISSIONS.TEMPLATE_WRITE]: [
    PERMISSIONS.TEMPLATE_READ
  ],
  [PERMISSIONS.WEBHOOK_WRITE]: [
    PERMISSIONS.WEBHOOK_READ
  ],
  [PERMISSIONS.API_KEY_WRITE]: [
    PERMISSIONS.API_KEY_READ
  ],
  [PERMISSIONS.SETTINGS_WRITE]: [
    PERMISSIONS.SETTINGS_READ
  ],
  [PERMISSIONS.WORKSPACE_WRITE]: [
    PERMISSIONS.WORKSPACE_READ
  ]
};

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

export const expandGrantedPermissions = (permissions: string[] | undefined | null): string[] => {
  const granted = new Set((permissions || []).filter(Boolean));

  for (const permission of Array.from(granted)) {
    const implied = PERMISSION_IMPLICATIONS[permission] || [];
    for (const alias of implied) {
      granted.add(alias);
    }
  }

  if (granted.has(PERMISSIONS.ADMIN)) {
    for (const permission of Object.values(PERMISSIONS)) {
      granted.add(permission);
    }
  }

  return Array.from(granted);
};

export const hasPermission = (
  permissions: string[] | undefined | null,
  requiredPermission: string
): boolean => {
  const granted = expandGrantedPermissions(permissions);

  if (granted.includes(requiredPermission)) {
    return true;
  }

  if (requiredPermission.startsWith('admin:') && granted.includes(PERMISSIONS.ADMIN)) {
    return true;
  }

  return false;
};
