import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'react-hot-toast'
import {
  Search,
  Star,
  Heart,
  Copy,
  Eye,
  Filter,
  Grid3X3,
  List,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Clock,
  Award,
  Sparkles,
  BookOpen,
  Tag,
  Building,
  TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/queryClient'
import { api } from '@/lib/api'

interface Template {
  id: number
  name: string
  subject: string
  description?: string
  html_content: string
  category: string
  category_name?: string
  category_icon?: string
  category_color?: string
  template_type: 'user' | 'system' | 'shared'
  tags?: string
  rating: number
  total_ratings: number
  usage_count: number
  clone_count: number
  difficulty_level: 'easy' | 'medium' | 'advanced'
  industry?: string
  estimated_time_minutes: number
  preview_image_url?: string
  is_favorited?: boolean
  created_at: string
}

interface Category {
  id: number
  name: string
  description: string
  icon: string
  color: string
  template_count: number
}

interface TemplateFilters {
  category?: string
  industry?: string
  difficulty?: 'easy' | 'medium' | 'advanced'
  template_type?: 'user' | 'system' | 'shared'
  search?: string
  min_rating?: number
  sort_by?: 'rating' | 'usage' | 'date' | 'name'
  sort_order?: 'asc' | 'desc'
}

interface TemplateLibraryProps {
  onTemplateSelect?: (template: Template) => void
  showCloneButton?: boolean
  showFavoriteButton?: boolean
  className?: string
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  onTemplateSelect,
  showCloneButton = true,
  showFavoriteButton = true,
  className
}) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloneSubject, setCloneSubject] = useState('')
  const [cloneDescription, setCloneDescription] = useState('')
  const [filters, setFilters] = useState<TemplateFilters>({
    sort_by: 'rating',
    sort_order: 'desc'
  })

  const queryClient = useQueryClient()

  // Buscar categorias
  const { data: categories, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: queryKeys.templates.categories(),
    queryFn: async () => {
      const response = await api.get('/shared-templates/categories')
      return response.data.categories as Category[]
    },
    staleTime: 10 * 60 * 1000 // 10 minutos
  })

  // Buscar templates com otimizações de performance
  const { data: templatesData, isLoading: templatesLoading, refetch } = useQuery<any>({
    queryKey: [...queryKeys.templates.all, 'public', filters, currentPage],
    queryFn: async () => {
      const response = await api.get('/shared-templates/public', {
        params: {
          ...filters,
          page: currentPage,
          limit: 12,
        }
      })
      return response.data
    },
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
  })

  // Mutation para clonar template
  const cloneTemplateMutation = useMutation({
    mutationFn: async ({ templateId, customizations }: { templateId: number, customizations: any }) => {
      const response = await api.post(`/shared-templates/${templateId}/clone`, customizations)
      return response.data
    },
    onSuccess: () => {
      toast.success('Template clonado com sucesso!')
      setCloneDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao clonar template')
    }
  })

  // Mutation para favoritar
  const favoriteMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await api.post(`/shared-templates/${templateId}/favorite`)
      return response.data
    },
    onSuccess: () => {
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao favoritar template')
    }
  })

  const templates = templatesData?.templates || []
  const pagination = templatesData?.pagination

  // Filtrar e pesquisar
  const handleFilterChange = useCallback((newFilters: Partial<TemplateFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
    setCurrentPage(1)
  }, [])

  const handleSearch = useCallback((search: string) => {
    handleFilterChange({ search })
  }, [handleFilterChange])

  // Abrir template para preview
  const handleTemplateClick = useCallback((template: Template) => {
    setSelectedTemplate(template)
    onTemplateSelect?.(template)
  }, [onTemplateSelect])

  // Abrir diálogo de clonagem
  const handleCloneClick = useCallback((template: Template) => {
    setSelectedTemplate(template)
    setCloneName(`${template.name} (Cópia)`)
    setCloneSubject(template.subject)
    setCloneDescription(template.description || '')
    setCloneDialogOpen(true)
  }, [])

  // Executar clonagem
  const handleCloneConfirm = useCallback(() => {
    if (!selectedTemplate) return

    cloneTemplateMutation.mutate({
      templateId: selectedTemplate.id,
      customizations: {
        name: cloneName,
        subject: cloneSubject,
        description: cloneDescription
      }
    })
  }, [selectedTemplate, cloneName, cloneSubject, cloneDescription, cloneTemplateMutation])

  // Favoritar template
  const handleFavorite = useCallback((templateId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    favoriteMutation.mutate(templateId)
  }, [favoriteMutation])

  // Componente de categoria
  const CategoryBadge = ({ category }: { category: Template }) => {
    const categoryData = categories?.find(c => c.name === category.category)
    const Icon = categoryData?.icon ? (
      // Mapear ícones (simplificado)
      categoryData.icon === 'megaphone' ? <TrendingUp className="h-3 w-3" /> :
      categoryData.icon === 'heart' ? <Heart className="h-3 w-3" /> :
      <BookOpen className="h-3 w-3" />
    ) : <Tag className="h-3 w-3" />

    return (
      <Badge
        variant="secondary"
        className="text-xs"
        style={{ backgroundColor: `${categoryData?.color}20`, color: categoryData?.color }}
      >
        {Icon}
        <span className="ml-1">{categoryData?.name || category.category}</span>
      </Badge>
    )
  }

  // Componente de template card
  const TemplateCard = ({ template }: { template: Template }) => (
    <Card
      className={cn(
        'group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]',
        'border-border/50 hover:border-primary/50'
      )}
      onClick={() => handleTemplateClick(template)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate group-hover:text-primary">
              {template.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {template.subject}
            </p>
          </div>
          {showFavoriteButton && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-opacity ml-2',
                template.is_favorited && 'opacity-100 text-red-500'
              )}
              onClick={(e) => handleFavorite(template.id, e)}
            >
              <Heart
                className={cn('h-4 w-4', template.is_favorited && 'fill-current')}
              />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {template.preview_image_url ? (
          <div className="aspect-video mb-3 rounded-md overflow-hidden bg-muted">
            <img
              src={template.preview_image_url}
              alt={template.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video mb-3 rounded-md bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={template} />
            <Badge
              variant={
                template.difficulty_level === 'easy' ? 'secondary' :
                template.difficulty_level === 'medium' ? 'default' : 'destructive'
              }
              className="text-xs"
            >
              {template.difficulty_level === 'easy' ? 'Fácil' :
               template.difficulty_level === 'medium' ? 'Médio' : 'Avançado'}
            </Badge>
            {template.template_type === 'system' && (
              <Badge variant="outline" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                Sistema
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                <span>{template.rating.toFixed(1)}</span>
                <span>({template.total_ratings})</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{template.usage_count}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{template.estimated_time_minutes}min</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                handleTemplateClick(template)
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              Ver detalhes
            </Button>
            {showCloneButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloneClick(template)
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header com busca e filtros */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Biblioteca de Templates</h2>
            <p className="text-muted-foreground">
              Descubra templates profissionais para seus emails
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar templates..."
              className="pl-10"
              value={filters.search || ''}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={filters.category || 'all'}
              onValueChange={(value) => handleFilterChange({ category: value === 'all' ? undefined : value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories?.map(category => (
                  <SelectItem key={category.name} value={category.name}>
                    {category.name} ({category.template_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.sort_by || 'rating'}
              onValueChange={(value) => handleFilterChange({ sort_by: value as any })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Mais bem avaliados</SelectItem>
                <SelectItem value="usage">Mais usados</SelectItem>
                <SelectItem value="date">Mais recentes</SelectItem>
                <SelectItem value="name">Nome A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Lista de templates */}
      <div className="space-y-6">
        {templatesLoading ? (
          <div className={cn(
            viewMode === 'grid'
              ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'space-y-4'
          )}>
            {Array.from({ length: 12 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="aspect-video mb-4" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates.length > 0 ? (
          <>
            <div
              className={cn(
                viewMode === 'grid'
                  ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'space-y-4'
              )}
            >
              {templates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>

            {/* Paginação */}
            {pagination && pagination.total_pages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={!pagination.has_prev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {pagination.current_page} de {pagination.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  disabled={!pagination.has_next}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card className="p-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum template encontrado</h3>
            <p className="text-muted-foreground mb-4">
              Tente ajustar os filtros ou termos de busca
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setFilters({ sort_by: 'rating', sort_order: 'desc' })
                setCurrentPage(1)
              }}
            >
              Limpar filtros
            </Button>
          </Card>
        )}
      </div>

      {/* Dialog de clonagem */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clonar Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="clone-name">Nome do template</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="Nome do seu template"
              />
            </div>
            <div>
              <Label htmlFor="clone-subject">Assunto padrão</Label>
              <Input
                id="clone-subject"
                value={cloneSubject}
                onChange={(e) => setCloneSubject(e.target.value)}
                placeholder="Assunto do email"
              />
            </div>
            <div>
              <Label htmlFor="clone-description">Descrição (opcional)</Label>
              <Textarea
                id="clone-description"
                value={cloneDescription}
                onChange={(e) => setCloneDescription(e.target.value)}
                placeholder="Descreva o propósito deste template"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCloneDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCloneConfirm}
                disabled={cloneTemplateMutation.isPending || !cloneName.trim()}
              >
                {cloneTemplateMutation.isPending ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                    Clonando...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Clonar template
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TemplateLibrary
