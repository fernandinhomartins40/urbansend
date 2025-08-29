import { useEffect } from 'react';
import { useSecureNavigation } from './useSecureNavigation';

/**
 * Hook to handle authentication events and secure navigation
 */
export const useAuthEvents = () => {
  const { secureRedirect } = useSecureNavigation();

  useEffect(() => {
    const handleSessionExpired = () => {
      secureRedirect('/login');
    };

    const handleLogout = () => {
      secureRedirect('/');
    };

    // Listen for auth events
    window.addEventListener('auth:session-expired', handleSessionExpired);
    window.addEventListener('auth:logout', handleLogout);

    // Cleanup listeners
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, [secureRedirect]);
};