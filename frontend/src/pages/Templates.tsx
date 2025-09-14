import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SafeHTML } from '@/components/ui/SafeHTML'
import { templateApi } from '@/lib/api'
import { formatRelativeTime, generateRandomId } from '@/lib/utils'
import { TemplateLibrary } from '@/components/templates/TemplateLibrary'
import {
  FileText, Plus, Edit3, Eye, Trash2, Save, Code,
  Download, Upload, Copy, Play, Palette, Type,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Link, Image, List, Hash, X, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  subject: z.string().min(1, 'Assunto é obrigatório').max(255),
  html_content: z.string().optional(),
  text_content: z.string().optional(),
  variables: z.array(z.string()).optional(),
}).refine(data => data.html_content || data.text_content, {
  message: "HTML ou texto deve ser fornecido"
})

type CreateTemplateForm = z.infer<typeof createTemplateSchema>

interface Template {
  id: number
  name: string
  subject: string
  html_content?: string
  text_content?: string
  variables: string[]
  created_at: string
  updated_at: string
}

export function Templates() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [activeTab, setActiveTab] = useState('visual')
  const [previewData, setPreviewData] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<CreateTemplateForm>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: {
      name: '',
      subject: '',
      html_content: '',
      text_content: '',
      variables: [],
    },
  })

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templateApi.getTemplates(),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateTemplateForm) => templateApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setIsCreating(false)
      reset()
      toast.success('Template criado com sucesso!')
    },
    onError: () => toast.error('Erro ao criar template'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateTemplateForm }) => 
      templateApi.updateTemplate(id.toString(), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template atualizado com sucesso!')
    },
    onError: () => toast.error('Erro ao atualizar template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => templateApi.deleteTemplate(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setSelectedTemplate(null)
      toast.success('Template deletado com sucesso!')
    },
    onError: () => toast.error('Erro ao deletar template'),
  })

  const templateList = templates?.data?.templates || []

  const onSubmit = (data: CreateTemplateForm) => {
    if (selectedTemplate) {
      updateMutation.mutate({ id: selectedTemplate.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template)
    setIsCreating(false)
    setValue('name', template.name)
    setValue('subject', template.subject)
    setValue('html_content', template.html_content || '')
    setValue('text_content', template.text_content || '')
    setValue('variables', template.variables || [])
  }

  const handleNewTemplate = () => {
    setIsCreating(true)
    setSelectedTemplate(null)
    reset()
  }

  const handleTemplateFromLibrary = (libraryTemplate: any) => {
    setIsCreating(true)
    setSelectedTemplate(null)
    setValue('name', `${libraryTemplate.name} (Cópia)`)
    setValue('subject', libraryTemplate.subject || '')
    setValue('html_content', libraryTemplate.html_content || '')
    setValue('text_content', libraryTemplate.text_content || '')
    setValue('variables', libraryTemplate.variables || [])
    setActiveTab('html')
    toast.success('Template carregado da biblioteca!')
  }

  const handleCreateFromExample = (templateType: string) => {
    const templateId = generateRandomId()
    let exampleTemplate = {
      name: '',
      subject: '',
      html_content: '',
      text_content: '',
      variables: [] as string[]
    }

    switch (templateType) {
      case 'welcome':
        exampleTemplate = {
          name: `Template de Boas-vindas ${templateId}`,
          subject: 'Bem-vindo(a) {{nome}}!',
          html_content: `<h1>Olá {{nome}}!</h1><p>Bem-vindo(a) à nossa plataforma. Estamos felizes em tê-lo(a) conosco!</p>`,
          text_content: 'Olá {{nome}}! Bem-vindo(a) à nossa plataforma.',
          variables: ['nome']
        }
        break
      case 'newsletter':
        exampleTemplate = {
          name: `Newsletter ${templateId}`,
          subject: '📧 Newsletter {{mes}} - {{titulo}}',
          html_content: `<h1>{{titulo}}</h1><p>Confira as novidades de {{mes}}!</p>`,
          text_content: '{{titulo}} - Novidades de {{mes}}',
          variables: ['titulo', 'mes']
        }
        break
      case 'promotion':
        exampleTemplate = {
          name: `Template Promocional ${templateId}`,
          subject: '🎉 {{oferta}} - Oferta Especial!',
          html_content: `<h1>{{oferta}}</h1><p>Não perca! Válido até {{validade}}</p>`,
          text_content: '{{oferta}} - Válido até {{validade}}',
          variables: ['oferta', 'validade']
        }
        break
    }

    setIsCreating(true)
    setSelectedTemplate(null)
    setValue('name', exampleTemplate.name)
    setValue('subject', exampleTemplate.subject)
    setValue('html_content', exampleTemplate.html_content)
    setValue('text_content', exampleTemplate.text_content)
    setValue('variables', exampleTemplate.variables)
    toast.success(`Template ${templateType} criado!`)
  }

  const handleDeleteTemplate = (template: Template) => {
    if (confirm(`Tem certeza que deseja deletar o template "${template.name}"?`)) {
      deleteMutation.mutate(template.id)
    }
  }

  const extractVariables = (content: string) => {
    const regex = /{{\\s*([^}\\s]+)\\s*}}/g
    const variables: string[] = []
    let match
    while ((match = regex.exec(content)) !== null) {
      if (match[1] && !variables.includes(match[1])) {
        variables.push(match[1])
      }
    }
    return variables
  }

  const processTemplate = (content: string, variables: Record<string, string>) => {
    let processed = content
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
      processed = processed.replace(regex, variables[key] || `{{${key}}}`)
    })
    return processed
  }

  const htmlContent = watch('html_content') || ''
  const textContent = watch('text_content') || ''
  const subject = watch('subject') || ''

  // Extract variables from content
  useEffect(() => {
    const htmlVars = extractVariables(htmlContent)
    const textVars = extractVariables(textContent)
    const subjectVars = extractVariables(subject)
    const allVars = Array.from(new Set([...htmlVars, ...textVars, ...subjectVars]))
    setValue('variables', allVars)
  }, [htmlContent, textContent, subject, setValue])

  const insertAtCursor = (textarea: HTMLTextAreaElement, text: string) => {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const content = textarea.value
    const newContent = content.substring(0, start) + text + content.substring(end)
    
    textarea.value = newContent
    textarea.setSelectionRange(start + text.length, start + text.length)
    textarea.focus()
  }

  const toolbar = (
    <div className="flex items-center space-x-2 p-2 border-b">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<strong></strong>')
        }}
      >
        <Bold className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<em></em>')
        }}
      >
        <Italic className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<u></u>')
        }}
      >
        <Underline className="h-4 w-4" />
      </Button>

      <div className="border-l h-6 mx-2" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<div style="text-align: left;"></div>')
        }}
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<div style="text-align: center;"></div>')
        }}
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<div style="text-align: right;"></div>')
        }}
      >
        <AlignRight className="h-4 w-4" />
      </Button>

      <div className="border-l h-6 mx-2" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<ul><li></li></ul>')
        }}
      >
        <List className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<a href=""></a>')
        }}
      >
        <Link className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
          insertAtCursor(textarea, '<img src="" alt="" />')
        }}
      >
        <Image className="h-4 w-4" />
      </Button>

      <div className="border-l h-6 mx-2" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const variable = prompt('Nome da variável:')
          if (variable) {
            const textarea = document.getElementById('html-editor') as HTMLTextAreaElement
            insertAtCursor(textarea, `{{${variable}}}`)
          }
        }}
      >
        <Hash className="h-4 w-4" />
      </Button>
    </div>
  )

  return (
    <div className="h-screen flex">
      {/* Sidebar - Template List */}
      <div className="w-80 border-r bg-background flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Templates</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleNewTemplate}>
                <Plus className="h-4 w-4 mr-1" />
                Novo
              </Button>
              <div className="relative group">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1" />
                  Exemplos
                </Button>
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => handleCreateFromExample('welcome')}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                    >
                      <Type className="h-4 w-4" />
                      Boas-vindas
                    </button>
                    <button
                      onClick={() => handleCreateFromExample('newsletter')}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Newsletter
                    </button>
                    <button
                      onClick={() => handleCreateFromExample('promotion')}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                    >
                      <Palette className="h-4 w-4" />
                      Promocional
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="mb-3 p-3 border rounded animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : templateList.length === 0 ? (
            <div className="p-4 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum template encontrado</p>
            </div>
          ) : (
            <div className="p-2">
              {isCreating && (
                <div className="mb-2 p-3 border-2 border-primary rounded-lg bg-primary/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-primary">Novo Template</div>
                      <div className="text-sm text-muted-foreground">Em criação</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsCreating(false)
                        reset()
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              
              {templateList.map((template: Template) => (
                <div
                  key={template.id}
                  className={`mb-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{template.name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {template.subject}
                      </div>
                      <div className="flex items-center mt-1 space-x-2">
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(template.updated_at)}
                        </span>
                        {template.variables && template.variables.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {template.variables.length} variável{template.variables.length !== 1 ? 'is' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(JSON.stringify(template, null, 2))
                          toast.success('Template copiado para a área de transferência!')
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          const dataStr = JSON.stringify(template, null, 2)
                          const blob = new Blob([dataStr], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const link = document.createElement('a')
                          link.href = url
                          link.download = `template-${template.name.toLowerCase().replace(/\s+/g, '-')}.json`
                          link.click()
                          URL.revokeObjectURL(url)
                          toast.success('Template exportado!')
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteTemplate(template)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {selectedTemplate || isCreating ? (
          <>
            {/* Editor Header */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">
                    {isCreating ? 'Novo Template' : selectedTemplate?.name}
                  </h1>
                  <p className="text-muted-foreground">
                    {isCreating ? 'Criar um novo template de email' : 'Editar template existente'}
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    id="template-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = (event) => {
                          try {
                            const template = JSON.parse(event.target?.result as string)
                            setValue('name', template.name || '')
                            setValue('subject', template.subject || '')
                            setValue('html_content', template.html_content || '')
                            setValue('text_content', template.text_content || '')
                            setValue('variables', template.variables || [])
                            toast.success('Template importado com sucesso!')
                          } catch (error) {
                            toast.error('Erro ao importar template')
                          }
                        }
                        reader.readAsText(file)
                      }
                    }}
                  />
                  
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('template-upload')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Simulate sending test email
                      const variables = extractVariables(htmlContent + textContent + subject)
                      const sampleData: Record<string, string> = {}
                      variables.forEach(v => {
                        sampleData[v] = `Teste ${v}`
                      })
                      toast.promise(
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                        {
                          loading: 'Enviando email de teste...',
                          success: 'Email de teste enviado!',
                          error: 'Erro ao enviar email de teste'
                        }
                      )
                    }}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Testar
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      const variables = extractVariables(htmlContent + textContent + subject)
                      const sampleData: Record<string, string> = {}
                      variables.forEach(v => {
                        sampleData[v] = `[${v}]`
                      })
                      setPreviewData(sampleData)
                      setActiveTab('preview')
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  
                  <Button onClick={handleSubmit(onSubmit)} disabled={createMutation.isPending || updateMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Salvando...'
                      : isCreating
                      ? 'Criar Template'
                      : 'Salvar Alterações'
                    }
                  </Button>
                </div>
              </div>
            </div>

            {/* Template Form */}
            <div className="flex-1 p-4">
              <form onSubmit={handleSubmit(onSubmit)} className="h-full flex flex-col">
                {/* Template Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <Label htmlFor="name">Nome do Template</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Boas-vindas"
                      {...register('name')}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="subject">Assunto do Email</Label>
                    <Input
                      id="subject"
                      placeholder="Ex: Bem-vindo ao {{company_name}}!"
                      {...register('subject')}
                    />
                    {errors.subject && (
                      <p className="text-sm text-destructive mt-1">{errors.subject.message}</p>
                    )}
                  </div>
                </div>

                {/* Editor Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                  <TabsList>
                    <TabsTrigger value="library">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Biblioteca
                    </TabsTrigger>
                    <TabsTrigger value="visual">
                      <Edit3 className="h-4 w-4 mr-2" />
                      Visual
                    </TabsTrigger>
                    <TabsTrigger value="html">
                      <Code className="h-4 w-4 mr-2" />
                      HTML
                    </TabsTrigger>
                    <TabsTrigger value="text">
                      <Type className="h-4 w-4 mr-2" />
                      Texto
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="library" className="flex-1 mt-4">
                    <TemplateLibrary
                      onTemplateSelect={handleTemplateFromLibrary}
                      showCloneButton={false}
                      showFavoriteButton={true}
                      className="h-full"
                    />
                  </TabsContent>

                  <TabsContent value="visual" className="flex-1 mt-4">
                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle>Editor Visual</CardTitle>
                        <CardDescription>
                          Use o editor HTML para maior controle sobre o layout
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          placeholder="Digite o conteúdo do seu email aqui..."
                          className="min-h-[400px] font-mono"
                          {...register('html_content')}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="html" className="flex-1 mt-4">
                    <Card className="h-full flex flex-col">
                      {toolbar}
                      <CardContent className="flex-1 p-0">
                        <Textarea
                          id="html-editor"
                          placeholder="<h1>Olá {{name}}!</h1>
<p>Bem-vindo ao {{company_name}}.</p>
<a href='{{confirmation_url}}'>Confirme sua conta</a>"
                          className="min-h-[400px] border-0 font-mono text-sm resize-none"
                          {...register('html_content')}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="text" className="flex-1 mt-4">
                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle>Versão em Texto</CardTitle>
                        <CardDescription>
                          Versão alternativa em texto puro (opcional)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          placeholder="Olá {{name}}!

Bem-vindo ao {{company_name}}.

Confirme sua conta em: {{confirmation_url}}"
                          className="min-h-[400px] font-mono"
                          {...register('text_content')}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="preview" className="flex-1 mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
                      {/* Variables Panel */}
                      <div className="lg:col-span-1">
                        <Card className="h-full">
                          <CardHeader>
                            <CardTitle>Variáveis de Teste</CardTitle>
                            <CardDescription>
                              Defina valores para visualizar o preview
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {watch('variables')?.map((variable) => (
                              <div key={variable}>
                                <Label htmlFor={`var-${variable}`}>{variable}</Label>
                                <Input
                                  id={`var-${variable}`}
                                  placeholder={`Valor para ${variable}`}
                                  value={previewData[variable] || ''}
                                  onChange={(e) =>
                                    setPreviewData(prev => ({
                                      ...prev,
                                      [variable]: e.target.value
                                    }))
                                  }
                                />
                              </div>
                            ))}
                            
                            {(!watch('variables') || watch('variables')?.length === 0) && (
                              <p className="text-sm text-muted-foreground">
                                Nenhuma variável encontrada. Use a sintaxe {"{{variavel}}"} no seu template.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Preview Panel */}
                      <div className="lg:col-span-2">
                        <Card className="h-full">
                          <CardHeader>
                            <CardTitle>Preview do Email</CardTitle>
                            <CardDescription>
                              Assunto: {processTemplate(subject, previewData)}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <SafeHTML 
                              className="border rounded p-4 bg-white min-h-[400px]"
                              html={processTemplate(htmlContent, previewData) || processTemplate(textContent, previewData).replace(/\n/g, '<br>')}
                              strict={true}
                            />
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">Selecione um template</h3>
              <p className="text-muted-foreground mb-4">
                Escolha um template existente para editar ou crie um novo
              </p>
              <Button onClick={handleNewTemplate}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Template
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}