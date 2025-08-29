import { useNavigate } from 'react-router-dom';

/**
 * Hook for secure navigation that prevents open redirect vulnerabilities
 */
export const useSecureNavigation = () => {
  const navigate = useNavigate();

  const secureNavigate = (path: string, options?: { replace?: boolean; state?: any }) => {
    // Validate that the path is safe (starts with / for relative paths)
    if (!path.startsWith('/')) {
      console.warn('Unsafe navigation path detected, redirecting to home:', path);
      path = '/';
    }

    // Block navigation to external URLs
    try {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin) {
        console.warn('External URL navigation blocked:', path);
        path = '/';
      }
    } catch {
      // If URL parsing fails, it's likely a relative path, which is safe
    }

    navigate(path, options);
  };

  const secureReplace = (path: string, state?: any) => {
    secureNavigate(path, { replace: true, state });
  };

  const secureRedirect = (path: string) => {
    secureNavigate(path, { replace: true });
  };

  return {
    secureNavigate,
    secureReplace,
    secureRedirect,
    // Secure replacement for window.location.href
    setLocation: (path: string) => {
      secureReplace(path);
    }
  };
};