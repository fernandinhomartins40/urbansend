export interface OverviewData {
  accounts: { total: number; active: number }
  users: { total: number; active: number }
  deliverability: {
    total_domains: number
    verified_domains: number
    emails_last_24h: number
    failed_last_24h: number
    success_rate_24h: number
  }
  alerts: { active: number }
  generated_at: string
}

export interface SuperAdminProfile {
  id: number
  name: string
  email: string
  is_active: boolean
  is_verified: boolean
  is_superadmin: boolean
  role: string
  mfa_required: boolean
  profile_is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface AccountRow {
  id: number
  name: string
  email: string
  is_active: boolean
  is_suspended?: boolean
  email_sending_blocked?: boolean
  is_under_review?: boolean
  plan_name?: string
  monthly_email_limit?: number
  created_at: string
}

export interface UserRow {
  id: number
  name: string
  email: string
  is_active: boolean
  is_admin: boolean
  is_verified: boolean
  created_at: string
}

export interface DeliverabilityRow {
  domain: string
  total: number
  failed: number
  successful: number
  delivery_rate: number
  failure_rate: number
}

export interface IntegrationOverview {
  webhooks_total: number
  webhook_failures_24h: number
  active_api_keys: number
}

export interface AuditLogRow {
  id: number
  action: string
  target_type: string
  target_id: string | null
  reason: string | null
  ip_address: string | null
  created_at: string
}

export interface Pagination {
  page: number
  total_pages: number
  total: number
}

export interface Paginated<T> {
  data: T[]
  pagination: Pagination
}
