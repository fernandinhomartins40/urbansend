import { useEffect } from 'react';
import { useSecureNavigation } from './useSecureNavigation';
import { useAuthStore } from '@/lib/store';

/**
 * Hook to handle authentication events and secure navigation
 */
export const useAuthEvents = () => {
  const { secureRedirect } = useSecureNavigation();
  const { logout } = useAuthStore();

  useEffect(() => {
    const handleSessionExpired = async () => {
      // Clear authentication state immediately
      await logout();
      // Then redirect to login
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
  }, [secureRedirect, logout]);
};