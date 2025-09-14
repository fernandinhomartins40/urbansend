import axios from 'axios'
import toast from 'react-hot-toast'

// Debounce system to prevent multiple session expired toasts
let sessionExpiredToastShown = false
let sessionExpiredTimeout: NodeJS.Timeout | null = null

const showSessionExpiredToast = () => {
  if (sessionExpiredToastShown) return
  
  sessionExpiredToastShown = true
  toast.error('Sua sessão expirou. Faça login novamente.')
  
  // Reset the flag after 5 seconds to allow new toasts if needed
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
  withCredentials: true, // Enable cookies to be sent with requests
})

// Request interceptor for API keys (cookies handled automatically)
api.interceptors.request.use(
  (config) => {
    // Only add API key header if explicitly needed (for programmatic API access)
    const apiKey = localStorage.getItem('api_key')
    if (apiKey && config.headers['x-api-key-override']) {
      config.headers['x-api-key'] = apiKey
      delete config.headers['x-api-key-override']
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    // Reset session expired toast system on successful responses
    resetSessionExpiredToast()
    return response
  },
  async (error) => {
    
    if (error.response?.status === 401 && !error.config._retry) {
      // Mark this request as a retry to prevent infinite loops
      error.config._retry = true;
      
      // Don't try to refresh if this was already a refresh request
      if (error.config.url?.includes('/auth/refresh')) {
        // Refresh failed, trigger logout with debounced toast
        if (window.location.pathname !== '/login') {
          showSessionExpiredToast()
          const event = new CustomEvent('auth:session-expired');
          window.dispatchEvent(event);
        }
        return Promise.reject(error);
      }
      
      // Don't try to refresh for initial login/registration attempts
      if (error.config.url?.includes('/auth/login') || 
          error.config.url?.includes('/auth/register') ||
          error.config.url?.includes('/auth/verify-email') ||
          error.config.url?.includes('/auth/forgot-password') ||
          error.config.url?.includes('/auth/reset-password')) {
        // These are authentication endpoints that don't need refresh
        return Promise.reject(error);
      }
      
      // Only try refresh if we're on a protected route and potentially had a session
      const isPublicPage = ['/', '/login', '/admin/login', '/verify-email', '/forgot-password'].includes(window.location.pathname)
      if (isPublicPage) {
        // On public pages, don't try to refresh - just let the error through
        return Promise.reject(error);
      }
      
      // Try to refresh token for authenticated routes
      try {
        await api.post('/auth/refresh')
        // If refresh successful, retry the original request
        // Also reset the toast system since session is now valid
        resetSessionExpiredToast()
        return api.request(error.config)
      } catch (refreshError) {
        // Refresh failed, trigger logout with debounced toast
        if (window.location.pathname !== '/login') {
          showSessionExpiredToast()
          const event = new CustomEvent('auth:session-expired');
          window.dispatchEvent(event);
        }
        return Promise.reject(refreshError);
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

// Auth API
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

// Email API - ARQUITETURA SIMPLIFICADA V3
export const emailApi = {
  send: (data: any) => {
    // 🔍 DEBUG: Log dados sendo enviados (V3)
    console.log('🔍 EMAIL API V3 DEBUG - Dados enviados:', JSON.stringify(data, null, 2))
    console.log('🔍 EMAIL API V3 DEBUG - Campos presentes:', Object.keys(data))
    console.log('🔍 EMAIL API V3 DEBUG - URL corrigida: /emails/send')
    // URL corrigida - remove /api duplicado (baseURL já inclui /api)
    return api.post('/emails/send', data)
  },

  sendBatch: (emails: any[]) =>
    // URL corrigida - remove /api duplicado
    api.post('/emails/send-batch', { emails }),

  getEmails: (params?: any) =>
    api.get('/emails', { params }),
  
  getEmail: (id: string) =>
    api.get(`/emails/${id}`),
  
  getEmailAnalytics: (id: string) =>
    api.get(`/emails/${id}/analytics`),
}

// Template API
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

// Shared Template API
export const sharedTemplateApi = {
  // Obter categorias de templates
  getCategories: () =>
    api.get('/shared-templates/categories'),

  // Obter templates públicos com filtros
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

  // Obter templates do sistema
  getSystemTemplates: (category?: string) =>
    api.get('/shared-templates/system', { params: { category } }),

  // Clonar um template
  cloneTemplate: (id: number, customizations: {
    name?: string;
    subject?: string;
    description?: string;
    category?: string;
    industry?: string;
    tags?: string[];
  }) =>
    api.post(`/shared-templates/${id}/clone`, customizations),

  // Favoritar/desfavoritar template
  toggleFavorite: (id: number) =>
    api.post(`/shared-templates/${id}/favorite`),

  // Obter templates favoritos do usuário
  getFavoriteTemplates: (page?: number, limit?: number) =>
    api.get('/shared-templates/favorites', { params: { page, limit } }),

  // Obter estatísticas de um template
  getTemplateStats: (id: number) =>
    api.get(`/shared-templates/${id}/stats`),

  // Registrar uso de template
  recordUsage: (id: number) =>
    api.post(`/shared-templates/${id}/record-usage`),

  // === FASE 3: FUNCIONALIDADES AVANÇADAS ===

  // Avaliar um template
  rateTemplate: (id: number, data: { rating: number; review?: string }) =>
    api.post(`/shared-templates/${id}/rate`, data),

  // Obter reviews de um template
  getTemplateReviews: (id: number, page?: number, limit?: number) =>
    api.get(`/shared-templates/${id}/reviews`, { params: { page, limit } }),

  // === COLEÇÕES ===

  // Obter coleções
  getCollections: (params?: { public?: boolean; page?: number; limit?: number }) =>
    api.get('/shared-templates/collections', { params }),

  // Criar nova coleção
  createCollection: (data: { name: string; description?: string; is_public: boolean }) =>
    api.post('/shared-templates/collections', data),

  // Obter uma coleção específica
  getCollection: (id: number) =>
    api.get(`/shared-templates/collections/${id}`),

  // Adicionar template à coleção
  addTemplateToCollection: (collectionId: number, templateId: number) =>
    api.post(`/shared-templates/collections/${collectionId}/add-template`, { template_id: templateId }),

  // Remover template da coleção
  removeTemplateFromCollection: (collectionId: number, templateId: number) =>
    api.delete(`/shared-templates/collections/${collectionId}/remove-template/${templateId}`),

  // === ANALYTICS E FUNCIONALIDADES PREMIUM ===

  // Busca inteligente (preparação para IA)
  smartSearch: (query: string) =>
    api.get('/shared-templates/public', { params: { search: query, sort_by: 'rating' } }),

  // Export de templates em bulk
  exportTemplates: (templateIds: number[]) =>
    api.post('/shared-templates/export', { template_ids: templateIds }, { responseType: 'blob' }),

  // Import de templates em bulk
  importTemplates: (templates: any[]) =>
    api.post('/shared-templates/import', { templates }),

  // Analytics avançadas
  getTemplateAnalytics: (templateId?: number) =>
    api.get('/shared-templates/analytics', { params: { template_id: templateId } }),

  // Templates populares/trending
  getTrendingTemplates: (period: 'day' | 'week' | 'month' = 'week') =>
    api.get('/shared-templates/trending', { params: { period } }),
}

// API Key API
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

// Domain API
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

// Analytics API
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
  
  getDomains: () =>
    api.get('/analytics/domains'),
}

// Webhook API
export const webhookApi = {
  getWebhooks: () =>
    api.get('/webhooks'),
  
  createWebhook: (data: { webhook_url: string; events: string[]; secret?: string }) =>
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