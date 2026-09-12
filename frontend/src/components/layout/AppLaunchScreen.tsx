import { useEffect, useState } from 'react'

interface AppLaunchScreenProps {
  /** Some assim que a aplicacao souber para onde encaminhar o usuario. */
  onFinish: () => void
}

/**
 * Abertura da PWA instalada.
 *
 * Curta de proposito: cobre apenas a janela em que a sessao esta sendo
 * resolvida. Nao introduz espera artificial — se a decisao vier antes,
 * o splash sai antes.
 */
export function AppLaunchScreen({ onFinish }: AppLaunchScreenProps) {
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Sem animacao, encerra imediatamente.
    if (prefersReducedMotion) {
      onFinish()
      return
    }

    const leaveTimer = window.setTimeout(() => setIsLeaving(true), 520)
    const finishTimer = window.setTimeout(onFinish, 760)

    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(finishTimer)
    }
  }, [onFinish])

  return (
    <div
      className={`vm-launch-screen ${isLeaving ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Abrindo VeloMail"
    >
      <div className="vm-launch-inner">
        <img className="vm-launch-logo" src="/landing/logo-color.png" alt="VeloMail" width={200} />
        <div className="vm-launch-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  )
}
