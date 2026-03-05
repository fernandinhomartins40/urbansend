import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

  const handleSubmit = async (values: SuperAdminLoginForm) => {
    setIsLoading(true)
    const loadingToast = toast.loading('Validando credenciais de super admin...')

    try {
      const response = await authApi.superAdminLogin(values)
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
            <CardTitle className="text-2xl">Super Admin Login</CardTitle>
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
                    type="password"
                    className="pl-9"
                    placeholder="••••••••••"
                    {...form.register('password')}
                  />
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
                )}
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
