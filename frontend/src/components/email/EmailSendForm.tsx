import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { DomainSelector } from '@/components/domain/DomainSelector'
import { useUserDomains, useHasVerifiedDomains } from '@/hooks/useUserDomains'
import { useEmailSend, extractDomain, type EmailData } from '@/hooks/useEmailSend'
import { 
  Send, 
  Eye, 
  Code,
  Plus,
  X,
  AlertTriangle,
  CheckCircle,
  Settings,
  Shield
} from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * 🚀 EMAIL SEND FORM V3 - ARQUITETURA SIMPLIFICADA
 * 
 * Componente de envio de emails com validação de domínio integrada
 * Valida domínio antes de enviar usando nova arquitetura simplificada
 */

const sendEmailV3Schema = z.object({
  to: z.string().email('Email inválido'),
  from: z.string()
    .min(1, 'Selecione um domínio remetente')
    .email('Email remetente inválido'),
  subject: z.string().min(1, 'Assunto é obrigatório'),
  html: z.string().optional(),
  text: z.string().min(1, 'Conteúdo é obrigatório'),
  variables: z.record(z.string()).default({})
})

type SendEmailFormV3 = z.infer<typeof sendEmailV3Schema>

interface EmailSendFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
  showHeader?: boolean
  defaultValues?: Partial<EmailData>
}

export function EmailSendForm({ 
  onSuccess,
  onCancel,
  className = '',
  showHeader = true,
  defaultValues = {}
}: EmailSendFormProps) {
  const navigate = useNavigate()
  const [previewMode, setPreviewMode] = useState<'text' | 'html'>('text')
  const [customVariables, setCustomVariables] = useState<Record<string, string>>(defaultValues.variables || {})
  const [newVarKey, setNewVarKey] = useState('')
  const [newVarValue, setNewVarValue] = useState('')
  const [domainValidationStatus, setDomainValidationStatus] = useState<{
    isValid: boolean | null
    domain: string | null
    message: string | null
  }>({ isValid: null, domain: null, message: null })

  const form = useForm<SendEmailFormV3>({
    resolver: zodResolver(sendEmailV3Schema),
    defaultValues: {
      from: defaultValues.from || '',
      to: defaultValues.to as string || '',
      subject: defaultValues.subject || '',
      html: defaultValues.html || '',
      text: defaultValues.text || '',
      variables: defaultValues.variables || {}
    }
  })

  // Hooks de domínios e envio
  const { data: domainsData } = useUserDomains()
  const hasVerifiedDomains = useHasVerifiedDomains()
  const sendEmailMutation = useEmailSend()

  // Validação em tempo real do domínio selecionado
  useEffect(() => {
    const fromEmail = form.watch('from')
    
    if (!fromEmail) {
      setDomainValidationStatus({ isValid: null, domain: null, message: null })
      return
    }

    const domain = extractDomain(fromEmail)
    if (!domain) {
      setDomainValidationStatus({ 
        isValid: false, 
        domain: null, 
        message: 'Formato de email inválido' 
      })
      return
    }

    // Verificar se o domínio está na lista de domínios verificados
    const verifiedDomains = domainsData?.data?.domains || []
    const domainInfo = verifiedDomains.find(d => d.domain_name === domain)

    if (!domainInfo) {
      setDomainValidationStatus({ 
        isValid: false, 
        domain, 
        message: `Domínio '${domain}' não encontrado. Configure-o primeiro.` 
      })
      return
    }

    if (!domainInfo.is_verified || domainInfo.verification_status !== 'verified') {
      setDomainValidationStatus({ 
        isValid: false, 
        domain, 
        message: `Domínio '${domain}' não verificado. Verifique-o primeiro.` 
      })
      return
    }

    setDomainValidationStatus({ 
      isValid: true, 
      domain, 
      message: `Domínio '${domain}' verificado e pronto para uso!` 
    })
  }, [form.watch('from'), domainsData])

  const onSubmit = async (data: SendEmailFormV3) => {
    console.log('🚀 EMAIL SEND FORM V3 - Iniciando envio:', data)

    // 1. Verificação prévia de domínios verificados
    if (!hasVerifiedDomains) {
      toast.error('Configure pelo menos um domínio verificado para enviar emails')
      setTimeout(() => navigate('/domains'), 1500)
      return
    }

    // 2. Validação do domínio selecionado
    const domain = extractDomain(data.from)
    if (!domain) {
      toast.error('Selecione um domínio remetente válido')
      return
    }

    // 3. Verificação dupla com dados locais
    const verifiedDomains = domainsData?.data?.domains || []
    const verifiedDomain = verifiedDomains.find(d => 
      d.domain_name === domain && 
      d.is_verified && 
      d.verification_status === 'verified'
    )

    if (!verifiedDomain) {
      toast.error(`Domínio '${domain}' não verificado. Redirecionando para configuração...`)
      setTimeout(() => navigate('/domains'), 1500)
      return
    }

    // 4. Preparar dados do email
    const emailData: EmailData = {
      ...data,
      variables: customVariables
    }

    console.log('✅ EMAIL SEND FORM V3 - Validações passaram, enviando:', {
      domain,
      verified: true,
      emailData
    })

    // 5. Enviar usando o hook V3 que fará validação no backend também
    try {
      await sendEmailMutation.mutateAsync(emailData)
      
      // Success callback
      if (onSuccess) {
        onSuccess()
      } else {
        navigate('/app/emails')
      }
    } catch (error) {
      console.error('🔴 EMAIL SEND FORM V3 - Erro no envio:', error)
      // O hook já trata erros com toasts e redirecionamentos
    }
  }

  const addCustomVariable = () => {
    if (newVarKey && newVarValue && !customVariables[newVarKey]) {
      setCustomVariables({...customVariables, [newVarKey]: newVarValue})
      setNewVarKey('')
      setNewVarValue('')
      toast.success(`Variável '${newVarKey}' adicionada`)
    }
  }

  const removeCustomVariable = (key: string) => {
    const { [key]: _, ...rest } = customVariables
    setCustomVariables(rest)
    toast.success(`Variável '${key}' removida`)
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      navigate('/app/emails')
    }
  }

  const redirectToDomainSetup = () => {
    toast.info('Redirecionando para configuração de domínios...')
    navigate('/domains')
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              Novo Email V3
              <span className="text-sm font-normal text-muted-foreground ml-2">
                com validação de domínio
              </span>
            </h2>
            <p className="text-muted-foreground">
              Envie emails com verificação automática de domínio
            </p>
          </div>
        </div>
      )}

      {/* Status de Verificação de Domínios */}
      {!hasVerifiedDomains && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Nenhum domínio verificado</AlertTitle>
          <AlertDescription className="text-amber-700">
            Você precisa configurar e verificar pelo menos um domínio para enviar emails.
            <Button 
              variant="link" 
              className="p-0 h-auto text-amber-600 ml-1"
              onClick={redirectToDomainSetup}
            >
              Configure agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Status de Validação do Domínio Atual */}
      {domainValidationStatus.domain && (
        <Alert className={
          domainValidationStatus.isValid 
            ? 'border-green-200 bg-green-50' 
            : 'border-red-200 bg-red-50'
        }>
          {domainValidationStatus.isValid ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
          <AlertTitle className={domainValidationStatus.isValid ? 'text-green-800' : 'text-red-800'}>
            Status do Domínio: {domainValidationStatus.domain}
          </AlertTitle>
          <AlertDescription className={domainValidationStatus.isValid ? 'text-green-700' : 'text-red-700'}>
            {domainValidationStatus.message}
            {!domainValidationStatus.isValid && (
              <Button 
                variant="link" 
                className="p-0 h-auto text-red-600 ml-1"
                onClick={redirectToDomainSetup}
              >
                Verificar domínio
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Email Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Informações do Email
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="from"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>De *</FormLabel>
                          <FormControl>
                            <DomainSelector
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Selecione um domínio verificado"
                              disabled={!hasVerifiedDomains}
                              className="w-full"
                            />
                          </FormControl>
                          <FormMessage />
                          {!hasVerifiedDomains && (
                            <FormDescription className="text-amber-600">
                              Configure pelo menos um domínio verificado para enviar emails.
                            </FormDescription>
                          )}
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="to"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Para *</FormLabel>
                          <FormControl>
                            <Input placeholder="destinatario@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assunto *</FormLabel>
                        <FormControl>
                          <Input placeholder="Digite o assunto do email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Email Content */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Conteúdo do Email
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="text" className="w-full">
                    <TabsList>
                      <TabsTrigger value="text" onClick={() => setPreviewMode('text')}>Texto</TabsTrigger>
                      <TabsTrigger value="html" onClick={() => setPreviewMode('html')}>HTML</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="text" className="space-y-4">
                      <FormField
                        control={form.control}
                        name="text"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Conteúdo em Texto *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Digite o conteúdo do email em texto simples..."
                                rows={10}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                    
                    <TabsContent value="html" className="space-y-4">
                      <FormField
                        control={form.control}
                        name="html"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Conteúdo HTML</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="<html><body>Digite o conteúdo HTML...</body></html>"
                                rows={10}
                                className="font-mono"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                    
                    <TabsContent value="preview">
                      <div className="border rounded-lg p-4">
                        {form.watch('html') ? (
                          <div dangerouslySetInnerHTML={{ __html: form.watch('html') }} />
                        ) : (
                          <pre className="whitespace-pre-wrap">
                            {form.watch('text') || 'Nenhum conteúdo para preview'}
                          </pre>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Configurações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                </CardContent>
              </Card>

              {/* Custom Variables */}
              <Card>
                <CardHeader>
                  <CardTitle>Variáveis Personalizadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="chave"
                      value={newVarKey}
                      onChange={(e) => setNewVarKey(e.target.value)}
                    />
                    <Input
                      placeholder="valor"
                      value={newVarValue}
                      onChange={(e) => setNewVarValue(e.target.value)}
                    />
                    <Button type="button" onClick={addCustomVariable}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {Object.entries(customVariables).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(customVariables).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between bg-gray-50 rounded p-2">
                          <div>
                            <span className="font-mono text-sm">{key}</span>
                            <span className="text-muted-foreground mx-2">=</span>
                            <span className="text-sm">{value}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCustomVariable(key)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Submit Actions */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-2">
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={
                        sendEmailMutation.isPending || 
                        !hasVerifiedDomains || 
                        domainValidationStatus.isValid === false
                      }
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sendEmailMutation.isPending 
                        ? 'Enviando...' 
                        : !hasVerifiedDomains 
                          ? 'Configure um domínio primeiro'
                          : domainValidationStatus.isValid === false
                            ? 'Verifique o domínio primeiro'
                            : 'Enviar Email V3'
                      }
                    </Button>
                    
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleCancel}
                    >
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}