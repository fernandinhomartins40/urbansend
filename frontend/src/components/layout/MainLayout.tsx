import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'

export function MainLayout() {
  return (
    <div className="flex min-h-[100dvh] bg-background">
      <nav aria-label="Navegacao principal">
        <Sidebar />
      </nav>
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col md:ml-64">
        <Header />
        <main
          role="main"
          className="vm-has-bottom-nav flex-1 px-3 py-4 sm:px-4 sm:py-5 md:pb-6 lg:px-6 lg:py-6"
          aria-label="Conteudo principal"
        >
          <div className="mx-auto w-full min-w-0 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  )
}
