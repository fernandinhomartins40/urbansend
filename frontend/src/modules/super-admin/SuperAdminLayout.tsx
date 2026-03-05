import { Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { LogOut, Menu, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/store'
import { SuperAdminSidebar } from './SuperAdminSidebar'

const pageTitleByPath: Record<string, string> = {
  '/super-admin/overview': 'Overview',
  '/super-admin/accounts': 'Accounts',
  '/super-admin/users': 'Users',
  '/super-admin/deliverability': 'Deliverability',
  '/super-admin/integrations': 'Integrations',
  '/super-admin/audit': 'Audit Logs'
}

export function SuperAdminLayout() {
  const location = useLocation()
  const logout = useAuthStore((state) => state.logout)
  const user = useAuthStore((state) => state.user)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const pageTitle = pageTitleByPath[location.pathname] || 'Super Admin'

  return (
    <div className="min-h-screen bg-slate-100">
      <SuperAdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="lg:ml-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-700" />
                <div>
                  <h1 className="text-sm font-semibold text-slate-900 sm:text-base">{pageTitle}</h1>
                  <p className="text-xs text-slate-500">Painel separado de administração da plataforma</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs text-slate-500">Conectado como</div>
                <div className="max-w-[240px] truncate text-sm font-medium text-slate-900">{user?.email}</div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  void logout()
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
