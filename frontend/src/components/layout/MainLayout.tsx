import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function MainLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <nav aria-label="Navegacao principal">
        <Sidebar />
      </nav>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-64">
        <Header />
        <main role="main" className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6" aria-label="Conteudo principal">
          <div className="mx-auto w-full max-w-7xl min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
