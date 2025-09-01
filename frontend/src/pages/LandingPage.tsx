import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Mail, 
  Zap, 
  Shield, 
  Globe, 
  CheckCircle2, 
  ArrowRight, 
  Menu, 
  X,
  Users,
  Clock,
  TrendingUp,
  Code,
  Activity,
  Sparkles
} from 'lucide-react'

export function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/95 backdrop-blur-xl border-b border-gray-200/50 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <div className="relative">
                <Mail className="h-10 w-10 text-indigo-600" />
                <Sparkles className="h-4 w-4 text-yellow-500 absolute -top-1 -right-1" />
              </div>
              <span className="ml-3 text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                UltraZend
              </span>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex space-x-10">
              <a href="#features" className="text-gray-700 hover:text-indigo-600 transition-all duration-200 font-medium">
                Recursos
              </a>
              <a href="#pricing" className="text-gray-700 hover:text-indigo-600 transition-all duration-200 font-medium">
                Preços
              </a>
              <a href="#testimonials" className="text-gray-700 hover:text-indigo-600 transition-all duration-200 font-medium">
                Depoimentos
              </a>
              <a href="#docs" className="text-gray-700 hover:text-indigo-600 transition-all duration-200 font-medium">
                Docs
              </a>
            </nav>

            <div className="hidden lg:flex items-center space-x-4">
              <Link 
                to="/login" 
                className="text-gray-700 hover:text-indigo-600 transition-all duration-200 font-medium px-4 py-2"
              >
                Entrar
              </Link>
              <Link 
                to="/login" 
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30 transform hover:-translate-y-0.5"
              >
                Começar Grátis
              </Link>
            </div>

            {/* Mobile menu button */}
            <button 
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-gray-200/50 shadow-lg">
            <div className="px-4 py-6 space-y-4">
              <a href="#features" className="block py-3 text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Recursos
              </a>
              <a href="#pricing" className="block py-3 text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Preços
              </a>
              <a href="#testimonials" className="block py-3 text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Depoimentos
              </a>
              <a href="#docs" className="block py-3 text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Docs
              </a>
              <div className="pt-4 border-t border-gray-200">
                <Link to="/login" className="block py-3 text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                  Entrar
                </Link>
                <Link to="/login" className="block mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-6 rounded-xl font-semibold text-center shadow-lg">
                  Começar Grátis
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(156 163 175 / 0.15) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }} />
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-br from-purple-400/20 to-pink-600/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse animation-delay-2000" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-5xl mx-auto">
            <div className="mb-8">
              <span className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4 mr-2" />
                Plataforma #1 em Email Transacional
              </span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-tight">
              <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                Email Transacional
              </span>
              <br />
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                que funciona
              </span>
            </h1>
            
            <p className="text-xl sm:text-2xl text-gray-600 mb-12 max-w-4xl mx-auto leading-relaxed">
              API simples, entrega garantida e análises em tempo real. 
              <span className="font-semibold text-gray-700">
                Integre em minutos, escale para milhões.
              </span>
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16">
              <Link 
                to="/login" 
                className="group bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-10 py-5 rounded-2xl font-semibold text-lg shadow-xl shadow-indigo-500/25 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/40 transform hover:-translate-y-1 flex items-center"
              >
                Começar Grátis
                <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a 
                href="#features" 
                className="group border-2 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 px-10 py-5 rounded-2xl font-semibold text-lg transition-all duration-300 hover:bg-gray-50"
              >
                Ver Demonstração
                <span className="ml-2 group-hover:ml-3 transition-all">→</span>
              </a>
            </div>
            
            {/* Trust indicators */}
            <div className="mb-20">
              <p className="text-sm text-gray-500 mb-6 font-medium">Confiado por mais de 10.000 desenvolvedores</p>
              <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-500 rounded"></div>
                  <span className="font-semibold text-gray-600">Startup A</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-green-500 rounded"></div>
                  <span className="font-semibold text-gray-600">Tech Corp</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-purple-500 rounded"></div>
                  <span className="font-semibold text-gray-600">DevCo</span>
                </div>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              <div className="group">
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-200/50 shadow-sm hover:shadow-lg transition-all duration-300 hover:bg-white/80">
                  <div className="flex items-center justify-center mb-4">
                    <div className="p-3 bg-indigo-100 rounded-xl group-hover:bg-indigo-200 transition-colors">
                      <Users className="h-8 w-8 text-indigo-600" />
                    </div>
                  </div>
                  <div className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">10,000+</div>
                  <p className="text-gray-600 font-medium">Desenvolvedores Ativos</p>
                </div>
              </div>
              
              <div className="group">
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-200/50 shadow-sm hover:shadow-lg transition-all duration-300 hover:bg-white/80">
                  <div className="flex items-center justify-center mb-4">
                    <div className="p-3 bg-purple-100 rounded-xl group-hover:bg-purple-200 transition-colors">
                      <Mail className="h-8 w-8 text-purple-600" />
                    </div>
                  </div>
                  <div className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">5M+</div>
                  <p className="text-gray-600 font-medium">Emails Entregues/Mês</p>
                </div>
              </div>
              
              <div className="group">
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-200/50 shadow-sm hover:shadow-lg transition-all duration-300 hover:bg-white/80">
                  <div className="flex items-center justify-center mb-4">
                    <div className="p-3 bg-green-100 rounded-xl group-hover:bg-green-200 transition-colors">
                      <TrendingUp className="h-8 w-8 text-green-600" />
                    </div>
                  </div>
                  <div className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">99.9%</div>
                  <p className="text-gray-600 font-medium">Taxa de Entrega</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="mb-6">
              <span className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium">
                <Code className="w-4 h-4 mr-2" />
                Recursos Profissionais
              </span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Tudo que você precisa
              </span>
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                para emails profissionais
              </span>
            </h2>
            <p className="text-xl sm:text-2xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              Recursos avançados desenvolvidos especificamente para desenvolvedores e empresas que precisam de máxima confiabilidade
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
            {/* Feature 1 - API Simples */}
            <div className="group relative">
              <div className="bg-white rounded-3xl p-8 lg:p-10 shadow-sm border border-gray-200/50 hover:shadow-xl transition-all duration-500 hover:bg-gradient-to-br hover:from-white hover:to-indigo-50/30">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/25 group-hover:shadow-xl group-hover:shadow-indigo-500/40 transition-all duration-300">
                      <Zap className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4 group-hover:text-indigo-900 transition-colors">
                      API Simples & Poderosa
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-6">
                      Integração em minutos com nossa API RESTful intuitiva. SDKs oficiais para Node.js, Python, PHP, Ruby e mais.
                    </p>
                    <div className="bg-gray-900 rounded-lg p-4 text-sm">
                      <code className="text-green-400">
                        curl -X POST https://api.ultrazend.com/send \<br />
                        &nbsp;&nbsp;-H "Authorization: Bearer your-key" \<br />
                        &nbsp;&nbsp;-d {`'{"to": "user@example.com", "subject": "Welcome!"}'`}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2 - Segurança */}
            <div className="group relative">
              <div className="bg-white rounded-3xl p-8 lg:p-10 shadow-sm border border-gray-200/50 hover:shadow-xl transition-all duration-500 hover:bg-gradient-to-br hover:from-white hover:to-purple-50/30">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-lg shadow-purple-500/25 group-hover:shadow-xl group-hover:shadow-purple-500/40 transition-all duration-300">
                      <Shield className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4 group-hover:text-purple-900 transition-colors">
                      Segurança Nível Bancário
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-6">
                      DKIM, SPF, DMARC configurados automaticamente. TLS 1.3, criptografia de ponta a ponta e auditoria completa.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">DKIM</span>
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">SPF</span>
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">DMARC</span>
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">TLS 1.3</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3 - Analytics */}
            <div className="group relative">
              <div className="bg-white rounded-3xl p-8 lg:p-10 shadow-sm border border-gray-200/50 hover:shadow-xl transition-all duration-500 hover:bg-gradient-to-br hover:from-white hover:to-blue-50/30">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25 group-hover:shadow-xl group-hover:shadow-blue-500/40 transition-all duration-300">
                      <Activity className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4 group-hover:text-blue-900 transition-colors">
                      Analytics Avançados
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-6">
                      Dashboard em tempo real com métricas detalhadas: entrega, abertura, cliques, bounces, geolocalização e muito mais.
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">99.2%</div>
                        <div className="text-sm text-gray-500">Taxa Entrega</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">24.8%</div>
                        <div className="text-sm text-gray-500">Taxa Abertura</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">4.2%</div>
                        <div className="text-sm text-gray-500">Taxa Clique</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 4 - Global */}
            <div className="group relative">
              <div className="bg-white rounded-3xl p-8 lg:p-10 shadow-sm border border-gray-200/50 hover:shadow-xl transition-all duration-500 hover:bg-gradient-to-br hover:from-white hover:to-green-50/30">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="p-4 bg-gradient-to-br from-green-500 to-teal-600 rounded-2xl shadow-lg shadow-green-500/25 group-hover:shadow-xl group-hover:shadow-green-500/40 transition-all duration-300">
                      <Globe className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4 group-hover:text-green-900 transition-colors">
                      Infraestrutura Global
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-6">
                      Servidores distribuídos em múltiplos continentes para máxima velocidade e confiabilidade. Latência &lt; 50ms globalmente.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-lg font-semibold text-green-600">🌎 Americas</div>
                        <div className="text-sm text-gray-500">5 data centers</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-green-600">🌍 Europe</div>
                        <div className="text-sm text-gray-500">3 data centers</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional features grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="group bg-white rounded-2xl p-6 border border-gray-200/50 hover:shadow-lg hover:border-indigo-200 transition-all duration-300">
              <div className="p-3 bg-indigo-100 rounded-xl w-fit mb-4 group-hover:bg-indigo-200 transition-colors">
                <Mail className="h-6 w-6 text-indigo-600" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-3">Templates Avançados</h4>
              <p className="text-gray-600">
                Editor drag & drop, variáveis dinâmicas e templates responsivos
              </p>
            </div>

            <div className="group bg-white rounded-2xl p-6 border border-gray-200/50 hover:shadow-lg hover:border-purple-200 transition-all duration-300">
              <div className="p-3 bg-purple-100 rounded-xl w-fit mb-4 group-hover:bg-purple-200 transition-colors">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-3">Suporte 24/7</h4>
              <p className="text-gray-600">
                Equipe técnica especializada em português, chat e email
              </p>
            </div>

            <div className="group bg-white rounded-2xl p-6 border border-gray-200/50 hover:shadow-lg hover:border-green-200 transition-all duration-300 md:col-span-2 lg:col-span-1">
              <div className="p-3 bg-green-100 rounded-xl w-fit mb-4 group-hover:bg-green-200 transition-colors">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-3">Webhooks Inteligentes</h4>
              <p className="text-gray-600">
                Notificações em tempo real para eventos de email
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="mb-6">
              <span className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                💰 Preços Transparentes
              </span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Comece grátis,
              </span>
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                escale quando quiser
              </span>
            </h2>
            <p className="text-xl sm:text-2xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              Sem taxas ocultas, sem truques. Pague apenas pelo que usar e cancele quando quiser.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-4 items-end">
            {/* Free Plan */}
            <div className="group relative">
              <div className="bg-white rounded-3xl p-8 border border-gray-200/50 shadow-sm hover:shadow-lg transition-all duration-300 hover:border-gray-300">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Starter</h3>
                  <p className="text-gray-600">Perfeito para começar</p>
                </div>
                
                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-bold text-gray-900">R$ 0</span>
                    <span className="text-gray-500 ml-2">/mês</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Para sempre gratuito</p>
                </div>
                
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">1.000 emails/mês</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">API REST completa</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Analytics básicas</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Suporte por email</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Templates básicos</span>
                  </li>
                </ul>
                
                <Link 
                  to="/login"
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 px-6 rounded-xl font-semibold text-center transition-colors block group-hover:bg-indigo-600"
                >
                  Começar Grátis
                </Link>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="group relative lg:scale-105">
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                <span className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                  🚀 Mais Popular
                </span>
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-8 border-2 border-indigo-200 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Pro</h3>
                  <p className="text-gray-600">Para empresas em crescimento</p>
                </div>
                
                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">R$ 49</span>
                    <span className="text-gray-500 ml-2">/mês</span>
                  </div>
                  <p className="text-sm text-indigo-600 mt-2 font-medium">14 dias grátis</p>
                </div>
                
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700"><strong>50.000</strong> emails/mês</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Analytics avançadas</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Domínio personalizado</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Webhooks avançados</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Templates ilimitados</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Suporte prioritário</span>
                  </li>
                </ul>
                
                <Link 
                  to="/login"
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-4 px-6 rounded-xl font-semibold text-center transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/40 transform hover:-translate-y-0.5 block"
                >
                  Começar Teste Grátis
                </Link>
              </div>
            </div>

            {/* Enterprise Plan */}
            <div className="group relative">
              <div className="bg-white rounded-3xl p-8 border border-gray-200/50 shadow-sm hover:shadow-lg transition-all duration-300 hover:border-gray-300">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Enterprise</h3>
                  <p className="text-gray-600">Para grandes volumes</p>
                </div>
                
                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-bold text-gray-900">R$ 199</span>
                    <span className="text-gray-500 ml-2">/mês</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Volume personalizado</p>
                </div>
                
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700"><strong>500.000+</strong> emails/mês</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">IP dedicado</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">SLA 99.9%</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Gerente dedicado</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Suporte 24/7</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">Integração customizada</span>
                  </li>
                </ul>
                
                <Link 
                  to="/login"
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 px-6 rounded-xl font-semibold text-center transition-colors block"
                >
                  Falar com Vendas
                </Link>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-12">
            <p className="text-gray-600 mb-4">
              ✅ Todos os planos incluem: DKIM/SPF/DMARC, SSL, Webhooks, Analytics, API completa
            </p>
            <p className="text-sm text-gray-500">
              Precisa de mais emails? Entre em contato para preços personalizados.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Pronto para começar?
          </h2>
          <p className="text-xl text-indigo-100 mb-8">
            Integre em minutos e envie seus primeiros emails hoje mesmo.
          </p>
          <Link 
            to="/login"
            className="bg-white text-indigo-600 px-8 py-4 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center text-lg font-semibold"
          >
            Começar Grátis Agora <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Mail className="h-8 w-8 text-indigo-400" />
                <span className="ml-2 text-xl font-bold">UltraZend</span>
              </div>
              <p className="text-gray-400">
                Plataforma profissional de email transacional para desenvolvedores e empresas.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Produto</h3>
              <ul className="space-y-2">
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">Recursos</a></li>
                <li><a href="#pricing" className="text-gray-400 hover:text-white transition-colors">Preços</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Documentação</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Status</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Empresa</h3>
              <ul className="space-y-2">
                <li><a href="#about" className="text-gray-400 hover:text-white transition-colors">Sobre</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Blog</a></li>
                <li><a href="#contact" className="text-gray-400 hover:text-white transition-colors">Contato</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Privacidade</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Suporte</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Central de Ajuda</a></li>
                <li><a href="#contact" className="text-gray-400 hover:text-white transition-colors">Contato</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Status do Serviço</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-gray-400">
              © 2025 UltraZend. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}