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
import toast from 'react-hot-toast'
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
  const navigate = useNavigate()
  const { login } = useAuthStore()

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
    try {
      const response = await authApi.login(data)
      const { user, tokens } = response.data
      
      login(user, tokens.access_token)
      toast.success(`✅ Bem-vindo de volta, ${user.name}!`)
      navigate('/app')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Erro ao fazer login'
      
      if (errorMessage.includes('Invalid credentials')) {
        toast.error('❌ Email ou senha incorretos. Verifique suas credenciais.')
      } else if (errorMessage.includes('verify')) {
        toast.error('❌ Você precisa verificar seu email antes de fazer login.')
      } else {
        toast.error(`❌ ${errorMessage}`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const onRegister = async (data: RegisterForm) => {
    setIsLoading(true)
    try {
      // Remove confirmPassword antes de enviar
      const { confirmPassword, ...registerData } = data
      await authApi.register(registerData)
      toast.success('🎉 Usuário registrado com sucesso! Verifique seu email para confirmar sua conta.', {
        duration: 5000,
      })
      setIsLogin(true)
      registerForm.reset()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Erro ao registrar usuário'
      
      // Notificações mais específicas baseadas no tipo de erro
      if (errorMessage.includes('already exists')) {
        toast.error('❌ Este email já está registrado. Tente fazer login ou use outro email.')
      } else if (errorMessage.includes('validation')) {
        toast.error('❌ Dados inválidos. Verifique os campos e tente novamente.')
      } else if (errorMessage.includes('password')) {
        toast.error('❌ Senha não atende aos requisitos mínimos.')
      } else {
        toast.error(`❌ ${errorMessage}`)
      }
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
              <div className="text-center">
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Esqueceu sua senha?
                </Link>
              </div>
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