import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Link2,
  Search,
  ShieldCheck,
  Users,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SuperAdminSidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navigation = [
  { label: 'Overview', to: '/super-admin/overview', icon: BarChart3 },
  { label: 'Accounts', to: '/super-admin/accounts', icon: ShieldCheck },
  { label: 'Users', to: '/super-admin/users', icon: Users },
  { label: 'Deliverability', to: '/super-admin/deliverability', icon: Activity },
  { label: 'Integrations', to: '/super-admin/integrations', icon: Link2 },
  { label: 'Audit Logs', to: '/super-admin/audit', icon: Search }
]

export function SuperAdminSidebar({ isOpen, onClose }: SuperAdminSidebarProps) {
  const location = useLocation()

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-72 border-r border-indigo-200 bg-gradient-to-b from-indigo-50 via-cyan-50 to-white transition-transform duration-200 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <header className="flex h-16 items-center justify-between border-b border-indigo-200 px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-indigo-900">UltraZend</div>
                <div className="text-xs text-indigo-700">Super Admin</div>
              </div>
            </div>

            <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </header>

          <nav className="flex-1 space-y-1 p-3">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = isActive(item.to)

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose()
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-700 hover:bg-indigo-100 hover:text-indigo-900'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <footer className="border-t border-indigo-200 p-4">
            <div className="rounded-lg border border-indigo-200 bg-white/80 p-3 text-xs text-indigo-700">
              Session scope: <span className="font-semibold">super_admin</span>
            </div>
          </footer>
        </div>
      </aside>
    </>
  )
}
