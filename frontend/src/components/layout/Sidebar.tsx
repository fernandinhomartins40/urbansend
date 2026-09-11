import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  BookOpen,
  FileText,
  Globe,
  Home,
  Key,
  Mail,
  Settings,
  Webhook,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface SidebarProps {
  className?: string
}

const baseNavigation = [
  { name: 'Dashboard', href: '/app', icon: Home },
  { name: 'Emails', href: '/app/emails', icon: Mail },
  { name: 'Templates', href: '/app/templates', icon: FileText },
  { name: 'Domains', href: '/app/domains', icon: Globe },
  { name: 'Analytics', href: '/app/analytics', icon: BarChart3 },
  { name: 'Webhooks', href: '/app/webhooks', icon: Webhook },
  { name: 'API Keys', href: '/app/api-keys', icon: Key },
  { name: 'Integracao IA', href: '/app/ai', icon: Bot },
  { name: 'Developers', href: '/app/developers', icon: BookOpen },
  { name: 'Settings', href: '/app/settings', icon: Settings }
]

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation()
  const { isOpen, close } = useSidebarStore()
  const navigation = baseNavigation

  const isRouteActive = (href: string) => {
    if (href === '/app') {
      return location.pathname === '/app'
    }

    return location.pathname === href || location.pathname.startsWith(`${href}/`)
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 bg-background border-r transition-transform duration-200 ease-in-out md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          className
        )}
        aria-label="Sidebar navigation"
      >
        <div className="flex h-full flex-col bg-card">
          <header className="flex h-[72px] items-center justify-between px-5 border-b">
            <div className="flex items-center space-x-2">
              <img className="h-auto w-[116px]" src="/landing/logo-color.png" alt="VeloMail" />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={close}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </header>

          <nav className="flex-1 space-y-1 p-3" aria-label="Main menu">
            {navigation.map((item) => {
              const isActive = isRouteActive(item.href)
              const Icon = item.icon

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      close()
                    }
                  }}
                  className={cn(
                    'flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>

          <footer className="p-3 border-t">
            <div className="rounded-xl bg-primary/5 p-3" role="complementary" aria-label="Plan info">
              <div className="text-sm font-medium">Plano Gratuito</div>
              <div className="text-xs text-muted-foreground">
                100 emails/mes restantes
              </div>
              <Button size="sm" className="w-full mt-2" aria-label="Upgrade plan">
                Upgrade
              </Button>
            </div>
          </footer>
        </div>
      </aside>
    </>
  )
}
