import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { authApi } from '@/lib/api'
import { getLoginPreferences, saveLoginPreferences } from '@/lib/authPreferences'
import { useAuthStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória')
})

type SuperAdminLoginForm = z.infer<typeof loginSchema>

export function SuperAdminLogin() {
  const navigate = useNavigate()
  const { login, isAuthenticated, user } = useAuthStore()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberCredentials, setRememberCredentials] = useState(false)
  const [keepConnected, setKeepConnected] = useState(true)

  const form = useForm<SuperAdminLoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  })

  useEffect(() => {
    if (isAuthenticated && user?.is_superadmin && user?.session_scope === 'super_admin') {
      navigate('/super-admin/overview', { replace: true })
      return
    }

    if (isAuthenticated && !user?.is_superadmin) {
      navigate('/app', { replace: true })
    }
  }, [isAuthenticated, user?.is_superadmin, user?.session_scope, navigate])

  useEffect(() => {
    const preferences = getLoginPreferences('super_admin')
    setRememberCredentials(preferences.rememberCredentials)
    setKeepConnected(preferences.keepConnected)

    if (preferences.email) {
      form.setValue('email', preferences.email)
    }

    if (preferences.password) {
      form.setValue('password', preferences.password)
    }
  }, [form])

  const handleSubmit = async (values: SuperAdminLoginForm) => {
    setIsLoading(true)
    const loadingToast = toast.loading('Validando credenciais de super admin...')

    try {
      const email = values.email?.trim() || ''
      const password = values.password || ''

      if (!email || !password) {
        throw new Error('Email e senha são obrigatórios')
      }

      const response = await authApi.superAdminLogin({ email, password })

      saveLoginPreferences('super_admin', {
        rememberCredentials,
        keepConnected,
        email,
        password
      })

      login(response.data.user)
      toast.dismiss(loadingToast)
      toast.success('Login de super admin realizado com sucesso')
      navigate('/super-admin/overview', { replace: true })
    } catch (error: any) {
      toast.dismiss(loadingToast)
      const message = error?.response?.data?.message || 'Falha no login de super admin'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <Card className="w-full border-white/15 bg-white/95 shadow-2xl">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Login Super Admin</CardTitle>
            <CardDescription>
              Acesso exclusivo para a conta superadmin da plataforma.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="super-admin-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="super-admin-email"
                    type="email"
                    className="pl-9"
                    placeholder="superadmin@ultrazend.com.br"
                    {...form.register('email')}
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="super-admin-password">Senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="super-admin-password"
                    type={showPassword ? 'text' : 'password'}
                    className="pl-9 pr-9"
                    placeholder="**********"
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <label htmlFor="remember-super-admin-credentials" className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id="remember-super-admin-credentials"
                    checked={rememberCredentials}
                    onCheckedChange={(checked) => setRememberCredentials(Boolean(checked))}
                  />
                  <span>Salvar email e senha</span>
                </label>
                <label htmlFor="keep-connected-super-admin" className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id="keep-connected-super-admin"
                    checked={keepConnected}
                    onCheckedChange={(checked) => setKeepConnected(Boolean(checked))}
                  />
                  <span>Manter conectado</span>
                </label>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    Esta autenticação é separada do login padrão. Apenas o usuário marcado como
                    <strong> superadmin</strong> pode acessar este painel.
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar como Super Admin
              </Button>

              <div className="text-center">
                <Link to="/super-admin/forgot-password" className="text-sm text-indigo-700 hover:text-indigo-800">
                  Esqueceu sua senha?
                </Link>
              </div>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-medium text-indigo-700 hover:text-indigo-800">
                Ir para login padrão
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
