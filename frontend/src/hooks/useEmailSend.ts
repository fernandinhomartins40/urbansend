import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { queryKeys } from '@/lib/queryClient'
import { useSecureNavigation } from './useSecureNavigation'

export interface EmailData {
  from: string
  to: string
  subject: string
  html?: string
  text?: string
  reply_to?: string
  variables?: Record<string, string>
  template_id?: string | number
  tracking_enabled?: boolean
}

export interface EmailSendResponse {
  success: boolean
  message: string
  message_id: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  domain_verified: boolean
  domain: string
  version: '3.0'
}

export interface EmailSendError {
  success: boolean
  error: string
  code: 'DOMAIN_NOT_VERIFIED' | 'INVALID_EMAIL_FORMAT' | 'EMAIL_SEND_ERROR' | 'RATE_LIMIT_EXCEEDED'
  redirect?: string
  domain?: string
  retryAfter?: number
  version: '3.0'
}

export function extractDomain(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null
  }

  const trimmedEmail = email.trim()
  const atIndex = trimmedEmail.lastIndexOf('@')

  if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
    return null
  }

  const domain = trimmedEmail.substring(atIndex + 1).toLowerCase()
  if (domain.length === 0 || domain.includes(' ') || !domain.includes('.')) {
    return null
  }

  return domain
}

export const useEmailSend = () => {
  const queryClient = useQueryClient()
  const { secureRedirect } = useSecureNavigation()

  return useMutation({
    mutationFn: async (emailData: EmailData): Promise<EmailSendResponse> => {
      const response = await api.post('/emails/send', emailData)
      return response.data
    },
    onMutate: async (emailData) => {
      const domain = extractDomain(emailData.from)

      if (!domain) {
        throw {
          success: false,
          error: 'Formato de email inválido no campo "from"',
          code: 'INVALID_EMAIL_FORMAT',
          version: '3.0',
        }
      }

      await queryClient.cancelQueries({ queryKey: queryKeys.emails.all })

      const previousEmails = queryClient.getQueriesData({
        queryKey: queryKeys.emails.all,
      })

      queryClient.setQueriesData(
        { queryKey: queryKeys.emails.lists() },
        (old: any) => {
          if (!old) {
            return old
          }

          const optimisticEmail = {
            id: Date.now(),
            from_email: emailData.from,
            to_email: emailData.to,
            subject: emailData.subject,
            status: 'pending' as const,
            created_at: new Date().toISOString(),
            domain_verified: true,
          }

          return {
            ...old,
            emails: [optimisticEmail, ...(old.emails || [])],
            stats: {
              ...old.stats,
              total: (old.stats?.total || 0) + 1,
            },
          }
        }
      )

      return { previousEmails }
    },
    onError: (error: any, _emailData, context) => {
      if (context?.previousEmails) {
        context.previousEmails.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }

      if (error.response?.data?.code === 'DOMAIN_NOT_VERIFIED') {
        const errorData: EmailSendError = error.response.data

        toast.error(`Domínio '${errorData.domain}' não verificado. Redirecionando para verificação...`, {
          duration: 4000,
        })

        setTimeout(() => {
          secureRedirect('/app/domains')
        }, 2000)

        return
      }

      if (error.response?.data?.code === 'RATE_LIMIT_EXCEEDED') {
        const errorData: EmailSendError = error.response.data
        const retryAfter = errorData.retryAfter || 60

        toast.error(`Rate limit excedido. Tente novamente em ${retryAfter} segundos.`, {
          duration: 4000,
        })
        return
      }

      if (error.response?.data?.code === 'INVALID_EMAIL_FORMAT') {
        toast.error('Formato de email inválido no campo "from"')
        return
      }

      const message = error.response?.data?.error || error.message || 'Erro ao enviar email'
      toast.error(`Erro no envio: ${message}`)
    },
    onSuccess: (data) => {
      toast.success(`Email enviado com sucesso. Domínio ${data.domain} verificado.`, {
        duration: 4000,
      })

      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    },
  })
}

export const useBatchEmailSend = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (emails: EmailData[]) => {
      const response = await api.post('/emails/send-batch', { emails })
      return response.data
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || error.message || 'Erro ao enviar emails em lote'
      toast.error(`Erro no envio em lote: ${message}`)
    },
    onSuccess: (data) => {
      if (data.failed_emails > 0) {
        toast(`Lote processado: ${data.successful_emails} enviados, ${data.failed_emails} falharam.`, {
          icon: '!',
          duration: 5000,
        })
      } else {
        toast.success(`Lote enviado com sucesso. ${data.successful_emails} emails processados.`)
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    },
  })
}

export const useTestEmailService = () => {
  return useMutation({
    mutationFn: async () => {
      const response = await api.get('/emails/test')
      return response.data
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Erro ao testar serviço de email'
      toast.error(message)
    },
    onSuccess: (data) => {
      const status = data.success ? 'Funcionando' : 'Com problemas'
      toast.success(`Teste do serviço: ${status}`)
    },
  })
}

export const useEmailServiceStatus = () => {
  return useMutation({
    mutationFn: async () => {
      const response = await api.get('/emails/status')
      return response.data
    },
    onSuccess: (data) => {
      toast.success(`Sistema ativo - ${data.architecture}`, { duration: 3000 })
    },
  })
}
