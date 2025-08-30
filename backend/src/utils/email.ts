import dns from 'dns';
import { promisify } from 'util';
import validator from 'validator';

const resolveMx = promisify(dns.resolveMx);

export const validateEmailAddress = async (email: string): Promise<{
  isValid: boolean;
  reason?: string;
}> => {
  // Basic format validation
  if (!validator.isEmail(email)) {
    return { isValid: false, reason: 'Invalid email format' };
  }

  // Extract domain
  const domain = email.split('@')[1];
  
  if (!domain) {
    return { isValid: false, reason: 'Invalid email format' };
  }
  
  try {
    // Check if domain has MX records with timeout
    const mxRecords = await Promise.race([
      resolveMx(domain),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DNS timeout')), 5000)
      )
    ]) as any[];
    
    if (!mxRecords || mxRecords.length === 0) {
      return { isValid: false, reason: 'Domain has no MX records' };
    }

    return { isValid: true };
  } catch (error) {
    // For now, accept emails even if DNS fails (could be network issue)
    // In production, you might want to be more strict
    return { isValid: true, reason: 'DNS check failed but email format is valid' };
  }
};

export const processTemplate = (template: string, variables: Record<string, any>): string => {
  let processed = template;
  
  // Replace {{variable}} patterns
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    processed = processed.replace(regex, String(variables[key] || ''));
  });
  
  // Remove unused template variables
  processed = processed.replace(/{{[^}]+}}/g, '');
  
  return processed;
};

export const extractVariablesFromTemplate = (template: string): string[] => {
  const regex = /{{\\s*([^}\\s]+)\\s*}}/g;
  const variables: string[] = [];
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    if (match[1] && !variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  
  return variables;
};

export const generateTrackingPixel = (trackingId: string, domain: string): string => {
  return `<img src="https://${domain}/track/open/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
};

export const processLinksForTracking = (html: string, trackingId: string, domain: string): string => {
  const regex = /<a\\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  
  return html.replace(regex, (match, url) => {
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.includes(domain)) {
      return match;
    }
    
    const trackingUrl = `https://${domain}/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
    return match.replace(url, trackingUrl);
  });
};

export const generateEmailId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}`;
};

export const parseEmailList = (emails: string | string[]): string[] => {
  if (Array.isArray(emails)) {
    return emails;
  }
  
  if (typeof emails === 'string') {
    return emails.split(',').map(email => email.trim()).filter(email => email.length > 0);
  }
  
  return [];
};

export const generateUnsubscribeLink = (emailId: string, domain: string): string => {
  return `https://${domain}/unsubscribe/${emailId}`;
};

export const isBouncedEmail = (bounceReason: string): boolean => {
  const hardBouncePatterns = [
    'user unknown',
    'mailbox unavailable',
    'invalid recipient',
    'no such user',
    'user not found',
    'recipient rejected'
  ];
  
  return hardBouncePatterns.some(pattern => 
    bounceReason.toLowerCase().includes(pattern)
  );
};