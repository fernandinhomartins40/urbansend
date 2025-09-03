import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store'

/**
 * Hook to periodically check auth status and clean invalid sessions
 */
export const useAuthCheck = () => {
  const { isAuthenticated, checkAuthStatus } = useAuthStore()

  useEffect(() => {
    // Check auth status immediately if user is supposed to be authenticated
    if (isAuthenticated) {
      checkAuthStatus()
    }

    // Set up periodic auth check every 5 minutes
    const interval = setInterval(() => {
      if (isAuthenticated) {
        checkAuthStatus()
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [isAuthenticated, checkAuthStatus])

  // Also check on window focus to catch expired sessions quickly
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthenticated) {
        checkAuthStatus()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated, checkAuthStatus])
}