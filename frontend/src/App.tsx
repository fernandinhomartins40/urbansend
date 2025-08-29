import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MainLayout } from './components/layout/MainLayout'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { VerifyEmail } from './pages/VerifyEmail'
import { LandingPage } from './pages/LandingPage'
import { EmailList } from './pages/EmailList'
import { ApiKeys } from './pages/ApiKeys'
import { Templates } from './pages/Templates'
import { Domains } from './pages/Domains'
import { Analytics } from './pages/Analytics'
import { Webhooks } from './pages/Webhooks'
import { useAuthStore } from './lib/store'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Placeholder component for Settings route still to be implemented
const SettingsPage = () => <div className="p-8"><h1>Settings</h1></div>

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  
  if (isAuthenticated) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}

function App() {

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />
          <Route path="/verify-email" element={<VerifyEmail />} />
          
          {/* Protected app routes */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="emails" element={<EmailList />} />
            <Route path="templates" element={<Templates />} />
            <Route path="domains" element={<Domains />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="webhooks" element={<Webhooks />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Redirect unknown routes to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}

export default App