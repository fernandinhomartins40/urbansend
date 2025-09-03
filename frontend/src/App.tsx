import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { useAuthStore } from './lib/store'
import { useAuthEvents } from './hooks/useAuthEvents'
import { useAuthCheck } from './hooks/useAuthCheck'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Toaster } from 'react-hot-toast'
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
const EmailDetails = lazy(() => import('./pages/EmailDetails').then(m => ({ default: m.EmailDetails })));
const SendEmail = lazy(() => import('./pages/SendEmail').then(m => ({ default: m.SendEmail })));
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
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  
  // Allow access to login page if user is specifically on login route or if user data is missing
  // This prevents redirect loops when session expires but localStorage still shows authenticated
  if (isAuthenticated && user && location.pathname !== '/login' && location.pathname !== '/admin/login') {
    // Only redirect to app if we're sure the user is properly authenticated
    // and not trying to access the login page specifically
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  useAuthEvents() // Handle auth events
  useAuthCheck()  // Periodically check auth status

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
              {/* Admin login redirect to regular login */}
              <Route 
                path="/admin/login" 
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
                  path="emails/send" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <SendEmail />
                    </Suspense>
                  } 
                />
                <Route 
                  path="emails/:id" 
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <EmailDetails />
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
          {/* Toast global configurado para toda aplicação */}
          <div aria-live="polite" aria-atomic="true">
            <Toaster
              position="top-right"
              reverseOrder={false}
              gutter={8}
              containerClassName=""
              containerStyle={{
                top: 20,
                right: 20,
                zIndex: 9999
              }}
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#ffffff',
                  color: '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  maxWidth: '400px',
                  padding: '12px 16px'
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#ffffff'
                  },
                  style: {
                    border: '1px solid #10b981',
                    background: '#f0fdf4',
                    color: '#065f46'
                  }
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#ffffff'
                  },
                  style: {
                    border: '1px solid #ef4444',
                    background: '#fef2f2',
                    color: '#991b1b'
                  }
                },
                loading: {
                  iconTheme: {
                    primary: '#3b82f6',
                    secondary: '#ffffff'
                  }
                }
              }}
            />
          </div>
        </Router>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

export default App