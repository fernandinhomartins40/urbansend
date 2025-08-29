import { http, HttpResponse } from 'msw'

// Mock handlers for API requests during testing
export const handlers = [
  // Auth handlers
  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      message: 'Login successful',
      user: {
        id: 1,
        email: 'test@example.com',
        name: 'Test User'
      }
    })
  }),

  http.post('/api/auth/refresh', () => {
    return HttpResponse.json({
      message: 'Token refreshed'
    })
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({
      message: 'Logout successful'
    })
  }),

  // Dashboard/Analytics handlers
  http.get('/api/analytics/overview', () => {
    return HttpResponse.json({
      data: {
        stats: {
          totalEmails: 1250,
          deliveryRate: 95.8,
          openRate: 24.5,
          bounceRate: 2.1,
          emailsChange: 12.5,
          deliveryChange: 2.3,
          openChange: -1.2,
          bounceChange: -0.5
        }
      }
    })
  }),

  http.get('/api/analytics/recent-activity', () => {
    return HttpResponse.json({
      data: {
        activities: [
          {
            email: 'user@example.com',
            status: 'delivered',
            timestamp: new Date(Date.now() - 60000).toISOString()
          },
          {
            email: 'another@example.com',
            status: 'opened',
            timestamp: new Date(Date.now() - 120000).toISOString()
          }
        ]
      }
    })
  }),

  // Email handlers
  http.get('/api/emails', () => {
    return HttpResponse.json({
      data: {
        emails: [
          {
            id: 1,
            from_email: 'noreply@test.com',
            to_email: 'user@example.com',
            subject: 'Test Email',
            status: 'delivered',
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
        ],
        pagination: {
          page: 1,
          pages: 1,
          total: 1
        }
      }
    })
  }),

  // API Keys handlers
  http.get('/api/keys', () => {
    return HttpResponse.json({
      api_keys: [
        {
          id: 1,
          key_name: 'Test Key',
          key_preview: 'us_test_****',
          permissions: ['email:send'],
          is_active: true,
          last_used_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ],
      total: 1
    })
  }),

  // Templates handlers
  http.get('/api/templates', () => {
    return HttpResponse.json({
      data: {
        templates: [
          {
            id: 1,
            name: 'Welcome Email',
            subject: 'Welcome!',
            html_content: '<h1>Welcome</h1>',
            is_active: true,
            created_at: new Date().toISOString()
          }
        ],
        pagination: {
          page: 1,
          pages: 1,
          total: 1
        }
      }
    })
  }),

  // Domains handlers
  http.get('/api/domains', () => {
    return HttpResponse.json({
      data: {
        domains: [
          {
            id: 1,
            domain: 'example.com',
            status: 'verified',
            verification_token: 'token123',
            created_at: new Date().toISOString()
          }
        ],
        pagination: {
          page: 1,
          pages: 1,
          total: 1
        }
      }
    })
  }),

  // Webhooks handlers
  http.get('/api/webhooks', () => {
    return HttpResponse.json({
      data: {
        webhooks: [
          {
            id: 1,
            url: 'https://example.com/webhook',
            events: ['email.delivered'],
            is_active: true,
            created_at: new Date().toISOString()
          }
        ],
        pagination: {
          page: 1,
          pages: 1,
          total: 1
        }
      }
    })
  })
]