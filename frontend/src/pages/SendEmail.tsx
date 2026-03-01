import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DomainSelector } from '@/components/domain/DomainSelector'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SafeHTML } from '@/components/ui/SafeHTML'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { emailApi, templateApi } from '@/lib/api'
import { useHasVerifiedDomains } from '@/hooks/useUserDomains'

const sendEmailSchema = z.object({
  to: z.string().email('Email invalido'),
  from: z.string().min(1, 'Selecione um dominio remetente').email('Email remetente invalido'),
  subject: z.string().min(1, 'Assunto e obrigatorio'),
  html: z.string().optional(),
  text: z.string().min(1, 'Conteudo e obrigatorio'),
  template_id: z.string().optional(),
  tracking_enabled: z.boolean().default(true),
})

type SendEmailForm = z.infer<typeof sendEmailSchema>

const parseTemplateVariables = (value: unknown): Record<string, string> => {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed ? parsed : {}
    } catch {
      return {}
    }
  }

  if (typeof value === 'object') {
    return value as Record<string, string>
  }

  return {}
}

export function SendEmail() {
  const navigate = useNavigate()
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({})
  const [newVarKey, setNewVarKey] = useState('')
  const [newVarValue, setNewVarValue] = useState('')
  const hasVerifiedDomains = useHasVerifiedDomains()

  const form = useForm<SendEmailForm>({
    resolver: zodResolver(sendEmailSchema),
    defaultValues: {
      from: '',
      to: '',
      subject: '',
      html: '',
      text: '',
      template_id: '',
      tracking_enabled: true,
    },
  })

  const { data: templatesResponse } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.getTemplates,
  })

  const templates = templatesResponse?.data?.templates || []

  const sendEmailMutation = useMutation({
    mutationFn: emailApi.send,
    onSuccess: () => {
      toast.success('Email enviado com sucesso')
      navigate('/app/emails')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar email')
    },
  })

  const onSubmit = (data: SendEmailForm) => {
    if (!hasVerifiedDomains) {
      toast.error('Configure pelo menos um dominio verificado para enviar emails')
      return
    }

    sendEmailMutation.mutate({
      ...data,
      variables: customVariables,
    })
  }

  const addCustomVariable = () => {
    if (newVarKey && newVarValue && !customVariables[newVarKey]) {
      setCustomVariables((current) => ({ ...current, [newVarKey]: newVarValue }))
      setNewVarKey('')
      setNewVarValue('')
    }
  }

  const removeCustomVariable = (key: string) => {
    const { [key]: _removed, ...rest } = customVariables
    setCustomVariables(rest)
  }

  const loadTemplate = (templateId: string) => {
    const template = templates.find((item: any) => item.id.toString() === templateId)

    if (!template) {
      return
    }

    form.setValue('template_id', templateId)
    form.setValue('subject', template.subject || '')
    form.setValue('html', template.html_content || '')
    form.setValue('text', template.text_content || '')
    setCustomVariables(parseTemplateVariables(template.variables))
  }

  const htmlPreview = form.watch('html')
  const textPreview = form.watch('text')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/app/emails')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Novo email</h1>
            <p className="text-muted-foreground">Envie um email transacional sem trilhas paralelas.</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informacoes do email</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="from"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>De</FormLabel>
                          <FormControl>
                            <DomainSelector
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Selecione um dominio verificado"
                              disabled={!hasVerifiedDomains}
                              className="w-full"
                            />
                          </FormControl>
                          <FormMessage />
                          {!hasVerifiedDomains && (
                            <FormDescription className="text-amber-600">
                              Configure pelo menos um dominio verificado para liberar o envio.
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
                          <FormLabel>Para</FormLabel>
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
                        <FormLabel>Assunto</FormLabel>
                        <FormControl>
                          <Input placeholder="Digite o assunto do email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conteudo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="text" className="w-full">
                    <TabsList>
                      <TabsTrigger value="text">Texto</TabsTrigger>
                      <TabsTrigger value="html">HTML</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>

                    <TabsContent value="text" className="space-y-4">
                      <FormField
                        control={form.control}
                        name="text"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Texto</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Digite o conteudo do email em texto simples..."
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
                            <FormLabel>HTML</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="<html><body>Digite o conteudo HTML...</body></html>"
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
                      <div className="rounded-lg border p-4">
                        {htmlPreview ? (
                          <SafeHTML html={htmlPreview} strict className="prose max-w-none" />
                        ) : (
                          <pre className="whitespace-pre-wrap">{textPreview || 'Nenhum conteudo para preview'}</pre>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {templates.length > 0 && (
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
                        {templates.map((template: any) => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Configuracoes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="tracking_enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel>Tracking</FormLabel>
                          <FormDescription>Habilita abertura e clique no email enviado.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Variaveis personalizadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input placeholder="chave" value={newVarKey} onChange={(event) => setNewVarKey(event.target.value)} />
                    <Input placeholder="valor" value={newVarValue} onChange={(event) => setNewVarValue(event.target.value)} />
                    <Button type="button" onClick={addCustomVariable}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {Object.entries(customVariables).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(customVariables).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between rounded bg-gray-50 p-2">
                          <div>
                            <span className="font-mono text-sm">{key}</span>
                            <span className="mx-2 text-muted-foreground">=</span>
                            <span className="text-sm">{value}</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeCustomVariable(key)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-2">
                    <Button type="submit" className="w-full" disabled={sendEmailMutation.isPending || !hasVerifiedDomains}>
                      <Send className="mr-2 h-4 w-4" />
                      {sendEmailMutation.isPending ? 'Enviando...' : hasVerifiedDomains ? 'Enviar email' : 'Configure um dominio primeiro'}
                    </Button>

                    <Button type="button" variant="outline" onClick={() => navigate('/app/emails')}>
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
