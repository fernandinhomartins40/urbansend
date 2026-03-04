const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

export const normalizeApiBaseUrl = (rawValue?: string): string => {
  const value = rawValue?.trim() || ''

  if (!value) {
    return '/api'
  }

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value)
    url.pathname = url.pathname === '/' ? '/api' : trimTrailingSlash(url.pathname)
    return trimTrailingSlash(url.toString())
  }

  const normalizedPath = value.startsWith('/') ? value : `/${value}`
  return normalizedPath === '/' ? '/api' : trimTrailingSlash(normalizedPath)
}

export const API_BASE_URL = normalizeApiBaseUrl((import.meta as any).env?.VITE_API_BASE_URL)

export const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
