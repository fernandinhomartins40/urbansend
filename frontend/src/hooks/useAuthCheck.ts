import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'

/**
 * Hook to periodically check auth status and clean invalid sessions
 */
export const useAuthCheck = () => {
  const { isAuthenticated, checkAuthStatus } = useAuthStore()
  const location = useLocation()

  // Don't check auth status on login/public pages
  const isPublicPage = ['/login', '/admin/login', '/', '/verify-email', '/forgot-password', '/reset-password'].includes(location.pathname)

  useEffect(() => {
    // Only check auth status if user is authenticated and not on a public page
    if (isAuthenticated && !isPublicPage) {
      // Add a small delay to avoid conflicts with initial page load
      const timeoutId = setTimeout(() => {
        checkAuthStatus()
      }, 1000)
      return () => clearTimeout(timeoutId)
    }
  }, [isAuthenticated, checkAuthStatus, isPublicPage])

  useEffect(() => {
    // Set up periodic auth check every 5 minutes, but only for authenticated users on protected pages
    if (!isAuthenticated || isPublicPage) return

    const interval = setInterval(() => {
      checkAuthStatus()
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [isAuthenticated, checkAuthStatus, isPublicPage])

  // Also check on window focus to catch expired sessions quickly
  useEffect(() => {
    if (!isAuthenticated || isPublicPage) return

    const handleFocus = () => {
      checkAuthStatus()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated, checkAuthStatus, isPublicPage])
}
