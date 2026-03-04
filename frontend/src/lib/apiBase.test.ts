import { describe, expect, it } from 'vitest'
import { normalizeApiBaseUrl } from './apiBase'

describe('normalizeApiBaseUrl', () => {
  it('falls back to /api when the env is missing', () => {
    expect(normalizeApiBaseUrl()).toBe('/api')
    expect(normalizeApiBaseUrl('')).toBe('/api')
  })

  it('normalizes relative values without turning api into a hostname', () => {
    expect(normalizeApiBaseUrl('api')).toBe('/api')
    expect(normalizeApiBaseUrl('/api/')).toBe('/api')
  })

  it('preserves explicit absolute API URLs', () => {
    expect(normalizeApiBaseUrl('https://www.ultrazend.com.br/api/')).toBe('https://www.ultrazend.com.br/api')
  })

  it('promotes absolute site roots to the /api prefix', () => {
    expect(normalizeApiBaseUrl('https://www.ultrazend.com.br')).toBe('https://www.ultrazend.com.br/api')
  })
})
