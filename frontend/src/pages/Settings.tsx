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
import { Textarea } from '@/components/ui/textarea'
import { authApi, settingsApi } from '@/lib/api'
import { useAuthStore, useSettingsStore, useThemeStore } from '@/lib/store'

interface SettingsState {
  notification_preferences: Record<string, boolean>
  system_preferences: {
    theme: 'light' | 'dark' | 'system'
    language: string
    timezone: string
    date_format: string
    time_format: '12h' | '24h'
    items_per_page: number
    auto_refresh: boolean
    auto_refresh_interval: number
  }
  branding_settings: {
    company_name: string
    footer_text: string
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
    theme: 'light',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    date_format: 'DD/MM/YYYY',
    time_format: '24h',
    items_per_page: 20,
    auto_refresh: true,
    auto_refresh_interval: 30000,
  },
  branding_settings: {
    company_name: '',
    footer_text: '',
  },
  analytics_settings: {
    default_time_range: '30d',
    track_opens: true,
    track_clicks: true,
  },
}

export function Settings() {
  const updateUser = useAuthStore((state) => state.updateUser)
  const updateAppSettings = useSettingsStore((state) => state.updateSettings)
  const setTheme = useThemeStore((state) => state.setTheme)
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
      branding_settings: {
        ...defaultSettings.branding_settings,
        ...settings.branding_settings,
      },
      analytics_settings: {
        ...defaultSettings.analytics_settings,
        ...settings.analytics_settings,
      },
    })
    updateAppSettings({
      emailsPerPage: settings.system_preferences?.items_per_page ?? defaultSettings.system_preferences.items_per_page,
      autoRefresh: settings.system_preferences?.auto_refresh ?? defaultSettings.system_preferences.auto_refresh,
      refreshInterval: settings.system_preferences?.auto_refresh_interval ?? defaultSettings.system_preferences.auto_refresh_interval,
      language: settings.system_preferences?.language ?? defaultSettings.system_preferences.language,
      analyticsDefaultTimeRange: settings.analytics_settings?.default_time_range ?? defaultSettings.analytics_settings.default_time_range,
      theme: settings.system_preferences?.theme ?? defaultSettings.system_preferences.theme,
      timezone: settings.system_preferences?.timezone ?? defaultSettings.system_preferences.timezone,
      dateFormat: settings.system_preferences?.date_format ?? defaultSettings.system_preferences.date_format,
      timeFormat: settings.system_preferences?.time_format ?? defaultSettings.system_preferences.time_format,
    })
    setTheme((settings.system_preferences?.theme ?? defaultSettings.system_preferences.theme) as 'light' | 'dark' | 'system')
  }, [setTheme, settingsResponse, updateAppSettings])

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
        branding_settings: settingsForm.branding_settings,
        analytics_settings: settingsForm.analytics_settings,
      }),
    onSuccess: () => {
      refetchSettings()
      updateAppSettings({
        emailsPerPage: settingsForm.system_preferences.items_per_page,
        autoRefresh: settingsForm.system_preferences.auto_refresh,
        refreshInterval: settingsForm.system_preferences.auto_refresh_interval,
        language: settingsForm.system_preferences.language as 'pt-BR' | 'en-US',
        analyticsDefaultTimeRange: settingsForm.analytics_settings.default_time_range,
        theme: settingsForm.system_preferences.theme,
        timezone: settingsForm.system_preferences.timezone,
        dateFormat: settingsForm.system_preferences.date_format,
        timeFormat: settingsForm.system_preferences.time_format,
      })
      setTheme(settingsForm.system_preferences.theme)
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
                <Label>Tema</Label>
                <Select
                  value={settingsForm.system_preferences.theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: { ...current.system_preferences, theme: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                    <SelectItem value="system">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                <Label>Formato de data</Label>
                <Select
                  value={settingsForm.system_preferences.date_format}
                  onValueChange={(value) =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: { ...current.system_preferences, date_format: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Formato de hora</Label>
                <Select
                  value={settingsForm.system_preferences.time_format}
                  onValueChange={(value: '12h' | '24h') =>
                    setSettingsForm((current) => ({
                      ...current,
                      system_preferences: { ...current.system_preferences, time_format: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24 horas</SelectItem>
                    <SelectItem value="12h">12 horas</SelectItem>
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

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Preferencias basicas de identidade usadas nos emails e na conta.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="branding-company-name">Nome da empresa</Label>
            <Input
              id="branding-company-name"
              value={settingsForm.branding_settings.company_name}
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  branding_settings: { ...current.branding_settings, company_name: event.target.value },
                }))
              }
              placeholder="Sua empresa"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="branding-footer-text">Texto de rodape</Label>
            <Textarea
              id="branding-footer-text"
              value={settingsForm.branding_settings.footer_text}
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  branding_settings: { ...current.branding_settings, footer_text: event.target.value },
                }))
              }
              placeholder="Mensagem padrao para rodape dos emails"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => updateSettingsMutation.mutate()} disabled={updateSettingsMutation.isPending}>
        <Save className="mr-2 h-4 w-4" />
        {updateSettingsMutation.isPending ? 'Salvando...' : 'Salvar preferencias'}
      </Button>
    </div>
  )
}

export default Settings
