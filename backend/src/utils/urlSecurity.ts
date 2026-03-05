import dns from 'dns/promises';
import net from 'net';

const PRIVATE_IPV4_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' }
];

const ipv4ToLong = (ip: string): number => {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
};

const isPrivateIpv4 = (ip: string): boolean => {
  try {
    const value = ipv4ToLong(ip);
    return PRIVATE_IPV4_RANGES.some((range) => {
      const start = ipv4ToLong(range.start);
      const end = ipv4ToLong(range.end);
      return value >= start && value <= end;
    });
  } catch {
    return true;
  }
};

const isPrivateIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80')
    || normalized.startsWith('::ffff:127.')
  );
};

const normalizeHost = (host: string) => host.trim().toLowerCase();

const isHostDeniedByName = (hostname: string): boolean => {
  const host = normalizeHost(hostname);
  return (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host === '0.0.0.0'
  );
};

const hostnameMatchesAllowed = (hostname: string, allowedHosts: string[]): boolean => {
  const normalizedHost = normalizeHost(hostname);
  return allowedHosts.some((allowed) => {
    const normalizedAllowed = normalizeHost(allowed);
    return (
      normalizedHost === normalizedAllowed
      || normalizedHost.endsWith(`.${normalizedAllowed}`)
    );
  });
};

const parseAllowedHosts = (): string[] => {
  return String(process.env.WEBHOOK_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const assertSafeWebhookUrl = async (webhookUrl: string): Promise<void> => {
  let parsed: URL;

  try {
    parsed = new URL(webhookUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  if (isHostDeniedByName(parsed.hostname)) {
    throw new Error('Webhook URL points to a restricted host');
  }

  const allowedHosts = parseAllowedHosts();
  if (allowedHosts.length > 0 && !hostnameMatchesAllowed(parsed.hostname, allowedHosts)) {
    throw new Error('Webhook host is not in the allowlist');
  }

  const addressType = net.isIP(parsed.hostname);
  if (addressType === 4 && isPrivateIpv4(parsed.hostname)) {
    throw new Error('Webhook URL points to a private IPv4 address');
  }
  if (addressType === 6 && isPrivateIpv6(parsed.hostname)) {
    throw new Error('Webhook URL points to a private IPv6 address');
  }

  // Resolve DNS to avoid internal hosts hidden behind public-looking names.
  const resolved = await dns.lookup(parsed.hostname, { all: true });
  if (!resolved.length) {
    throw new Error('Webhook host has no resolvable IP');
  }

  for (const record of resolved) {
    if (record.family === 4 && isPrivateIpv4(record.address)) {
      throw new Error('Webhook host resolves to a private IPv4 address');
    }
    if (record.family === 6 && isPrivateIpv6(record.address)) {
      throw new Error('Webhook host resolves to a private IPv6 address');
    }
  }
};
