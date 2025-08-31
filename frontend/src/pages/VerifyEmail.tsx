import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { authApi } from '../lib/api'
import { useToast } from '../hooks/useToast'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const toast = useToast()

  useEffect(() => {
    const token = searchParams.get('token')
    
    // Debug logging
    console.log('VerifyEmail component mounted')
    console.log('Token from URL:', token)
    console.log('Current URL:', window.location.href)
    
    if (!token) {
      console.error('No token found in URL')
      setStatus('error')
      setMessage('Token de verificação não encontrado na URL. Verifique se o link está completo.')
      toast.auth.verificationError('Token não encontrado na URL')
      return
    }

    // Chamar API de verificação
    const verifyEmail = async () => {
      try {
        console.log('Calling verifyEmail API with token:', token)
        const response = await authApi.verifyEmail(token)
        console.log('Verification response:', response)
        
        setStatus('success')
        setMessage(response.data.message)
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
        console.error('Email verification error:', error)
        console.error('Error response:', error.response)
        
        setStatus('error')
        const errorMessage = error.response?.data?.message || error.message || 'Erro ao verificar email'
        const errorStatus = error.response?.status
        
        console.log('Error status:', errorStatus)
        console.log('Error message:', errorMessage)
        
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
      }
    }

    verifyEmail()
  }, [searchParams, navigate, toast])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Logo */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-indigo-600">UltraZend</h1>
            <p className="text-gray-600 text-sm mt-1">Verificação de Email</p>
          </div>

          {/* Status */}
          <div className="mb-6">
            {status === 'loading' && (
              <div className="flex flex-col items-center">
                <Loader2 className="h-16 w-16 text-indigo-600 animate-spin mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Verificando seu email...
                </h2>
                <p className="text-gray-600">
                  Por favor, aguarde enquanto confirmamos sua conta.
                </p>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Email verificado!
                </h2>
                <p className="text-gray-600 mb-4">
                  {message}
                </p>
                <p className="text-sm text-gray-500">
                  Redirecionando para o login em alguns segundos...
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center">
                <XCircle className="h-16 w-16 text-red-500 mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Erro na verificação
                </h2>
                <p className="text-gray-600 mb-6">
                  {message}
                </p>
                <div className="space-y-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    Ir para Login
                  </Link>
                  <p className="text-xs text-gray-500">
                    Se o problema persistir, entre em contato conosco.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-xs text-gray-500 border-t pt-4">
            <p>© 2025 UltraZend. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </div>
  )
}