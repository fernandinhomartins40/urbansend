import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSmartPolling } from '../useSmartPolling'
import React from 'react'

// Mock query function
const mockQueryFn = jest.fn().mockResolvedValue({ data: 'test' })

// Create wrapper with QueryClient
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
    jest.clearAllMocks()
    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
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

  it('should handle errors with backoff', async () => {
    const errorFn = jest.fn().mockRejectedValue(new Error('Test error'))
    const onError = jest.fn()

    renderHook(
      () => useSmartPolling({
        queryKey: ['test'],
        queryFn: errorFn,
        baseInterval: 5000,
        maxInterval: 60000,
        backoffMultiplier: 2,
        onError,
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  it('should reset interval on successful query after error', async () => {
    let shouldError = true
    const conditionalFn = jest.fn().mockImplementation(() => {
      if (shouldError) {
        return Promise.reject(new Error('Test error'))
      }
      return Promise.resolve({ data: 'success' })
    })

    const { result } = renderHook(
      () => useSmartPolling({
        queryKey: ['test'],
        queryFn: conditionalFn,
        baseInterval: 5000,
      }),
      { wrapper: createWrapper() }
    )

    // Wait for error
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    // Now make it succeed
    act(() => {
      shouldError = false
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(false)
    })
  })
})