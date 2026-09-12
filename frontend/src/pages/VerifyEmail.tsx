import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { authApi } from '../lib/api'
import { useToast } from '../hooks/useToast'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const toast = useToast()
  const hasVerified = useRef(false)
  const tokenProcessed = useRef<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    let isCancelled = false // Proteção contra cleanup
    
    // Debug logging
    console.log('VerifyEmail useEffect called')
    console.log('Token from URL:', token)
    console.log('hasVerified.current:', hasVerified.current)
    console.log('tokenProcessed.current:', tokenProcessed.current)
    console.log('isVerifying:', isVerifying)
    
    // Múltiplas camadas de proteção contra execução dupla
    if (!token) {
      console.error('No token found in URL')
      setStatus('error')
      setMessage('Token de verificação não encontrado na URL. Verifique se o link está completo.')
      toast.auth.verificationError('Token não encontrado na URL')
      return
    }

    // Verificar se já estamos processando ou já processamos este token
    if (hasVerified.current || tokenProcessed.current === token || isVerifying) {
      console.log('Verification blocked - already processed or in progress')
      return
    }

    // Marcar imediatamente para prevenir execuções simultâneas
    hasVerified.current = true
    tokenProcessed.current = token
    setIsVerifying(true)

    console.log('Starting email verification for token:', token)

    // Chamar API de verificação
    const verifyEmail = async () => {
      if (isCancelled) return // Verificar se foi cancelado
      try {
        console.log('Calling verifyEmail API with token:', token)
        const response = await authApi.verifyEmail(token)
        console.log('SUCCESS: Verification response:', response)
        
        if (isCancelled) return // Verificar se foi cancelado antes de setar estado
        
        setStatus('success')
        setMessage(response.data.message)
        console.log('Status set to SUCCESS, message:', response.data.message)
        
        toast.auth.verificationSuccess()
        
        // Mostrar toast informativo sobre próximo passo
        setTimeout(() => {
          toast.info('🔑 Redirecionando para o login...', { duration: 2000 })
        }, 1000)
        
        // Redirecionar para login após 3 segundos
        setTimeout(() => {
          navigate('/login', { 
            state: { 
              message: 'Email verificado! Você já pode fazer login.',
              verified: true 
            } 
          })
        }, 3000)
      } catch (error: any) {
        console.error('CATCH: Email verification error:', error)
        console.error('CATCH: Error response:', error.response)
        
        // IMPORTANTE: Se já foi verificado com sucesso, não sobrescrever
        if (status === 'success' || isCancelled) {
          console.log('BLOCKED: Ignoring error because status is success or cancelled')
          return
        }
        
        setStatus('error')
        const errorMessage = error.response?.data?.message || error.message || 'Erro ao verificar email'
        const errorStatus = error.response?.status
        
        console.log('CATCH: Error status:', errorStatus)
        console.log('CATCH: Error message:', errorMessage)
        console.log('CATCH: Status set to ERROR')
        
        setMessage(`${errorMessage} ${errorStatus ? `(Status: ${errorStatus})` : ''}`)
        toast.auth.verificationError(errorMessage)
        
        // Oferecer ajuda baseada no tipo de erro
        setTimeout(() => {
          if (errorStatus === 404 || errorMessage.includes('not found')) {
            toast.warning('🔗 O link pode ter expirado. Tente se registrar novamente para receber um novo link.', { 
              duration: 8000 
            })
          } else if (errorStatus === 400 || errorMessage.includes('Invalid')) {
            toast.warning('🔗 Link inválido. Certifique-se de usar o link completo do email.', { 
              duration: 6000 
            })
          } else {
            toast.warning('🔗 Precisa de ajuda? Entre em contato com o suporte.', { 
              duration: 6000 
            })
          }
        }, 2000)
      } finally {
        setIsVerifying(false)
      }
    }

    verifyEmail()
    
    // Cleanup function para cancelar operações se componente for desmontado
    return () => {
      isCancelled = true
      console.log('VerifyEmail useEffect cleanup called')
    }
  }, [searchParams, navigate]) // Removido status para evitar re-execução

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-md">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center">
            <img className="h-auto w-[168px]" src="/landing/logo-color.png" alt="VeloMail" />
            <p className="text-muted-foreground text-sm mt-2">Verificação de Email</p>
          </div>

          {/* Status */}
          <div className="mb-6">
            {status === 'loading' && (
              <div className="flex flex-col items-center">
                <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Verificando seu email...
                </h2>
                <p className="text-muted-foreground">
                  Por favor, aguarde enquanto confirmamos sua conta.
                </p>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center">
                <CheckCircle2 className="h-16 w-16 text-[hsl(var(--success))] mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Email verificado!
                </h2>
                <p className="text-muted-foreground mb-4">
                  {message}
                </p>
                <p className="text-sm text-muted-foreground">
                  Redirecionando para o login em alguns segundos...
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center">
                <XCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Erro na verificação
                </h2>
                <p className="text-muted-foreground mb-6">
                  {message}
                </p>
                <div className="space-y-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Ir para Login
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Se o problema persistir, entre em contato conosco.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-xs text-muted-foreground border-t pt-4">
            <p>© 2026 VeloMail. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
