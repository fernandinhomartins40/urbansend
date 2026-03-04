import { buildApiUrl } from './apiBase'

type FrontendErrorType = 'react_error' | 'window_error' | 'unhandled_rejection' | 'api_error'

interface FrontendErrorPayload {
  type: FrontendErrorType
  message: string
  name?: string
  stack?: string
  componentStack?: string
  url?: string
  route?: string
  userAgent?: string
  requestId?: string
  correlationId?: string
  sessionId?: string
  statusCode?: number
  component?: string
  metadata?: Record<string, unknown>
}

const SESSION_STORAGE_KEY = 'uz_frontend_session_id'
const DEDUPE_WINDOW_MS = 10000
const recentFingerprints = new Map<string, number>()

const getClientSessionId = () => {
  if (typeof window === 'undefined') {
    return 'server-render'
  }

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated)
  return generated
}

const shouldReportFingerprint = (fingerprint: string) => {
  const now = Date.now()
  const previous = recentFingerprints.get(fingerprint)

  if (previous && now - previous < DEDUPE_WINDOW_MS) {
    return false
  }

  recentFingerprints.set(fingerprint, now)

  for (const [key, timestamp] of recentFingerprints.entries()) {
    if (now - timestamp >= DEDUPE_WINDOW_MS) {
      recentFingerprints.delete(key)
    }
  }

  return true
}

export const createClientRequestId = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
)

export const reportFrontendError = async (payload: FrontendErrorPayload) => {
  if (typeof window === 'undefined') {
    return
  }

  if ((import.meta as any).env?.MODE === 'test') {
    return
  }

  const normalizedPayload: FrontendErrorPayload = {
    ...payload,
    route: payload.route || `${window.location.pathname}${window.location.search}`,
    url: payload.url || window.location.href,
    userAgent: payload.userAgent || window.navigator.userAgent,
    sessionId: payload.sessionId || getClientSessionId(),
  }

  if ((normalizedPayload.url || '').includes('/api/application-logs/frontend-error')) {
    return
  }

  const fingerprint = [
    normalizedPayload.type,
    normalizedPayload.message,
    normalizedPayload.route,
    normalizedPayload.statusCode || ''
  ].join('|')

  if (!shouldReportFingerprint(fingerprint)) {
    return
  }

  try {
    await fetch(buildApiUrl('/application-logs/frontend-error'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(normalizedPayload)
    })
  } catch {
    // Avoid throwing from the reporter; console remains the fallback.
  }
}

export const installGlobalErrorHandlers = () => {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const onError = (event: ErrorEvent) => {
    void reportFrontendError({
      type: 'window_error',
      message: event.message || 'Unhandled window error',
      name: event.error?.name,
      stack: event.error?.stack,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    })
  }

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error
      ? event.reason
      : new Error(typeof event.reason === 'string' ? event.reason : JSON.stringify(event.reason))

    void reportFrontendError({
      type: 'unhandled_rejection',
      message: reason.message,
      name: reason.name,
      stack: reason.stack
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
