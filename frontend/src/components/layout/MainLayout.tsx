import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { Toaster } from 'react-hot-toast'

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background flex">
      <nav aria-label="Navegação principal">
        <Sidebar />
      </nav>
      <div className="flex-1 flex flex-col md:ml-64">
        <Header />
        <main role="main" className="flex-1 p-6" aria-label="Conteúdo principal">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <div aria-live="polite" aria-atomic="true">
        <Toaster position="top-right" />
      </div>
    </div>
  )
}