import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useToast } from '@/hooks/useToast'
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/^(?=.*[A-Z])(?=.*[@$!%*?&])/, 'Senha deve conter pelo menos: 1 letra maiúscula e 1 caractere especial'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
})

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// Função para calcular força da senha
const calculatePasswordStrength = (password: string) => {
  let strength = 0
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    numbers: /\d/.test(password),
    special: /[@$!%*?&]/.test(password)
  }
  
  Object.values(checks).forEach(check => {
    if (check) strength++
  })
  
  return {
    score: strength,
    checks,
    label: strength < 2 ? 'Fraca' : strength < 4 ? 'Média' : 'Forte',
    color: strength < 2 ? 'text-red-500' : strength < 4 ? 'text-yellow-500' : 'text-green-500'
  }
}

export function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showResendOption, setShowResendOption] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const toast = useToast()

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const onLogin = async (data: LoginForm) => {
    setIsLoading(true)
    
    // Toast de loading
    const loadingToast = toast.loading('🔑 Fazendo login...')
    
    try {
      const response = await authApi.login(data)
      const { user, tokens } = response.data
      
      // Dismiss loading toast
      toast.dismiss(loadingToast)
      
      login(user, tokens.access_token)
      toast.auth.loginSuccess(user.name)
      navigate('/app')
    } catch (error: any) {
      // Dismiss loading toast
      toast.dismiss(loadingToast)
      
      const errorMessage = error.response?.data?.message || ''
      
      if (errorMessage.includes('Invalid credentials') || errorMessage.includes('credentials')) {
        toast.auth.loginError('credentials')
      } else if (errorMessage.includes('verify') || errorMessage.includes('verification')) {
        toast.auth.loginError('verification')
      } else {
        toast.auth.loginError('generic', errorMessage || 'Erro interno do servidor')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const onRegister = async (data: RegisterForm) => {
    setIsLoading(true)
    
    // Toast de loading
    const loadingToast = toast.loading('👤 Criando sua conta...')
    
    try {
      // Remove confirmPassword antes de enviar
      const { confirmPassword, ...registerData } = data
      await authApi.register(registerData)
      
      // Dismiss loading toast
      toast.dismiss(loadingToast)
      
      toast.auth.registerSuccess()
      setIsLogin(true)
      registerForm.reset()
      
      // Guardar email para possível reenvio
      setResendEmail(registerData.email)
      setShowResendOption(true)
      
      // Mostrar informação adicional sobre próximo passo
      setTimeout(() => {
        toast.info('📧 Não recebeu o email? Use a opção "Reenviar email de verificação" abaixo.', {
          duration: 6000
        })
      }, 2000)
      
    } catch (error: any) {
      // Dismiss loading toast
      toast.dismiss(loadingToast)
      
      const errorMessage = error.response?.data?.message || ''
      
      if (errorMessage.includes('already exists') || errorMessage.includes('exists')) {
        toast.auth.registerError('exists')
        // Sugerir ação
        setTimeout(() => {
          toast.info('💡 Já tem uma conta? Clique em "Fazer Login" para acessar.', {
            duration: 4000
          })
        }, 1500)
      } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        toast.auth.registerError('validation')
      } else if (errorMessage.includes('password') || errorMessage.includes('senha')) {
        toast.auth.registerError('password')
      } else {
        toast.auth.registerError('generic', errorMessage || 'Erro interno do servidor')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const onResendVerification = async () => {
    if (!resendEmail) {
      toast.error('❌ Email não disponível. Tente se registrar novamente.')
      return
    }

    setIsLoading(true)
    
    const loadingToast = toast.loading('📧 Reenviando email de verificação...')
    
    try {
      await authApi.resendVerificationEmail(resendEmail)
      toast.dismiss(loadingToast)
      toast.auth.resendSuccess()
      
      // Informação adicional
      setTimeout(() => {
        toast.info('⏰ Pode levar alguns minutos para chegar. Verifique também sua pasta de spam.', {
          duration: 5000
        })
      }, 1500)
      
    } catch (error: any) {
      toast.dismiss(loadingToast)
      const errorMessage = error.response?.data?.message || ''
      toast.auth.resendError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-black via-primary-dark to-gray-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary-blue flex items-center justify-center">
              <span className="text-white font-bold text-lg">UZ</span>
            </div>
            <span className="text-2xl font-bold text-white">UltraZend</span>
          </div>
          <p className="text-gray-400">
            {isLogin ? 'Faça login em sua conta' : 'Crie sua conta gratuita'}
          </p>
        </div>

        <Card className="bg-white/95 backdrop-blur border-0 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              {isLogin ? 'Entrar' : 'Registrar'}
            </CardTitle>
            <CardDescription className="text-center">
              {isLogin 
                ? 'Digite suas credenciais para acessar sua conta'
                : 'Preencha os dados para criar sua conta'
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isLogin ? (
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10"
                      {...loginForm.register('email')}
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {loginForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      {...loginForm.register('password')}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="name"
                      placeholder="Seu nome completo"
                      className="pl-10"
                      {...registerForm.register('name')}
                    />
                  </div>
                  {registerForm.formState.errors.name && (
                    <p className="text-sm text-destructive">
                      {registerForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10"
                      {...registerForm.register('email')}
                    />
                  </div>
                  {registerForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {registerForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      {...registerForm.register('password')}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {/* Feedback de força da senha */}
                  {registerForm.watch('password') && (
                    <div className="space-y-1">
                      {(() => {
                        const strength = calculatePasswordStrength(registerForm.watch('password'))
                        return (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span>Força da senha:</span>
                              <span className={strength.color}>{strength.label}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1">
                              <div 
                                className={`h-1 rounded-full transition-all ${
                                  strength.score < 2 ? 'bg-red-500' : 
                                  strength.score < 4 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${(strength.score / 5) * 100}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 space-y-1">
                              <div className="flex flex-wrap gap-2">
                                <span className={strength.checks.length ? 'text-green-500' : 'text-gray-400'}>
                                  ✓ 8+ caracteres
                                </span>
                                <span className={strength.checks.uppercase ? 'text-green-500' : 'text-gray-400'}>
                                  ✓ Maiúscula
                                </span>
                                <span className={strength.checks.special ? 'text-green-500' : 'text-gray-400'}>
                                  ✓ Especial
                                </span>
                              </div>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}
                  
                  {registerForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {registerForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      {...registerForm.register('confirmPassword')}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {/* Feedback de confirmação */}
                  {registerForm.watch('confirmPassword') && registerForm.watch('password') && (
                    <div className="text-xs">
                      {registerForm.watch('password') === registerForm.watch('confirmPassword') ? (
                        <span className="text-green-500">✓ Senhas coincidem</span>
                      ) : (
                        <span className="text-red-500">✗ Senhas não coincidem</span>
                      )}
                    </div>
                  )}
                  
                  {registerForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">
                      {registerForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Registrando...' : 'Registrar'}
                </Button>
              </form>
            )}

            <div className="text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin 
                  ? 'Não tem uma conta? Registre-se'
                  : 'Já tem uma conta? Entre'
                }
              </button>
            </div>

{isLogin && (
              <>
                <div className="text-center">
                  <Link 
                    to="/forgot-password" 
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Esqueceu sua senha?
                  </Link>
                </div>
                
                {/* Opção de reenvio de verificação */}
                {showResendOption && (
                  <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700 mb-2">
                      📧 Registrado com sucesso! Não recebeu o email de verificação?
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onResendVerification}
                      disabled={isLoading}
                      className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    >
                      {isLoading ? 'Reenviando...' : 'Reenviar email de verificação'}
                    </Button>
                    <p className="text-xs text-blue-600 mt-1">
                      Email: {resendEmail}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-400">
          <p>© 2024 UltraZend. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  )
}