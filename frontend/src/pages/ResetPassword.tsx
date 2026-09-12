import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

export function ResetPassword() {
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
      toast.warning('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      toast.warning('As senhas nao coincidem.')
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading('Redefinindo senha...')

    try {
      await authApi.resetPassword(token, password)
      toast.dismiss(loadingToast)
      toast.auth.passwordResetSuccess()
      navigate('/login', { replace: true })
    } catch (error: any) {
      toast.dismiss(loadingToast)
      const message = error.response?.data?.message || 'Nao foi possivel redefinir sua senha.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img className="h-auto w-[168px]" src="/landing/logo-color.png" alt="VeloMail" />
          </div>
          <p className="text-muted-foreground">Definicao de nova senha</p>
        </div>

        <Card className="shadow-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Redefinir senha</CardTitle>
            <CardDescription className="text-center">
              Crie uma nova senha para acessar sua conta.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!token ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-destructive">O link de recuperacao esta incompleto ou expirou.</p>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  Solicitar novo link
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="pl-10 pr-10"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            )}

            <div className="text-center">
              <Link to="/login" className="text-sm text-primary hover:underline">
                Voltar para login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
