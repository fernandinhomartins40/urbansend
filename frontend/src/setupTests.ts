import '@testing-library/jest-dom'
import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Check if server exists before importing
let server: any
try {
  const serverModule = await import('./mocks/server')
  server = serverModule.server
} catch (error) {
  console.warn('MSW server not found, skipping server setup')
}

// Mock global objects
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).ResizeObserver = class ResizeObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    unobserve() {}
  }
}

// Mock IntersectionObserver
;(globalThis as any).IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()


// Start server before all tests
beforeAll(() => server?.listen())

// Close server after all tests
afterAll(() => server?.close())

// Reset handlers after each test
afterEach(() => {
  cleanup()
  server?.resetHandlers()
})