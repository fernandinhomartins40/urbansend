import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

export function SuperAdminForgotPassword() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const toast = useToast()

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email.trim()) {
      toast.warning('Informe o email do super admin para recuperar a senha.')
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading('Enviando link de recuperacao super admin...')

    try {
      await authApi.superAdminForgotPassword(email.trim())
      toast.dismiss(loadingToast)
      toast.success('Se o email existir, enviamos um link de recuperacao super admin.')
    } catch (error: any) {
      toast.dismiss(loadingToast)
      const message = error?.response?.data?.message || 'Nao foi possivel enviar o link de recuperacao.'
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
            <CardTitle className="text-2xl">Recuperar senha Super Admin</CardTitle>
            <CardDescription>
              Informe o email atual de acesso do Super Admin para receber o link seguro de redefinicao.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="super-admin-forgot-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="super-admin-forgot-email"
                    type="email"
                    className="pl-9"
                    placeholder="superadmin@ultrazend.com.br"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Este email deve ser o mesmo configurado no perfil do Super Admin.
                </p>
              </div>

              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar link de recuperacao'}
              </Button>
            </form>

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
