import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Save, Shield, User as UserIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { authApi, settingsApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface SettingsState {
  notification_preferences: Record<string, boolean>
  system_preferences: {
    language: string
    timezone: string
    items_per_page: number
    auto_refresh: boolean
    auto_refresh_interval: number
  }
  analytics_settings: {
    default_time_range: '24h' | '7d' | '30d' | '90d'
    track_opens: boolean
    track_clicks: boolean
  }
}

const defaultSettings: SettingsState = {
  notification_preferences: {
    email_delivery_reports: true,
    bounce_notifications: true,
    daily_summary: true,
    weekly_reports: false,
    security_alerts: true,
    webhook_failures: true,
  },
  system_preferences: {
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    items_per_page: 20,
    auto_refresh: true,
    auto_refresh_interval: 30000,
  },
  analytics_settings: {
    default_time_range: '30d',
    track_opens: true,
    track_clicks: true,
  },
}

export function Settings() {
  const updateUser = useAuthStore((state) => state.updateUser)
  const [profileForm, setProfileForm] = useState({ name: '', email: '' })
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [settingsForm, setSettingsForm] = useState<SettingsState>(defaultSettings)

  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.getProfile(),
  })

  const { data: settingsResponse, isLoading: settingsLoading, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getSettings(),
  })

  useEffect(() => {
    const user = profileResponse?.data?.user
    if (!user) {
      return
    }

    setProfileForm({
      name: user.name || '',
      email: user.email || '',
    })
  }, [profileResponse])

  useEffect(() => {
    const settings = settingsResponse?.data?.settings
    if (!settings) {
      return
    }

    setSettingsForm({
      notification_preferences: {
        ...defaultSettings.notification_preferences,
        ...settings.notification_preferences,
      },
      system_preferences: {
        ...defaultSettings.system_preferences,
        ...settings.system_preferences,
      },
      analytics_settings: {
        ...defaultSettings.analytics_settings,
        ...settings.analytics_settings,
      },
    })
  }, [settingsResponse])

  const updateProfileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({ name: profileForm.name.trim() }),
    onSuccess: (response) => {
      updateUser(response.data.user)
      toast.success('Perfil atualizado')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Falha ao atualizar perfil')
    },
  })

  const updatePasswordMutation = useMutation({
    mutationFn: () =>
      authApi.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      }),
    onSuccess: () => {
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
      toast.success('Senha atualizada')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Falha ao atualizar senha')
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({
        notification_preferences: settingsForm.notification_preferences,
        system_preferences: settingsForm.system_preferences,
        analytics_settings: settingsForm.analytics_settings,
      }),
    onSuccess: () => {
      refetchSettings()
      toast.success('Preferencias atualizadas')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Falha ao salvar configuracoes')
    },
  })

  const loading = profileLoading || settingsLoading

  const handleNotificationToggle = (key: string, value: boolean) => {
    setSettingsForm((current) => ({
      ...current,
      notification_preferences: {
        ...current.notification_preferences,
        [key]: value,
      },
    }))
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando configuracoes...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Ajuste conta, seguranca e preferencias operacionais.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Perfil
            </CardTitle>
            <CardDescription>Dados basicos usados na conta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="settings-name">Nome</Label>
              <Input
                id="settings-name"
                value={profileForm.name}
                onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="settings-email">Email</Label>
              <Input id="settings-email" value={profileForm.email} disabled />
            </div>
            <Button onClick={() => updateProfileMutation.mutate()} disabled={updateProfileMutation.isPending || !profileForm.name.trim()}>
              <Save className="mr-2 h-4 w-4" />
              {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar perfil'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Seguranca
            </CardTitle>
            <CardDescription>Troca de senha da conta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="current-password">Senha atual</Label>
              <Input
                id="current-password"
                type="password"
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
              />
            </div>
            <Button
              onClick={() => {
                if (passwordForm.new_password.length < 8) {
                  toast.error('A nova senha precisa ter ao menos 8 caracteres')
                  return
                }
                if (passwordForm.new_password !== passwordForm.confirm_password) {
                  toast.error('A confirmacao da senha nao confere')
                  return
                }
                updatePasswordMutation.mutate()
              }}
              disabled={updatePasswordMutation.isPending}
            >
              <Shield className="mr-2 h-4 w-4" />
              {updatePasswordMutation.isPending ? 'Atualizando...' : 'Atualizar senha'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sistema</CardTitle>
            <CardDescription>Preferencias de idioma, pagina e atualizacao.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Idioma</Label>
                <Select
                  value={settingsForm.system_preferences.language}
                  onValueChange={(value) =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: { ...current.system_preferences, language: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt-BR">Portugues</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timezone</Label>
                <Select
                  value={settingsForm.system_preferences.timezone}
                  onValueChange={(value) =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: { ...current.system_preferences, timezone: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Sao_Paulo">America/Sao_Paulo</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="items-per-page">Itens por pagina</Label>
                <Input
                  id="items-per-page"
                  type="number"
                  min={5}
                  max={100}
                  value={settingsForm.system_preferences.items_per_page}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: {
                        ...current.system_preferences,
                        items_per_page: Number(event.target.value || 20),
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="refresh-interval">Intervalo de refresh (ms)</Label>
                <Input
                  id="refresh-interval"
                  type="number"
                  min={5000}
                  max={300000}
                  step={5000}
                  value={settingsForm.system_preferences.auto_refresh_interval}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: {
                        ...current.system_preferences,
                        auto_refresh_interval: Number(event.target.value || 30000),
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Atualizacao automatica</div>
                <div className="text-sm text-muted-foreground">Usada nas listas e dashboards.</div>
              </div>
              <Switch
                checked={settingsForm.system_preferences.auto_refresh}
                onCheckedChange={(value) =>
                  setSettingsForm((current) => ({
                    ...current,
                    system_preferences: { ...current.system_preferences, auto_refresh: value },
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notificacoes e analytics</CardTitle>
            <CardDescription>Controle o que a plataforma acompanha e envia para voce.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ['email_delivery_reports', 'Relatorios de entrega'],
              ['bounce_notifications', 'Alertas de bounce'],
              ['daily_summary', 'Resumo diario'],
              ['weekly_reports', 'Resumo semanal'],
              ['security_alerts', 'Alertas de seguranca'],
              ['webhook_failures', 'Falhas de webhook'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <div className="font-medium">{label}</div>
                <Switch
                  checked={Boolean(settingsForm.notification_preferences[key])}
                  onCheckedChange={(value) => handleNotificationToggle(key, value)}
                />
              </div>
            ))}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Periodo padrao</Label>
                <Select
                  value={settingsForm.analytics_settings.default_time_range}
                  onValueChange={(value: '24h' | '7d' | '30d' | '90d') =>
                    setSettingsForm((current) => ({
                      ...current,
                      analytics_settings: { ...current.analytics_settings, default_time_range: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7 dias</SelectItem>
                    <SelectItem value="30d">30 dias</SelectItem>
                    <SelectItem value="90d">90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Track opens</span>
                  <Switch
                    checked={settingsForm.analytics_settings.track_opens}
                    onCheckedChange={(value) =>
                      setSettingsForm((current) => ({
                        ...current,
                        analytics_settings: { ...current.analytics_settings, track_opens: value },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Track clicks</span>
                  <Switch
                    checked={settingsForm.analytics_settings.track_clicks}
                    onCheckedChange={(value) =>
                      setSettingsForm((current) => ({
                        ...current,
                        analytics_settings: { ...current.analytics_settings, track_clicks: value },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => updateSettingsMutation.mutate()} disabled={updateSettingsMutation.isPending}>
        <Save className="mr-2 h-4 w-4" />
        {updateSettingsMutation.isPending ? 'Salvando...' : 'Salvar preferencias'}
      </Button>
    </div>
  )
}

export default Settings
