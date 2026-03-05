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
      const wasInSuperAdmin = window.location.pathname.startsWith('/super-admin');
      // Clear authentication state immediately
      await logout();
      // Then redirect to login
      secureRedirect(wasInSuperAdmin ? '/super-admin/login' : '/login');
    };

    const handleLogout = () => {
      const fromSuperAdmin = window.location.pathname.startsWith('/super-admin');
      secureRedirect(fromSuperAdmin ? '/super-admin/login' : '/');
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
