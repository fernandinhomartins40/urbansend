import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSmartPolling } from '../useSmartPolling'
import { useSettingsStore } from '@/lib/store'

const mockQueryFn = vi.fn().mockResolvedValue({ data: 'test' })

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSmartPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        autoRefresh: true,
        refreshInterval: 5000,
      },
    }))

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      writable: true,
      value: false,
    })
  })

  it('should initialize with base interval', () => {
    const { result } = renderHook(
      () => useSmartPolling({
        queryKey: ['test'],
        queryFn: mockQueryFn,
        baseInterval: 5000,
      }),
      { wrapper: createWrapper() }
    )

    expect(result.current.currentInterval).toBe(5000)
    expect(result.current.isTabActive).toBe(true)
  })

  it('should adjust interval when tab becomes inactive', async () => {
    const { result } = renderHook(
      () => useSmartPolling({
        queryKey: ['test'],
        queryFn: mockQueryFn,
        baseInterval: 5000,
      }),
      { wrapper: createWrapper() }
    )

    act(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(result.current.isTabActive).toBe(false)
      expect(result.current.currentInterval).toBeGreaterThan(5000)
    })
  })

  it('should provide pause and resume functionality', () => {
    const { result } = renderHook(
      () => useSmartPolling({
        queryKey: ['test'],
        queryFn: mockQueryFn,
        baseInterval: 5000,
        maxInterval: 60000,
      }),
      { wrapper: createWrapper() }
    )

    act(() => {
      result.current.pausePolling()
    })

    expect(result.current.currentInterval).toBe(60000)

    act(() => {
      result.current.resumePolling()
    })

    expect(result.current.currentInterval).toBe(5000)
  })
})
