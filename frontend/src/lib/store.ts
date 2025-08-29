import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface User {
  id: number
  name: string
  email: string
  is_verified: boolean
  plan_type: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      
      login: (user) => {
        set({ user, isAuthenticated: true })
      },
      
      logout: async () => {
        try {
          // Call logout API to clear httpOnly cookies
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
          })
        } catch (error) {
          console.error('Error during logout:', error)
        }
        
        set({ user: null, isAuthenticated: false })
        
        // Use custom event for secure navigation instead of direct location change
        const event = new CustomEvent('auth:logout');
        window.dispatchEvent(event);
      },
      
      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

interface SidebarState {
  isOpen: boolean
  toggle: () => void
  close: () => void
  open: () => void
}

export const useSidebarStore = create<SidebarState>()((set) => ({
  isOpen: true,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
}))

interface ThemeState {
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

interface EmailState {
  currentEmail: any | null
  drafts: any[]
  setCurrentEmail: (email: any) => void
  saveDraft: (draft: any) => void
  removeDraft: (id: string) => void
  clearDrafts: () => void
}

export const useEmailStore = create<EmailState>()((set) => ({
  currentEmail: null,
  drafts: [],
  
  setCurrentEmail: (email) => set({ currentEmail: email }),
  
  saveDraft: (draft) =>
    set((state) => ({
      drafts: [...state.drafts.filter(d => d.id !== draft.id), draft],
    })),
  
  removeDraft: (id) =>
    set((state) => ({
      drafts: state.drafts.filter(d => d.id !== id),
    })),
  
  clearDrafts: () => set({ drafts: [] }),
}))

interface NotificationState {
  notifications: Array<{
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    timestamp: Date
    read: boolean
  }>
  addNotification: (notification: Omit<NotificationState['notifications'][0], 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: Math.random().toString(36).substring(2, 15),
          timestamp: new Date(),
          read: false,
        },
        ...state.notifications,
      ].slice(0, 50), // Keep only last 50 notifications
    })),
  
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
  
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
    })),
  
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter(n => n.id !== id),
    })),
  
  clearNotifications: () => set({ notifications: [] }),
}))

interface SettingsState {
  settings: {
    emailsPerPage: number
    autoRefresh: boolean
    refreshInterval: number
    defaultEmailFormat: 'html' | 'text'
    enableNotifications: boolean
    language: 'pt-BR' | 'en-US'
  }
  updateSettings: (settings: Partial<SettingsState['settings']>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        emailsPerPage: 20,
        autoRefresh: true,
        refreshInterval: 30000, // 30 seconds
        defaultEmailFormat: 'html',
        enableNotifications: true,
        language: 'pt-BR',
      },
      
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)