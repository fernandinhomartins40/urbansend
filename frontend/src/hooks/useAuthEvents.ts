import { useEffect } from 'react';
import { useSecureNavigation } from './useSecureNavigation';
import { useAuthStore } from '@/lib/store';
import { isStandalone } from '@/lib/pwa';

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

      if (fromSuperAdmin) {
        secureRedirect('/super-admin/login');
        return;
      }

      // Na PWA instalada a landing page nao faz parte da experiencia: sair
      // leva ao login, nao para fora do aplicativo.
      secureRedirect(isStandalone() ? '/login' : '/');
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
