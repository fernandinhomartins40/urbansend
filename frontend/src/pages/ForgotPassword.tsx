import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const toast = useToast()

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email.trim()) {
      toast.warning('Informe seu email para recuperar a senha.')
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading('Enviando link de recuperacao...')

    try {
      await authApi.forgotPassword(email.trim())
      toast.dismiss(loadingToast)
      toast.auth.passwordResetSent()
    } catch (error: any) {
      toast.dismiss(loadingToast)
      const message = error.response?.data?.message || 'Nao foi possivel enviar o link de recuperacao.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-black via-primary-dark to-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary-blue flex items-center justify-center">
              <span className="text-white font-bold text-lg">UZ</span>
            </div>
            <span className="text-2xl font-bold text-white">Ultrazend</span>
          </div>
          <p className="text-gray-400">Recuperacao de senha</p>
        </div>

        <Card className="bg-white/95 backdrop-blur border-0 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Esqueceu sua senha?</CardTitle>
            <CardDescription className="text-center">
              Informe seu email para receber o link de redefinicao.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    className="pl-10"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar link de recuperacao'}
              </Button>
            </form>

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
