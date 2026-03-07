import db from '../config/database';

export interface ApiKeyTableCapabilities {
  hasDescription: boolean;
  hasKeyType: boolean;
}

let cachedCapabilities: ApiKeyTableCapabilities | null = null;

export const getApiKeyTableCapabilities = async (): Promise<ApiKeyTableCapabilities> => {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const [hasDescription, hasKeyType] = await Promise.all([
    db.schema.hasColumn('api_keys', 'description'),
    db.schema.hasColumn('api_keys', 'key_type')
  ]);

  cachedCapabilities = {
    hasDescription,
    hasKeyType
  };

  return cachedCapabilities;
};

export const getApiKeySelectColumns = async (): Promise<string[]> => {
  const capabilities = await getApiKeyTableCapabilities();

  return [
    'id',
    'name',
    ...(capabilities.hasDescription ? ['description'] : []),
    ...(capabilities.hasKeyType ? ['key_type'] : []),
    'permissions',
    'created_at',
    'last_used',
    'is_active',
    'key_preview'
  ];
};

export const applyApiKeyMetadataForWrite = async <T extends Record<string, unknown>>(payload: T): Promise<T> => {
  const capabilities = await getApiKeyTableCapabilities();
  const nextPayload = { ...payload };

  if (!capabilities.hasDescription) {
    delete nextPayload.description;
  }

  if (!capabilities.hasKeyType) {
    delete nextPayload.key_type;
  }

  return nextPayload as T;
};

export const deriveApiKeyType = (apiKeyLike: { key_type?: unknown; key_preview?: unknown } | string | null | undefined): 'standard' | 'ai_agent' => {
  if (!apiKeyLike) {
    return 'standard';
  }

  if (typeof apiKeyLike === 'string') {
    return apiKeyLike.startsWith('uai_') ? 'ai_agent' : 'standard';
  }

  if (apiKeyLike.key_type === 'ai_agent') {
    return 'ai_agent';
  }

  return typeof apiKeyLike.key_preview === 'string' && apiKeyLike.key_preview.startsWith('uai_')
    ? 'ai_agent'
    : 'standard';
};
