import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  Mail,
  FileText,
  Globe,
  BarChart3,
  Webhook,
  Key,
  Settings,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface SidebarProps {
  className?: string
}

const navigation = [
  { name: 'Dashboard', href: '/app', icon: Home },
  { name: 'Emails', href: '/app/emails', icon: Mail },
  { name: 'Templates', href: '/app/templates', icon: FileText },
  { name: 'Domains', href: '/app/domains', icon: Globe },
  { name: 'Analytics', href: '/app/analytics', icon: BarChart3 },
  { name: 'Webhooks', href: '/app/webhooks', icon: Webhook },
  { name: 'API Keys', href: '/app/api-keys', icon: Key },
  { name: 'Configurações', href: '/app/settings', icon: Settings },
]

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation()
  const { isOpen, close } = useSidebarStore()

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}
      
      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-50 h-screen w-64 bg-background border-r transition-transform duration-200 ease-in-out md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        className
      )}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">US</span>
              </div>
              <span className="font-bold">UrbanSend</span>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={close}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2 p-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
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
                    "flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t">
            <div className="rounded-lg bg-accent p-3">
              <div className="text-sm font-medium">Plano Gratuito</div>
              <div className="text-xs text-muted-foreground">
                100 emails/mês restantes
              </div>
              <Button size="sm" className="w-full mt-2">
                Upgrade
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}