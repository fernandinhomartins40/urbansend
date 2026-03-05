type LoginScope = 'app' | 'super_admin'

interface LoginPreferences {
  rememberCredentials: boolean
  keepConnected: boolean
  email: string
  password: string
}

const LOGIN_PREFERENCES_KEY_PREFIX = 'auth-login-preferences'
export const AUTH_KEEP_CONNECTED_KEY = 'auth-keep-connected'

const isBrowser = typeof window !== 'undefined'

const getPreferenceKey = (scope: LoginScope) => `${LOGIN_PREFERENCES_KEY_PREFIX}:${scope}`

export const shouldKeepConnected = (): boolean => {
  if (!isBrowser) {
    return true
  }

  return window.localStorage.getItem(AUTH_KEEP_CONNECTED_KEY) !== 'false'
}

export const setKeepConnectedPreference = (keepConnected: boolean) => {
  if (!isBrowser) {
    return
  }

  window.localStorage.setItem(AUTH_KEEP_CONNECTED_KEY, keepConnected ? 'true' : 'false')
}

export const getLoginPreferences = (scope: LoginScope): LoginPreferences => {
  if (!isBrowser) {
    return {
      rememberCredentials: false,
      keepConnected: true,
      email: '',
      password: ''
    }
  }

  const keepConnected = shouldKeepConnected()
  const storedValue = window.localStorage.getItem(getPreferenceKey(scope))

  if (!storedValue) {
    return {
      rememberCredentials: false,
      keepConnected,
      email: '',
      password: ''
    }
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<LoginPreferences>
    return {
      rememberCredentials: Boolean(parsedValue.rememberCredentials),
      keepConnected,
      email: typeof parsedValue.email === 'string' ? parsedValue.email : '',
      password: typeof parsedValue.password === 'string' ? parsedValue.password : ''
    }
  } catch {
    return {
      rememberCredentials: false,
      keepConnected,
      email: '',
      password: ''
    }
  }
}

export const saveLoginPreferences = (
  scope: LoginScope,
  preferences: Pick<LoginPreferences, 'rememberCredentials' | 'keepConnected' | 'email' | 'password'>
) => {
  if (!isBrowser) {
    return
  }

  setKeepConnectedPreference(preferences.keepConnected)

  if (!preferences.rememberCredentials) {
    window.localStorage.removeItem(getPreferenceKey(scope))
    return
  }

  const payload: LoginPreferences = {
    rememberCredentials: true,
    keepConnected: preferences.keepConnected,
    email: preferences.email,
    password: preferences.password
  }

  window.localStorage.setItem(getPreferenceKey(scope), JSON.stringify(payload))
}
