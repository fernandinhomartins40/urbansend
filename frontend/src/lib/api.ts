import axios from 'axios'
import toast from 'react-hot-toast'

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || ''

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
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
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token first
      try {
        await api.post('/auth/refresh')
        // If refresh successful, retry the original request
        return api.request(error.config)
      } catch (refreshError) {
        // Refresh failed, redirect to login
        if (window.location.pathname !== '/login') {
          toast.error('Sua sessão expirou. Faça login novamente.')
          // Use React Router navigation instead of direct location change
          const event = new CustomEvent('auth:session-expired');
          window.dispatchEvent(event);
        }
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

// Email API
export const emailApi = {
  send: (data: any) =>
    api.post('/emails/send', data),
  
  sendBatch: (emails: any[]) =>
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