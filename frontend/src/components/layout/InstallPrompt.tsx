import { useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePwa } from '@/hooks/usePwa'

/**
 * Convite de instalacao.
 *
 * Android/desktop usam o prompt nativo via `beforeinstallprompt`; o iOS nao
 * expoe esse evento, entao recebe a instrucao manual do Safari. Em ambos os
 * casos o convite so aparece quando o navegador realmente permite instalar.
 */
export function InstallPrompt() {
  const { canInstall, needsIOSInstructions, promptInstall, dismiss } = usePwa()
  const [isBusy, setIsBusy] = useState(false)

  if (!canInstall && !needsIOSInstructions) {
    return null
  }

  const handleInstall = async () => {
    setIsBusy(true)
    try {
      await promptInstall()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div
      className="vm-install-prompt fixed inset-x-0 bottom-0 z-30 p-3 md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm md:p-0"
      role="complementary"
      aria-label="Instalar aplicativo"
    >
      <div className="relative rounded-xl border bg-card p-4 shadow-md">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-8 w-8"
          onClick={dismiss}
          aria-label="Dispensar convite de instalacao"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>

        <div className="flex items-start gap-3 pr-8">
          <img src="/favicon.png" alt="" aria-hidden="true" className="h-10 w-10 shrink-0 rounded-lg" />

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Instale o VeloMail</h2>

            {canInstall ? (
              <>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Acesso rapido pela tela inicial, com abertura em tela cheia.
                </p>
                <Button className="mt-3 w-full sm:w-auto" onClick={handleInstall} disabled={isBusy}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isBusy ? 'Instalando...' : 'Instalar aplicativo'}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  No iPhone e iPad a instalacao e feita pelo Safari em dois toques:
                </p>
                <ol className="mt-3 space-y-2 text-sm text-foreground">
                  <li className="flex items-center gap-2">
                    <Share className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      Toque em <span className="font-medium">Compartilhar</span>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <SquarePlus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      Escolha <span className="font-medium">Adicionar a Tela de Inicio</span>
                    </span>
                  </li>
                </ol>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
