/**
 * Fonte unica de verdade sobre plataforma e modo de exibicao da aplicacao.
 *
 * Toda deteccao de PWA vive aqui para que nenhum componente precise repetir
 * checagens de user agent ou de display-mode.
 */

const isBrowser = typeof window !== 'undefined'

export type Platform = 'ios' | 'android' | 'desktop'
export type DisplayMode = 'browser' | 'standalone'

/** iPadOS moderno se anuncia como Mac, entao o toque desempata. */
export const isIOS = (): boolean => {
  if (!isBrowser) return false

  const ua = window.navigator.userAgent
  const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua)
  const isIPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints > 1

  return isIPhoneOrIPad || isIPadOS
}

export const isAndroid = (): boolean => {
  if (!isBrowser) return false
  return /Android/i.test(window.navigator.userAgent)
}

/** Instalar pela via do iOS so funciona no Safari, nao em Chrome/Firefox iOS. */
export const isIOSSafari = (): boolean => {
  if (!isIOS()) return false

  const ua = window.navigator.userAgent
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

export const getPlatform = (): Platform => {
  if (isIOS()) return 'ios'
  if (isAndroid()) return 'android'
  return 'desktop'
}

/**
 * `standalone` cobre Android/desktop; `navigator.standalone` e a via legada
 * do iOS, que nao implementa display-mode de forma confiavel.
 */
export const isStandalone = (): boolean => {
  if (!isBrowser) return false

  const byDisplayMode = ['standalone', 'fullscreen', 'minimal-ui'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches
  )

  const byIOSLegacy = (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  return byDisplayMode || byIOSLegacy
}

export const getDisplayMode = (): DisplayMode => (isStandalone() ? 'standalone' : 'browser')

export const isTouchDevice = (): boolean => {
  if (!isBrowser) return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? navigator.maxTouchPoints > 0
}

/** A PWA marca a origem da sessao para o roteamento saber de onde veio. */
export const isLaunchedFromPwa = (): boolean => {
  if (!isBrowser) return false

  if (isStandalone()) return true

  const params = new URLSearchParams(window.location.search)
  return params.get('source') === 'pwa'
}

const DISMISS_KEY_PREFIX = 'velomail-install-dismissed'
const DISMISS_WINDOW_DAYS = 30

const dismissKey = (platform: Platform) => `${DISMISS_KEY_PREFIX}:${platform}`

/** Dispensar o convite vale por um periodo, nao para sempre. */
export const isInstallPromptDismissed = (platform: Platform): boolean => {
  if (!isBrowser) return true

  try {
    const stored = window.localStorage.getItem(dismissKey(platform))
    if (!stored) return false

    const dismissedAt = Number(stored)
    if (!Number.isFinite(dismissedAt)) return false

    const elapsedDays = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24)
    return elapsedDays < DISMISS_WINDOW_DAYS
  } catch {
    // Storage bloqueado (aba privada): trata como dispensado para nao insistir.
    return true
  }
}

export const dismissInstallPrompt = (platform: Platform) => {
  if (!isBrowser) return

  try {
    window.localStorage.setItem(dismissKey(platform), String(Date.now()))
  } catch {
    // Sem storage nao ha o que persistir; o convite some nesta sessao.
  }
}
