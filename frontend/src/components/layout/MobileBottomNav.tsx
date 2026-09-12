import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  BookOpen,
  FileText,
  Globe,
  Home,
  Key,
  LogOut,
  Mail,
  Plus,
  Send,
  Settings,
  Webhook,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

/**
 * Hierarquia derivada do produto: o valor central da VeloMail e disparar um
 * envio, entao "Enviar" ocupa a posicao de destaque. Os demais itens da
 * sidebar continuam acessiveis pelo "Mais", sem duplicar a navegacao.
 */
const primaryItems: NavItem[] = [
  { name: 'Inicio', href: '/app', icon: Home },
  { name: 'Emails', href: '/app/emails', icon: Mail },
]

const secondaryItems: NavItem[] = [{ name: 'Analytics', href: '/app/analytics', icon: BarChart3 }]

const moreItems: NavItem[] = [
  { name: 'Templates', href: '/app/templates', icon: FileText },
  { name: 'Dominios', href: '/app/domains', icon: Globe },
  { name: 'Webhooks', href: '/app/webhooks', icon: Webhook },
  { name: 'API Keys', href: '/app/api-keys', icon: Key },
  { name: 'Integracao IA', href: '/app/ai', icon: Bot },
  { name: 'Developers', href: '/app/developers', icon: BookOpen },
  { name: 'Configuracoes', href: '/app/settings', icon: Settings },
]

const isRouteActive = (pathname: string, href: string) => {
  if (href === '/app') {
    return pathname === '/app'
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  const sendIsActive = isRouteActive(location.pathname, '/app/emails/send')
  const moreIsActive = moreItems.some((item) => isRouteActive(location.pathname, item.href))

  const closeMore = () => setIsMoreOpen(false)

  const renderTab = (item: NavItem) => {
    const Icon = item.icon
    const active = isRouteActive(location.pathname, item.href)

    return (
      <Link
        key={item.href}
        to={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="max-w-full truncate">{item.name}</span>
      </Link>
    )
  }

  return (
    <>
      {/* Bottom sheet do "Mais" */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Mais opcoes">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-background/80 backdrop-blur-sm"
            onClick={closeMore}
            aria-label="Fechar menu"
          />

          <div className="vm-sheet absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t bg-card p-4 shadow-md">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" />

            <h2 className="mb-3 px-1 text-sm font-semibold text-foreground">Mais opcoes</h2>

            <nav aria-label="Navegacao secundaria">
              <ul className="grid grid-cols-2 gap-2">
                {moreItems.map((item) => {
                  const Icon = item.icon
                  const active = isRouteActive(location.pathname, item.href)

                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        onClick={closeMore}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[56px] items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'bg-muted/45 text-foreground hover:border-primary/30 hover:bg-primary/5'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <Button
              variant="outline"
              className="mt-4 w-full justify-start text-destructive"
              onClick={() => {
                closeMore()
                logout()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sair da conta
            </Button>
          </div>
        </div>
      )}

      <nav
        className="vm-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
        aria-label="Navegacao principal mobile"
      >
        <div className="flex items-stretch justify-around gap-1 px-2 pt-1">
          {primaryItems.map(renderTab)}

          {/* Acao principal: elevada e circular para leitura imediata. */}
          <div className="flex min-w-0 flex-1 justify-center">
            <button
              type="button"
              onClick={() => navigate('/app/emails/send')}
              aria-label="Enviar email"
              aria-current={sendIsActive ? 'page' : undefined}
              className={cn(
                'vm-bottom-nav-fab -mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-95',
                sendIsActive ? 'bg-[hsl(var(--primary-active))]' : 'bg-primary'
              )}
            >
              <Send className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {secondaryItems.map(renderTab)}

          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-expanded={isMoreOpen}
            aria-haspopup="dialog"
            className={cn(
              'flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors',
              moreIsActive || isMoreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </>
  )
}
