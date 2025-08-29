import DOMPurify from 'dompurify';

interface SafeHTMLProps {
  html: string;
  className?: string;
  strict?: boolean;
}

/**
 * Component to safely render HTML content using DOMPurify
 * Prevents XSS attacks by sanitizing potentially dangerous HTML
 */
export const SafeHTML: React.FC<SafeHTMLProps> = ({ 
  html, 
  className,
  strict = false 
}) => {
  if (!html || typeof html !== 'string') {
    return null;
  }

  // Strict mode for email templates - more restrictive
  const sanitizeOptions = strict ? {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'a', 'img'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src', 'width', 'height', 'style'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: false,
    SANITIZE_DOM: true
  } : {
    // Regular mode - allows more HTML elements
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'blockquote', 'pre', 'code',
      'a', 'img'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src', 'width', 'height',
      'style', 'class', 'target'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    KEEP_CONTENT: false,
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false
  };

  const sanitizedHTML = DOMPurify.sanitize(html, sanitizeOptions);

  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
};

/**
 * Hook to safely sanitize HTML content
 */
export const useSafeHTML = (html: string, strict = false) => {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const sanitizeOptions = strict ? {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'a', 'img'
    ],
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'width', 'height', 'style'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: false,
    SANITIZE_DOM: true
  } : undefined;

  return DOMPurify.sanitize(html, sanitizeOptions);
};