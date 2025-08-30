import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { useAuthStore } from './lib/store'
import { useAuthEvents } from './hooks/useAuthEvents'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import './styles/globals.css'

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
  </div>
)

// Lazy load components for better performance
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail').then(m => ({ default: m.VerifyEmail })));
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const EmailList = lazy(() => import('./pages/EmailList').then(m => ({ default: m.EmailList })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Domains = lazy(() => import('./pages/Domains').then(m => ({ default: m.Domains })));
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));

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

function AppRoutes() {
  useAuthEvents() // Now inside Router context

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route 
                path="/login" 
                element={
                  <PublicRoute>
                    <Suspense fallback={<LoadingSpinner />}>
                      <Login />
                    </Suspense>
                  </PublicRoute>
                } 
              />
              <Route 
                path="/verify-email" 
                element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <VerifyEmail />
                  </Suspense>
                } 
              />
              
              {/* Protected app routes */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route 
                  index 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <Dashboard />
                    </Suspense>
                  } 
                />
                <Route 
                  path="emails" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <EmailList />
                    </Suspense>
                  } 
                />
                <Route 
                  path="templates" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <Templates />
                    </Suspense>
                  } 
                />
                <Route 
                  path="domains" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <Domains />
                    </Suspense>
                  } 
                />
                <Route 
                  path="analytics" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <Analytics />
                    </Suspense>
                  } 
                />
                <Route 
                  path="webhooks" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <Webhooks />
                    </Suspense>
                  } 
                />
                <Route 
                  path="api-keys" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <ApiKeys />
                    </Suspense>
                  } 
                />
                <Route 
                  path="settings" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <SettingsPage />
                    </Suspense>
                  } 
                />
              </Route>

              {/* Redirect unknown routes to landing page */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Router>
          <AppRoutes />
        </Router>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

export default App