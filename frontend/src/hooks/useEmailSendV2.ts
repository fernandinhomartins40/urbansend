import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { queryKeys } from '@/lib/queryClient'

/**
 * 🚀 HOOK USEEMAILSENDV2 - FASE 4 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Hook para envio de emails com validação de domínio integrada
 * Utiliza a nova rota /emails-v2/send que valida domínios antes do envio
 */

export interface EmailDataV2 {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  reply_to?: string
  variables?: Record<string, string>
  template_id?: number
  tracking_enabled?: boolean
}

export interface EmailSendV2Response {
  success: boolean
  message: string
  message_id: string
  job_id: string
  status: 'queued'
  domain_verified: boolean
  domain: string
  verified_at?: string
  phase: string
}

export interface EmailSendV2Error {
  error: string
  code: 'DOMAIN_NOT_VERIFIED' | 'INVALID_EMAIL_FORMAT' | 'EMAIL_SEND_ERROR'
  redirect?: string
  domain?: string
  verification_required?: boolean
  field?: string
}

/**
 * Extrair domínio do endereço de email
 * Utiliza a mesma lógica do backend para consistência
 */
export function extractDomain(email: string): string | null {
  try {
    if (!email || typeof email !== 'string') {
      return null
    }
    
    const trimmedEmail = email.trim()
    const atIndex = trimmedEmail.lastIndexOf('@')
    
    if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
      return null
    }
    
    const domain = trimmedEmail.substring(atIndex + 1).toLowerCase()
    
    // Validação básica do domínio
    if (domain.length === 0 || domain.includes(' ') || !domain.includes('.')) {
      return null
    }
    
    return domain
  } catch (error) {
    console.error('Failed to extract domain', { email, error })
    return null
  }
}

/**
 * Hook principal para envio de emails com validação de domínio
 */
export const useEmailSendV2 = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (emailData: EmailDataV2): Promise<EmailSendV2Response> => {
      console.log('🚀 EMAIL SEND V2 - Iniciando envio:', {
        from: emailData.from,
        to: Array.isArray(emailData.to) ? `${emailData.to.length} recipients` : emailData.to,
        subject: emailData.subject,
        domain: extractDomain(emailData.from)
      })

      const response = await api.post('/emails-v2/send-v2', emailData)
      return response.data
    },
    onMutate: async (emailData) => {
      // Validação prévia no cliente para UX mais rápida
      const domain = extractDomain(emailData.from)
      
      if (!domain) {
        throw {
          error: 'Formato de email inválido no campo "from"',
          code: 'INVALID_EMAIL_FORMAT',
          field: 'from'
        }
      }

      console.log('🔍 EMAIL SEND V2 - Validação prévia:', { domain, from: emailData.from })

      // Cancel any outgoing refetches for emails
      await queryClient.cancelQueries({ queryKey: queryKeys.emails.all })

      // Snapshot the previous value
      const previousEmails = queryClient.getQueriesData({ 
        queryKey: queryKeys.emails.all 
      })

      // Optimistically update email list if needed
      queryClient.setQueriesData(
        { queryKey: queryKeys.emails.lists() },
        (old: any) => {
          if (!old) return old
          
          const optimisticEmail = {
            id: Date.now(), // ID temporário
            from_email: emailData.from,
            to_email: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
            subject: emailData.subject,
            status: 'queued' as const,
            created_at: new Date().toISOString(),
            domain_verified: true,
          }

          return {
            ...old,
            data: {
              ...old.data,
              emails: [optimisticEmail, ...old.data.emails],
              stats: {
                ...old.data.stats,
                total: old.data.stats.total + 1
              }
            }
          }
        }
      )

      return { previousEmails, domain }
    },
    onError: (error: any, emailData, context) => {
      console.error('🔴 EMAIL SEND V2 - Erro:', error)

      // Rollback optimistic updates
      if (context?.previousEmails) {
        context.previousEmails.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }

      // Tratar erros específicos da validação de domínio
      if (error.response?.data?.code === 'DOMAIN_NOT_VERIFIED') {
        const errorData: EmailSendV2Error = error.response.data
        
        toast.error(`Domínio '${errorData.domain}' não verificado. Redirecionando para verificação...`, {
          duration: 4000,
        })
        
        // Aguardar um pouco para o usuário ler o toast, depois redirecionar
        setTimeout(() => {
          window.location.href = '/domains'
        }, 2000)
        
        return
      }

      if (error.response?.data?.code === 'INVALID_EMAIL_FORMAT') {
        toast.error('Formato de email inválido no campo "from"')
        return
      }

      // Erro genérico
      const message = error.response?.data?.error || error.message || 'Erro ao enviar email'
      toast.error(`Erro no envio: ${message}`)
    },
    onSuccess: (data, emailData) => {
      console.log('✅ EMAIL SEND V2 - Sucesso:', {
        message_id: data.message_id,
        domain: data.domain,
        domain_verified: data.domain_verified,
        verified_at: data.verified_at
      })

      toast.success(`Email enviado com sucesso! Domínio ${data.domain} verificado.`, {
        duration: 4000,
      })

      // Invalidar cache para atualizar listas
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    },
    onSettled: () => {
      // Always refresh email lists after success or error
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    }
  })
}

/**
 * Hook para envio em lote com validação de domínio
 */
export const useBatchEmailSendV2 = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (emails: EmailDataV2[]) => {
      console.log('🚀 BATCH EMAIL SEND V2 - Iniciando envio em lote:', {
        count: emails.length,
        domains: [...new Set(emails.map(e => extractDomain(e.from)).filter(Boolean))]
      })

      const response = await api.post('/emails-v2/send-v2-batch', { emails })
      return response.data
    },
    onError: (error: any) => {
      console.error('🔴 BATCH EMAIL SEND V2 - Erro:', error)
      
      const message = error.response?.data?.error || error.message || 'Erro ao enviar emails em lote'
      toast.error(`Erro no envio em lote: ${message}`)
    },
    onSuccess: (data) => {
      console.log('✅ BATCH EMAIL SEND V2 - Sucesso:', {
        total: data.total_emails,
        valid: data.valid_emails,
        failed: data.failed_emails,
        job_id: data.job_id
      })

      if (data.failed_emails > 0) {
        toast(`Lote processado: ${data.valid_emails} enviados, ${data.failed_emails} falharam`, {
          icon: '⚠️',
          duration: 5000,
        })
      } else {
        toast.success(`Lote enviado com sucesso! ${data.valid_emails} emails processados.`)
      }

      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.all })
    }
  })
}

/**
 * Hook para testar validação de domínio
 */
export const useTestDomainV2 = () => {
  return useMutation({
    mutationFn: async (domain: string) => {
      const response = await api.get(`/emails-v2/test-domain/${domain}`)
      return response.data
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Erro ao testar domínio'
      toast.error(message)
    },
    onSuccess: (data) => {
      const status = data.result.verified ? '✅ Verificado' : '❌ Não verificado'
      toast.success(`Teste de domínio: ${status}`)
    }
  })
}