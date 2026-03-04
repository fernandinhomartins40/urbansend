export const MANAGED_MAIL_FROM_PREFIX = 'uz-mail';
export const DEFAULT_PLATFORM_MX_HOST = 'mail.ultrazend.com.br';

export function buildManagedMailFromDomain(domain: string): string {
  return `${MANAGED_MAIL_FROM_PREFIX}.${domain}`.toLowerCase();
}

export function extractManagedMailFromBaseDomain(domain: string): string | null {
  const normalizedDomain = domain.toLowerCase();
  const prefix = `${MANAGED_MAIL_FROM_PREFIX}.`;

  if (!normalizedDomain.startsWith(prefix)) {
    return null;
  }

  return normalizedDomain.slice(prefix.length) || null;
}
