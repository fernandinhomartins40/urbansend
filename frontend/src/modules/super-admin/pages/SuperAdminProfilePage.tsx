import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi, superAdminApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import type { SuperAdminProfile } from '../types'

export function SuperAdminProfilePage() {
  const queryClient = useQueryClient()
  const updateUser = useAuthStore((state) => state.updateUser)

  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const profileQuery = useQuery({
    queryKey: ['super-admin', 'profile'],
    queryFn: async () => (await superAdminApi.getProfile()).data.data as SuperAdminProfile
  })

  useEffect(() => {
    if (profileQuery.data) {
      setProfileName(profileQuery.data.name || '')
      setProfileEmail(profileQuery.data.email || '')
    }
  }, [profileQuery.data])

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = profileName.trim()
      const normalizedEmail = profileEmail.trim().toLowerCase()
      if (!trimmedName || trimmedName.length < 2) {
        throw new Error('Informe um nome valido com no minimo 2 caracteres.')
      }
      if (!normalizedEmail) {
        throw new Error('Informe um email valido para o super admin.')
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error('Informe um email valido.')
      }

      return (await superAdminApi.updateProfile({
        name: trimmedName,
        email: normalizedEmail
      })).data.data as SuperAdminProfile
    },
    onSuccess: async (updatedProfile) => {
      setProfileName(updatedProfile.name || '')
      setProfileEmail(updatedProfile.email || '')
      updateUser({ name: updatedProfile.name, email: updatedProfile.email })
      toast.success('Perfil do super admin atualizado com sucesso.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'profile'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      ])
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Falha ao atualizar perfil.')
    }
  })

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new Error('Preencha todos os campos de senha.')
      }

      if (newPassword.length < 8) {
        throw new Error('A nova senha deve ter no minimo 8 caracteres.')
      }

      if (newPassword !== confirmPassword) {
        throw new Error('A confirmacao da senha nao corresponde.')
      }

      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      })
    },
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Senha alterada com sucesso.')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Falha ao alterar senha.')
    }
  })

  const profile = profileQuery.data
  const hasProfileChanges = Boolean(profile) && (
    profileName.trim() !== String(profile?.name || '').trim()
    || profileEmail.trim().toLowerCase() !== String(profile?.email || '').trim().toLowerCase()
  )

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-cyan-50 to-emerald-50 p-5">
        <h2 className="text-xl font-semibold text-slate-900">Perfil do Super Admin</h2>
        <p className="mt-1 text-sm text-slate-600">
          Atualize seus dados de acesso do painel administrativo global.
        </p>
      </section>

      <Card className="border-indigo-200">
        <CardHeader>
          <CardTitle>Dados da conta</CardTitle>
          <CardDescription>
            Gerencie as informacoes principais do seu perfil super admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileQuery.isLoading && (
            <div className="text-sm text-muted-foreground">Carregando perfil...</div>
          )}

          {profile && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={profile.is_verified ? 'success' : 'secondary'}>
                  {profile.is_verified ? 'Email verificado' : 'Email nao verificado'}
                </Badge>
                <Badge variant={profile.profile_is_active ? 'success' : 'destructive'}>
                  {profile.profile_is_active ? 'Perfil ativo' : 'Perfil bloqueado'}
                </Badge>
                <Badge variant="outline">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  {profile.role}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="super-admin-profile-name">Nome</Label>
                  <Input
                    id="super-admin-profile-name"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="super-admin-profile-email">Email</Label>
                  <Input
                    id="super-admin-profile-email"
                    type="email"
                    value={profileEmail}
                    onChange={(event) => setProfileEmail(event.target.value)}
                    placeholder="email@dominio.com"
                  />
                </div>
              </div>

              <Button
                onClick={() => updateProfileMutation.mutate()}
                disabled={updateProfileMutation.isPending || !profileName.trim() || !profileEmail.trim() || !hasProfileChanges}
              >
                {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar alteracoes de perfil
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200">
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>
            Atualize a senha da sessao atual do super admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="super-admin-current-password">Senha atual</Label>
              <div className="relative">
                <Input
                  id="super-admin-current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  className="pr-9"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowCurrentPassword((current) => !current)}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="super-admin-new-password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="super-admin-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="pr-9"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowNewPassword((current) => !current)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="super-admin-confirm-password">Confirmar nova senha</Label>
              <div className="relative">
                <Input
                  id="super-admin-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="pr-9"
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
          </div>

          <Button
            variant="outline"
            onClick={() => changePasswordMutation.mutate()}
            disabled={changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Atualizar senha
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
