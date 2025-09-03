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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { emailApi, templateApi } from '@/lib/api'
import { 
  ArrowLeft, 
  Send, 
  Eye, 
  Code,
  Plus,
  X,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

const sendEmailSchema = z.object({
  to_email: z.string().email('Email inválido'),
  from_email: z.string().email('Email remetente inválido'),
  reply_to: z.string().email('Email de resposta inválido').optional().or(z.literal('')),
  subject: z.string().min(1, 'Assunto é obrigatório'),
  html_content: z.string().optional(),
  text_content: z.string().min(1, 'Conteúdo é obrigatório'),
  cc_emails: z.array(z.string().email()).default([]),
  bcc_emails: z.array(z.string().email()).default([]),
  template_id: z.string().optional(),
  tracking_enabled: z.boolean().default(true),
  variables: z.record(z.string()).default({})
})

type SendEmailForm = z.infer<typeof sendEmailSchema>

export function SendEmail() {
  const navigate = useNavigate()
  const [previewMode, setPreviewMode] = useState<'text' | 'html'>('text')
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const [newCcEmail, setNewCcEmail] = useState('')
  const [newBccEmail, setNewBccEmail] = useState('')
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({})
  const [newVarKey, setNewVarKey] = useState('')
  const [newVarValue, setNewVarValue] = useState('')

  const form = useForm<SendEmailForm>({
    resolver: zodResolver(sendEmailSchema),
    defaultValues: {
      from_email: '',
      to_email: '',
      reply_to: '',
      subject: '',
      html_content: '',
      text_content: '',
      cc_emails: [],
      bcc_emails: [],
      template_id: '',
      tracking_enabled: true,
      variables: {}
    }
  })

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
    const emailData = {
      ...data,
      cc_emails: ccEmails,
      bcc_emails: bccEmails,
      variables: customVariables
    }
    
    sendEmailMutation.mutate(emailData)
  }

  const addCcEmail = () => {
    if (newCcEmail && !ccEmails.includes(newCcEmail)) {
      setCcEmails([...ccEmails, newCcEmail])
      setNewCcEmail('')
    }
  }

  const addBccEmail = () => {
    if (newBccEmail && !bccEmails.includes(newBccEmail)) {
      setBccEmails([...bccEmails, newBccEmail])
      setNewBccEmail('')
    }
  }

  const removeCcEmail = (email: string) => {
    setCcEmails(ccEmails.filter(e => e !== email))
  }

  const removeBccEmail = (email: string) => {
    setBccEmails(bccEmails.filter(e => e !== email))
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
      form.setValue('html_content', template.html_content || '')
      form.setValue('text_content', template.text_content || '')
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
                      name="from_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>De *</FormLabel>
                          <FormControl>
                            <Input placeholder="seu@dominio.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="to_email"
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
                    name="reply_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responder para</FormLabel>
                        <FormControl>
                          <Input placeholder="resposta@dominio.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
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

                  {/* CC/BCC */}
                  <div className="space-y-4">
                    <div>
                      <Label>CC (Cópia)</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="email@exemplo.com"
                          value={newCcEmail}
                          onChange={(e) => setNewCcEmail(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCcEmail())}
                        />
                        <Button type="button" onClick={addCcEmail}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {ccEmails.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {ccEmails.map((email) => (
                            <div key={email} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                              <span className="text-sm">{email}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCcEmail(email)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <Label>BCC (Cópia Oculta)</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="email@exemplo.com"
                          value={newBccEmail}
                          onChange={(e) => setNewBccEmail(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addBccEmail())}
                        />
                        <Button type="button" onClick={addBccEmail}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {bccEmails.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {bccEmails.map((email) => (
                            <div key={email} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                              <span className="text-sm">{email}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeBccEmail(email)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
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
                        name="text_content"
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
                        name="html_content"
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
                        {form.watch('html_content') ? (
                          <div dangerouslySetInnerHTML={{ __html: form.watch('html_content') }} />
                        ) : (
                          <pre className="whitespace-pre-wrap">
                            {form.watch('text_content') || 'Nenhum conteúdo para preview'}
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
                  <FormField
                    control={form.control}
                    name="tracking_enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Rastreamento</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Habilitar tracking de abertura e cliques
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
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
                      disabled={sendEmailMutation.isPending}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sendEmailMutation.isPending ? 'Enviando...' : 'Enviar Email'}
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