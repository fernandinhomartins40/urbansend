import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSettingsStore } from '@/lib/store'

interface SmartPollingOptions {
  queryKey: string[]
  queryFn: () => Promise<any>
  baseInterval?: number
  maxInterval?: number
  backoffMultiplier?: number
  enabled?: boolean
  onError?: (error: Error) => void
}

export const useSmartPolling = ({
  queryKey,
  queryFn,
  baseInterval = 5000,
  maxInterval = 60000,
  backoffMultiplier = 2,
  enabled = true,
  onError
}: SmartPollingOptions) => {
  const { autoRefresh, refreshInterval } = useSettingsStore((state) => ({
    autoRefresh: state.settings.autoRefresh,
    refreshInterval: state.settings.refreshInterval,
  }))
  const configuredBaseInterval = Math.max(baseInterval, refreshInterval || baseInterval)
  const [currentInterval, setCurrentInterval] = useState(configuredBaseInterval)
  const [isTabActive, setIsTabActive] = useState(true)
  const errorCountRef = useRef(0)
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    setCurrentInterval(configuredBaseInterval)
  }, [configuredBaseInterval])

  // Track tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isActive = !document.hidden
      setIsTabActive(isActive)
      
      if (isActive) {
        lastActivityRef.current = Date.now()
        // Reset interval when tab becomes active
        setCurrentInterval(configuredBaseInterval)
        errorCountRef.current = 0
      }
    }

    // Track user activity
    const handleActivity = () => {
      lastActivityRef.current = Date.now()
      if (isTabActive && currentInterval > configuredBaseInterval) {
        setCurrentInterval(configuredBaseInterval)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('mousedown', handleActivity)
    document.addEventListener('keydown', handleActivity)
    document.addEventListener('scroll', handleActivity)
    document.addEventListener('touchstart', handleActivity)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('mousedown', handleActivity)
      document.removeEventListener('keydown', handleActivity)
      document.removeEventListener('scroll', handleActivity)
      document.removeEventListener('touchstart', handleActivity)
    }
  }, [configuredBaseInterval, currentInterval, isTabActive])

  // Calculate dynamic interval based on inactivity
  const getDynamicInterval = () => {
    if (!isTabActive) {
      // Slow down polling when tab is not active
      return Math.min(currentInterval * 4, maxInterval)
    }

    const timeSinceActivity = Date.now() - lastActivityRef.current
    const inactiveMinutes = Math.floor(timeSinceActivity / 60000)

    if (inactiveMinutes > 10) {
      // Very slow polling after 10 minutes of inactivity
      return Math.min(configuredBaseInterval * 8, maxInterval)
    } else if (inactiveMinutes > 5) {
      // Slower polling after 5 minutes
      return Math.min(configuredBaseInterval * 4, maxInterval)
    }

    return currentInterval
  }

  const query = useQuery({
    queryKey,
    queryFn,
    enabled,
    refetchInterval: enabled && autoRefresh ? getDynamicInterval() : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // Implement exponential backoff on errors
      if (failureCount < 3) {
        errorCountRef.current = failureCount + 1
        const newInterval = Math.min(
          configuredBaseInterval * Math.pow(backoffMultiplier, errorCountRef.current),
          maxInterval
        )
        setCurrentInterval(newInterval)
        return true
      }
      return false
    }
  })

  // Handle success and error using useEffect
  useEffect(() => {
    if (query.isError && query.error) {
      onError?.(query.error)
      // Increase interval on error
      const newInterval = Math.min(
        currentInterval * backoffMultiplier,
        maxInterval
      )
      setCurrentInterval(newInterval)
    }
  }, [query.isError, query.error, onError, currentInterval, backoffMultiplier, configuredBaseInterval, maxInterval])

  useEffect(() => {
    if (query.isSuccess) {
      // Reset error count and interval on success
      errorCountRef.current = 0
      if (currentInterval > configuredBaseInterval && isTabActive) {
        setCurrentInterval(configuredBaseInterval)
      }
    }
  }, [query.isSuccess, currentInterval, configuredBaseInterval, isTabActive])

  // Expose polling control
  const pausePolling = () => {
    setCurrentInterval(maxInterval)
  }

  const resumePolling = () => {
    setCurrentInterval(configuredBaseInterval)
    errorCountRef.current = 0
  }

  return {
    ...query,
    currentInterval: getDynamicInterval(),
    isTabActive,
    pausePolling,
    resumePolling
  }
}
