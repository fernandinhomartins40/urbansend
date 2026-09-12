import { useCallback, useEffect, useState } from 'react'
import {
  dismissInstallPrompt,
  getPlatform,
  isInstallPromptDismissed,
  isIOSSafari,
  isStandalone,
  type Platform,
} from '@/lib/pwa'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface UsePwaReturn {
  platform: Platform
  standalone: boolean
  /** Android/desktop: o navegador ofereceu o prompt nativo. */
  canInstall: boolean
  /** iOS Safari: instalacao e manual, exige instrucao. */
  needsIOSInstructions: boolean
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  dismiss: () => void
}

/**
 * Centraliza o ciclo de instalacao da PWA.
 *
 * O evento `beforeinstallprompt` so existe em navegadores Chromium; no iOS a
 * instalacao e manual. Nada aqui tenta forcar o prompt onde ele nao existe.
 */
export const usePwa = (): UsePwaReturn => {
  const [platform] = useState<Platform>(() => getPlatform())
  const [standalone, setStandalone] = useState<boolean>(() => isStandalone())
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => isInstallPromptDismissed(getPlatform()))

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // Impede o mini-infobar para exibirmos o convite da propria aplicacao.
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      setDeferredPrompt(null)
      setStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  // O modo pode mudar em tempo real quando o usuario instala com a aba aberta.
  useEffect(() => {
    const query = window.matchMedia?.('(display-mode: standalone)')
    if (!query) return

    const handleChange = () => setStandalone(isStandalone())

    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return 'unavailable' as const
    }

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    // O evento so pode ser consumido uma vez.
    setDeferredPrompt(null)

    if (outcome === 'dismissed') {
      dismissInstallPrompt(platform)
      setDismissed(true)
    }

    return outcome
  }, [deferredPrompt, platform])

  const dismiss = useCallback(() => {
    dismissInstallPrompt(platform)
    setDismissed(true)
  }, [platform])

  return {
    platform,
    standalone,
    canInstall: Boolean(deferredPrompt) && !standalone && !dismissed,
    needsIOSInstructions: isIOSSafari() && !standalone && !dismissed,
    promptInstall,
    dismiss,
  }
}
