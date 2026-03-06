import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

export function SuperAdminResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const token = searchParams.get('token') || ''

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!token) {
      toast.error('Token de recuperacao ausente ou invalido.')
      return
    }

    if (!password || password.length < 8) {
      toast.warning('A nova senha precisa ter no minimo 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      toast.warning('As senhas nao coincidem.')
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading('Redefinindo senha do super admin...')

    try {
      await authApi.superAdminResetPassword(token, password)
      toast.dismiss(loadingToast)
      toast.success('Senha redefinida com sucesso.')
      navigate('/super-admin/login', { replace: true })
    } catch (error: any) {
      toast.dismiss(loadingToast)
      const message = error?.response?.data?.message || 'Nao foi possivel redefinir a senha.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
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
            <CardTitle className="text-2xl">Nova senha Super Admin</CardTitle>
            <CardDescription>
              Defina uma nova senha para recuperar o acesso ao painel super admin.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!token ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-red-600">Link invalido ou expirado.</p>
                <Link to="/super-admin/forgot-password" className="text-sm text-indigo-700 hover:text-indigo-800">
                  Solicitar novo link
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="super-admin-reset-password">Nova senha</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="super-admin-reset-password"
                      type={showPassword ? 'text' : 'password'}
                      className="pl-9 pr-9"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="super-admin-reset-confirm-password">Confirmar senha</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="super-admin-reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="pl-9 pr-9"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            )}

            <div className="text-center text-sm text-muted-foreground">
              <Link to="/super-admin/login" className="font-medium text-indigo-700 hover:text-indigo-800">
                Voltar para login super admin
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
