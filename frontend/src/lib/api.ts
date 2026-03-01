import axios from 'axios'
import toast from 'react-hot-toast'

let sessionExpiredToastShown = false
let sessionExpiredTimeout: NodeJS.Timeout | null = null

const showSessionExpiredToast = () => {
  if (sessionExpiredToastShown) {
    return
  }

  sessionExpiredToastShown = true
  toast.error('Sua sessão expirou. Faça login novamente.')

  sessionExpiredTimeout = setTimeout(() => {
    sessionExpiredToastShown = false
  }, 5000)
}

const resetSessionExpiredToast = () => {
  sessionExpiredToastShown = false

  if (sessionExpiredTimeout) {
    clearTimeout(sessionExpiredTimeout)
    sessionExpiredTimeout = null
  }
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || ''

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

api.interceptors.request.use(
  (config) => {
    const apiKey = localStorage.getItem('api_key')

    if (apiKey && config.headers['x-api-key-override']) {
      config.headers['x-api-key'] = apiKey
      delete config.headers['x-api-key-override']
    }

    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => {
    resetSessionExpiredToast()
    return response
  },
  async (error) => {
    if (error.response?.status === 401 && !error.config?._retry) {
      error.config._retry = true

      if (error.config.url?.includes('/auth/refresh')) {
        if (window.location.pathname !== '/login') {
          showSessionExpiredToast()
          window.dispatchEvent(new CustomEvent('auth:session-expired'))
        }

        return Promise.reject(error)
      }

      if (
        error.config.url?.includes('/auth/login') ||
        error.config.url?.includes('/auth/register') ||
        error.config.url?.includes('/auth/verify-email') ||
        error.config.url?.includes('/auth/forgot-password') ||
        error.config.url?.includes('/auth/reset-password')
      ) {
        return Promise.reject(error)
      }

      const isPublicPage = ['/', '/login', '/admin/login', '/verify-email', '/forgot-password', '/reset-password'].includes(window.location.pathname)

      if (isPublicPage) {
        return Promise.reject(error)
      }

      try {
        await api.post('/auth/refresh')
        resetSessionExpiredToast()
        return api.request(error.config)
      } catch (refreshError) {
        if (window.location.pathname !== '/login') {
          showSessionExpiredToast()
          window.dispatchEvent(new CustomEvent('auth:session-expired'))
        }

        return Promise.reject(refreshError)
      }
    }

    if (error.response?.data?.message) {
      toast.error(error.response.data.message)
    } else if (error.message) {
      toast.error(error.message)
    }

    return Promise.reject(error)
  }
)

export const authApi = {
  login: (credentials: { email: string; password: string }) =>
    api.post('/auth/login', credentials),

  logout: () =>
    api.post('/auth/logout'),

  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data),

  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }),

  resendVerificationEmail: (email: string) =>
    api.post('/auth/resend-verification', { email }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),

  refreshToken: () =>
    api.post('/auth/refresh'),

  getProfile: () =>
    api.get('/auth/profile'),

  updateProfile: (data: { name: string }) =>
    api.put('/auth/profile', data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),
}

export const emailApi = {
  send: (data: any) =>
    api.post('/emails/send', data),

  sendBatch: (emails: any[]) =>
    api.post('/emails/send-batch', { emails }),

  getEmails: (params?: any) =>
    api.get('/emails', { params }),

  getEmail: (id: string | number) =>
    api.get(`/emails/${id}`),

  getEmailAnalytics: (id: string | number) =>
    api.get(`/emails/${id}/analytics`),

  getEmailStats: (period: string = '30d') =>
    api.get('/analytics/overview', { params: { period } }),

  deleteEmail: (id: string | number) =>
    api.delete(`/emails/${id}`),
}

export const templateApi = {
  getTemplates: () =>
    api.get('/templates'),

  createTemplate: (data: any) =>
    api.post('/templates', data),

  getTemplate: (id: string) =>
    api.get(`/templates/${id}`),

  updateTemplate: (id: string, data: any) =>
    api.put(`/templates/${id}`, data),

  deleteTemplate: (id: string) =>
    api.delete(`/templates/${id}`),
}

export const sharedTemplateApi = {
  getCategories: () =>
    api.get('/shared-templates/categories'),

  getPublicTemplates: (filters?: {
    category?: string;
    industry?: string;
    difficulty?: 'easy' | 'medium' | 'advanced';
    template_type?: 'user' | 'system' | 'shared';
    search?: string;
    min_rating?: number;
    sort_by?: 'rating' | 'usage' | 'date' | 'name';
    sort_order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) =>
    api.get('/shared-templates/public', { params: filters }),

  getSystemTemplates: (category?: string) =>
    api.get('/shared-templates/system', { params: { category } }),

  cloneTemplate: (id: number, customizations: {
    name?: string;
    subject?: string;
    description?: string;
    category?: string;
    industry?: string;
    tags?: string[];
  }) =>
    api.post(`/shared-templates/${id}/clone`, customizations),

  toggleFavorite: (id: number) =>
    api.post(`/shared-templates/${id}/favorite`),

  getFavoriteTemplates: (page?: number, limit?: number) =>
    api.get('/shared-templates/favorites', { params: { page, limit } }),

  getTemplateStats: (id: number) =>
    api.get(`/shared-templates/${id}/stats`),

  recordUsage: (id: number) =>
    api.post(`/shared-templates/${id}/record-usage`),

  rateTemplate: (id: number, data: { rating: number; review?: string }) =>
    api.post(`/shared-templates/${id}/rate`, data),

  getTemplateReviews: (id: number, page?: number, limit?: number) =>
    api.get(`/shared-templates/${id}/reviews`, { params: { page, limit } }),

  getCollections: (params?: { public?: boolean; page?: number; limit?: number }) =>
    api.get('/shared-templates/collections', { params }),

  createCollection: (data: { name: string; description?: string; is_public: boolean }) =>
    api.post('/shared-templates/collections', data),

  getCollection: (id: number) =>
    api.get(`/shared-templates/collections/${id}`),

  addTemplateToCollection: (collectionId: number, templateId: number) =>
    api.post(`/shared-templates/collections/${collectionId}/add-template`, { template_id: templateId }),

  removeTemplateFromCollection: (collectionId: number, templateId: number) =>
    api.delete(`/shared-templates/collections/${collectionId}/remove-template/${templateId}`),

  smartSearch: (query: string) =>
    api.get('/shared-templates/public', { params: { search: query, sort_by: 'rating' } }),

  exportTemplates: (templateIds: number[]) =>
    api.post('/shared-templates/export', { template_ids: templateIds }, { responseType: 'blob' }),

  importTemplates: (templates: any[]) =>
    api.post('/shared-templates/import', { templates }),

  getTemplateAnalytics: (templateId?: number) =>
    api.get('/shared-templates/analytics', { params: { template_id: templateId } }),

  getTrendingTemplates: (period: 'day' | 'week' | 'month' = 'week') =>
    api.get('/shared-templates/trending', { params: { period } }),
}

export const apiKeyApi = {
  getApiKeys: () =>
    api.get('/keys'),

  createApiKey: (data: { key_name: string; permissions: string[] }) =>
    api.post('/keys', data),

  updateApiKey: (id: string, data: any) =>
    api.put(`/keys/${id}`, data),

  deleteApiKey: (id: string) =>
    api.delete(`/keys/${id}`),

  regenerateApiKey: (id: string) =>
    api.post(`/keys/${id}/regenerate`),

  toggleApiKey: (id: string) =>
    api.post(`/keys/${id}/toggle`),

  getApiKeyUsage: (id: string) =>
    api.get(`/keys/${id}/usage`),
}

export const domainApi = {
  getDomains: () =>
    api.get('/domains'),

  addDomain: (data: { domain_name: string; region: string }) =>
    api.post('/domains', data),

  getDomainDetails: (id: string) =>
    api.get(`/domains/${id}`),

  verifyDomain: (id: string) =>
    api.post(`/domains/${id}/verify`),

  deleteDomain: (id: string) =>
    api.delete(`/domains/${id}`),
}

export const analyticsApi = {
  getAnalytics: (params?: { timeRange?: string }) =>
    api.get('/analytics', { params }),

  getAnalyticsChart: (params?: { timeRange?: string }) =>
    api.get('/analytics/chart', { params }),

  getTopEmails: (params?: { timeRange?: string }) =>
    api.get('/analytics/top-emails', { params }),

  getOverview: (period?: string) =>
    api.get('/analytics/overview', { params: { period } }),

  getEmails: (params?: any) =>
    api.get('/analytics/emails', { params }),

  getDomains: (params?: { timeRange?: string }) =>
    api.get('/analytics/domains', { params }),

  getRecentActivity: () =>
    api.get('/analytics/recent-activity'),
}

export const webhookApi = {
  getWebhooks: () =>
    api.get('/webhooks'),

  createWebhook: (data: { webhook_url: string; events: string[]; secret?: string; name?: string }) =>
    api.post('/webhooks', data),

  updateWebhook: (id: string, data: any) =>
    api.put(`/webhooks/${id}`, data),

  deleteWebhook: (id: string) =>
    api.delete(`/webhooks/${id}`),

  getWebhookLogs: (id: string, filters?: { status?: string; event_type?: string }) =>
    api.get(`/webhooks/${id}/logs`, { params: filters }),

  testWebhook: (id: string) =>
    api.post(`/webhooks/${id}/test`),
}

export const settingsApi = {
  getSettings: () =>
    api.get('/settings'),

  updateSettings: (data: {
    notification_preferences?: Record<string, boolean>;
    system_preferences?: Record<string, string | number | boolean>;
    branding_settings?: Record<string, string>;
    analytics_settings?: Record<string, string | boolean>;
  }) =>
    api.put('/settings', data),
}
