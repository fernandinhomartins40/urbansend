import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { emailApi, templateApi } from '@/lib/api'
import { DomainSelector, useDomainSelectorField } from '@/components/domain/DomainSelector'
import { useHasVerifiedDomains } from '@/hooks/useUserDomains'
import { 
  ArrowLeft, 
  Send, 
  Eye, 
  Code,
  Plus,
  X,
  AlertTriangle,
  CheckCircle,
  Settings
} from 'lucide-react'
import toast from 'react-hot-toast'

const sendEmailSchema = z.object({
  to: z.string().email('Email inválido'),
  from: z.string()
    .min(1, 'Selecione um domínio remetente')
    .email('Email remetente inválido'),
  subject: z.string().min(1, 'Assunto é obrigatório'),
  html: z.string().optional(),
  text: z.string().min(1, 'Conteúdo é obrigatório'),
  template_id: z.string().optional(),
  variables: z.record(z.string()).default({})
})

type SendEmailForm = z.infer<typeof sendEmailSchema>

export function SendEmail() {
  const navigate = useNavigate()
  const [previewMode, setPreviewMode] = useState<'text' | 'html'>('text')
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({})
  const [newVarKey, setNewVarKey] = useState('')
  const [newVarValue, setNewVarValue] = useState('')

  const form = useForm<SendEmailForm>({
    resolver: zodResolver(sendEmailSchema),
    defaultValues: {
      from: '',
      to: '',
      subject: '',
      html: '',
      text: '',
      template_id: '',
      variables: {}
    }
  })

  // Domain selector hook for validation
  const domainSelectorField = useDomainSelectorField()
  const hasVerifiedDomains = useHasVerifiedDomains()

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.getTemplates
  })

  const sendEmailMutation = useMutation({
    mutationFn: emailApi.send,
    onSuccess: (response) => {
      toast.success('Email enviado com sucesso!')
      navigate('/app/emails')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar email')
    }
  })

  const onSubmit = (data: SendEmailForm) => {
    // Verificar se há domínios verificados
    if (!hasVerifiedDomains) {
      toast.error('Configure pelo menos um domínio verificado para enviar emails')
      return
    }

    // Verificar se o email remetente está configurado
    if (!data.from || !data.from.includes('@')) {
      toast.error('Selecione um domínio remetente válido')
      return
    }

    const emailData = {
      ...data,
      variables: customVariables
    }
    
    sendEmailMutation.mutate(emailData)
  }


  const addCustomVariable = () => {
    if (newVarKey && newVarValue && !customVariables[newVarKey]) {
      setCustomVariables({...customVariables, [newVarKey]: newVarValue})
      setNewVarKey('')
      setNewVarValue('')
    }
  }

  const removeCustomVariable = (key: string) => {
    const { [key]: _, ...rest } = customVariables
    setCustomVariables(rest)
  }

  const loadTemplate = (templateId: string) => {
    const template = templates?.data?.find((t: any) => t.id.toString() === templateId)
    if (template) {
      form.setValue('subject', template.subject || '')
      form.setValue('html', template.html_content || '')
      form.setValue('text', template.text_content || '')
      setCustomVariables(template.variables || {})
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/app/emails')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Novo Email</h1>
            <p className="text-muted-foreground">Envie um email personalizado</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Email Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Informações do Email</CardTitle>
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
                  <CardTitle>Conteúdo do Email</CardTitle>
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
              {/* Template Selection */}
              {templates?.data && templates.data.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Template</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select onValueChange={loadTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.data.map((template: any) => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Configurações</CardTitle>
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
                      disabled={sendEmailMutation.isPending || !hasVerifiedDomains}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sendEmailMutation.isPending 
                        ? 'Enviando...' 
                        : !hasVerifiedDomains 
                          ? 'Configure um domínio primeiro'
                          : 'Enviar Email'
                      }
                    </Button>
                    
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => navigate('/app/emails')}
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