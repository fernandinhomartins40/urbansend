import toast, { ToastOptions } from 'react-hot-toast'

// Configurações padrão para diferentes tipos de toast
// Os toasts leem os tokens do tema, entao acompanham light/dark sem duplicar paleta.
const defaultOptions: ToastOptions = {
  duration: 4000,
  style: {
    background: 'hsl(var(--popover))',
    color: 'hsl(var(--popover-foreground))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: 'var(--shadow-md)'
  }
}

const toneOptions = (token: string, duration: number): ToastOptions => ({
  ...defaultOptions,
  duration,
  style: {
    ...defaultOptions.style,
    border: `1px solid hsl(var(${token}) / .35)`,
    background: `hsl(var(${token}) / .08)`,
    color: `hsl(var(${token}))`
  }
})

const successOptions = toneOptions('--success', 3000)
const errorOptions = toneOptions('--destructive', 5000)
const warningOptions = toneOptions('--warning', 4000)
const infoOptions = toneOptions('--primary', 3000)

export interface UseToastReturn {
  // Métodos básicos
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
  loading: (message: string, options?: ToastOptions) => string
  
  // Métodos específicos para autenticação
  auth: {
    loginSuccess: (userName: string) => void
    loginError: (errorType: 'credentials' | 'verification' | 'generic', customMessage?: string) => void
    registerSuccess: () => void
    registerError: (errorType: 'exists' | 'validation' | 'password' | 'generic', customMessage?: string) => void
    verificationSuccess: () => void
    verificationError: (customMessage?: string) => void
    logoutSuccess: () => void
    passwordResetSent: () => void
    passwordResetSuccess: () => void
    passwordChangeSuccess: () => void
  }
  
  // Métodos para operações CRUD
  crud: {
    createSuccess: (entity: string) => void
    createError: (entity: string, customMessage?: string) => void
    updateSuccess: (entity: string) => void
    updateError: (entity: string, customMessage?: string) => void
    deleteSuccess: (entity: string) => void
    deleteError: (entity: string, customMessage?: string) => void
    fetchError: (entity: string, customMessage?: string) => void
  }
  
  // Métodos para operações específicas
  operations: {
    copySuccess: (item?: string) => void
    copyError: () => void
    exportSuccess: (format?: string) => void
    importSuccess: (format?: string) => void
    sendSuccess: (action?: string) => void
    sendError: (action?: string) => void
  }
  
  // Método para atualizar toast existente
  update: (toastId: string, message: string, type: 'success' | 'error' | 'loading') => void
  
  // Método para dismiss
  dismiss: (toastId?: string) => void
}

export const useToast = (): UseToastReturn => {
  // Métodos básicos
  const success = (message: string, options?: ToastOptions) => {
    toast.success(message, { ...successOptions, ...options })
  }

  const error = (message: string, options?: ToastOptions) => {
    toast.error(message, { ...errorOptions, ...options })
  }

  const warning = (message: string, options?: ToastOptions) => {
    toast(message, { 
      ...warningOptions, 
      ...options,
      icon: '⚠️'
    })
  }

  const info = (message: string, options?: ToastOptions) => {
    toast(message, {
      ...infoOptions,
      ...options,
      icon: 'ℹ️'
    })
  }

  const loading = (message: string, options?: ToastOptions): string => {
    return toast.loading(message, { ...defaultOptions, ...options })
  }

  // Métodos específicos para autenticação
  const auth = {
    loginSuccess: (userName: string) => {
      success(`🎉 Bem-vindo de volta, ${userName}!`)
    },
    
    loginError: (errorType: 'credentials' | 'verification' | 'generic', customMessage?: string) => {
      const messages = {
        credentials: '❌ Email ou senha incorretos. Verifique suas credenciais.',
        verification: '❌ Você precisa verificar seu email antes de fazer login. Verifique sua caixa de entrada.',
        generic: customMessage || '❌ Erro ao fazer login. Tente novamente.'
      }
      error(messages[errorType])
    },
    
    registerSuccess: () => {
      success('🎉 Usuário registrado com sucesso! Verifique seu email para confirmar sua conta.', { 
        duration: 6000 
      })
    },
    
    registerError: (errorType: 'exists' | 'validation' | 'password' | 'generic', customMessage?: string) => {
      const messages = {
        exists: '⚠️ Este email já está registrado. Tente fazer login ou use outro email.',
        validation: '❌ Dados inválidos. Verifique os campos e tente novamente.',
        password: '❌ Senha não atende aos requisitos mínimos de segurança.',
        generic: customMessage || '❌ Erro ao registrar usuário. Tente novamente.'
      }
      
      if (errorType === 'exists') {
        warning(messages[errorType])
      } else {
        error(messages[errorType])
      }
    },
    
    verificationSuccess: () => {
      success('✅ Email verificado com sucesso! Você já pode fazer login.')
    },
    
    verificationError: (customMessage?: string) => {
      error(customMessage || '❌ Token de verificação inválido ou expirado. Solicite um novo.')
    },
    
    logoutSuccess: () => {
      info('👋 Você foi desconectado com sucesso.')
    },
    
    passwordResetSent: () => {
      info('📧 Se sua conta existe, enviamos um link de recuperação para seu email.')
    },
    
    passwordResetSuccess: () => {
      success('🔐 Senha redefinida com sucesso! Você já pode fazer login.')
    },
    
    passwordChangeSuccess: () => {
      success('🔐 Senha alterada com sucesso!')
    },
    
    resendSuccess: () => {
      success('📧 Email de verificação reenviado! Verifique sua caixa de entrada e pasta de spam.')
    },
    
    resendError: (customMessage?: string) => {
      error(customMessage || '❌ Erro ao reenviar email. Tente novamente.')
    }
  }

  // Métodos para operações CRUD
  const crud = {
    createSuccess: (entity: string) => {
      success(`✅ ${entity} criado com sucesso!`)
    },
    
    createError: (entity: string, customMessage?: string) => {
      error(customMessage || `❌ Erro ao criar ${entity}. Tente novamente.`)
    },
    
    updateSuccess: (entity: string) => {
      success(`✅ ${entity} atualizado com sucesso!`)
    },
    
    updateError: (entity: string, customMessage?: string) => {
      error(customMessage || `❌ Erro ao atualizar ${entity}. Tente novamente.`)
    },
    
    deleteSuccess: (entity: string) => {
      success(`🗑️ ${entity} removido com sucesso!`)
    },
    
    deleteError: (entity: string, customMessage?: string) => {
      error(customMessage || `❌ Erro ao remover ${entity}. Tente novamente.`)
    },
    
    fetchError: (entity: string, customMessage?: string) => {
      error(customMessage || `❌ Erro ao carregar ${entity}. Recarregue a página.`)
    }
  }

  // Métodos para operações específicas
  const operations = {
    copySuccess: (item = 'conteúdo') => {
      success(`📋 ${item} copiado para área de transferência!`, { duration: 2000 })
    },
    
    copyError: () => {
      error('❌ Erro ao copiar para área de transferência.')
    },
    
    exportSuccess: (format = 'dados') => {
      success(`📤 ${format} exportado com sucesso!`)
    },
    
    importSuccess: (format = 'dados') => {
      success(`📥 ${format} importado com sucesso!`)
    },
    
    sendSuccess: (action = 'operação') => {
      success(`📤 ${action} enviado com sucesso!`)
    },
    
    sendError: (action = 'operação') => {
      error(`❌ Erro ao enviar ${action}. Tente novamente.`)
    }
  }

  // Método para atualizar toast existente
  const update = (toastId: string, message: string, type: 'success' | 'error' | 'loading') => {
    if (type === 'success') {
      toast.success(message, { id: toastId })
    } else if (type === 'error') {
      toast.error(message, { id: toastId })
    } else {
      toast.loading(message, { id: toastId })
    }
  }

  // Método para dismiss
  const dismiss = (toastId?: string) => {
    toast.dismiss(toastId)
  }

  return {
    success,
    error,
    warning,
    info,
    loading,
    auth,
    crud,
    operations,
    update,
    dismiss
  }
}