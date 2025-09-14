import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from 'react-hot-toast'
import {
  Plus,
  BookOpen,
  Lock,
  Globe,
  Trash2,
  Edit3,
  MoreHorizontal,
  FileText,
  Users,
  Calendar,
  Eye
} from 'lucide-react'
import { sharedTemplateApi } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'
import { formatRelativeTime } from '@/lib/utils'

interface Collection {
  id: number
  name: string
  description?: string
  is_public: boolean
  created_at: string
  updated_at: string
  creator_name?: string
  creator_email?: string
  templates?: any[]
}

interface TemplateCollectionsProps {
  className?: string
  onCollectionSelect?: (collection: Collection) => void
}

export const TemplateCollections: React.FC<TemplateCollectionsProps> = ({
  className,
  onCollectionSelect
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [showPublicOnly, setShowPublicOnly] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [newCollection, setNewCollection] = useState({
    name: '',
    description: '',
    is_public: false
  })

  const queryClient = useQueryClient()

  // Buscar coleções
  const { data: collectionsData, isLoading } = useQuery({
    queryKey: ['collections', showPublicOnly],
    queryFn: async () => {
      const response = await sharedTemplateApi.getCollections({
        public: showPublicOnly
      })
      return response.data
    },
    staleTime: 2 * 60 * 1000
  })

  // Mutation para criar coleção
  const createCollectionMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; is_public: boolean }) => {
      return await sharedTemplateApi.createCollection(data)
    },
    onSuccess: () => {
      toast.success('Coleção criada com sucesso!')
      setIsCreateOpen(false)
      setNewCollection({ name: '', description: '', is_public: false })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao criar coleção')
    }
  })

  const handleCreateCollection = () => {
    if (!newCollection.name.trim()) {
      toast.error('Nome da coleção é obrigatório')
      return
    }

    createCollectionMutation.mutate({
      name: newCollection.name.trim(),
      description: newCollection.description.trim() || undefined,
      is_public: newCollection.is_public
    })
  }

  const handleCollectionClick = (collection: Collection) => {
    setSelectedCollection(collection)
    onCollectionSelect?.(collection)
  }

  const collections = collectionsData?.collections || []

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Coleções de Templates</h2>
          <p className="text-gray-600">Organize seus templates favoritos em coleções</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="text-sm">Apenas públicas</span>
            <Switch
              checked={showPublicOnly}
              onCheckedChange={setShowPublicOnly}
            />
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Coleção
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Coleção</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="collection-name">Nome da Coleção *</Label>
                  <Input
                    id="collection-name"
                    placeholder="Ex: Templates de E-commerce"
                    value={newCollection.name}
                    onChange={(e) => setNewCollection(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="collection-description">Descrição (opcional)</Label>
                  <Textarea
                    id="collection-description"
                    placeholder="Descreva o propósito desta coleção..."
                    rows={3}
                    value={newCollection.description}
                    onChange={(e) => setNewCollection(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="is-public">Coleção Pública</Label>
                    <p className="text-sm text-gray-600">
                      Outros usuários poderão visualizar esta coleção
                    </p>
                  </div>
                  <Switch
                    id="is-public"
                    checked={newCollection.is_public}
                    onCheckedChange={(checked) => setNewCollection(prev => ({ ...prev, is_public: checked }))}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreateCollection}
                    disabled={createCollectionMutation.isPending || !newCollection.name.trim()}
                  >
                    {createCollectionMutation.isPending ? 'Criando...' : 'Criar Coleção'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2 mb-4" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {showPublicOnly ? 'Nenhuma coleção pública encontrada' : 'Nenhuma coleção encontrada'}
          </h3>
          <p className="text-gray-500 mb-6">
            {showPublicOnly
              ? 'Desative o filtro de coleções públicas para ver suas coleções privadas.'
              : 'Crie sua primeira coleção para organizar seus templates favoritos.'
            }
          </p>
          {!showPublicOnly && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Coleção
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map((collection) => (
            <Card
              key={collection.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleCollectionClick(collection)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {collection.is_public ? (
                        <Globe className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Lock className="h-4 w-4 text-gray-500" />
                      )}
                      {collection.name}
                    </CardTitle>
                    {collection.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                        {collection.description}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {collection.templates?.length || 0} templates
                    </div>

                    {collection.creator_name && (
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {collection.creator_name}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="h-3 w-3" />
                    Criada {formatRelativeTime(collection.created_at)}
                  </div>

                  <div className="flex gap-2">
                    <Badge variant={collection.is_public ? 'default' : 'secondary'}>
                      {collection.is_public ? 'Pública' : 'Privada'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview da coleção selecionada */}
      {selectedCollection && (
        <Dialog open={!!selectedCollection} onOpenChange={() => setSelectedCollection(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedCollection.is_public ? (
                  <Globe className="h-5 w-5 text-blue-500" />
                ) : (
                  <Lock className="h-5 w-5 text-gray-500" />
                )}
                {selectedCollection.name}
              </DialogTitle>
              {selectedCollection.description && (
                <p className="text-gray-600">{selectedCollection.description}</p>
              )}
            </DialogHeader>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>{selectedCollection.templates?.length || 0} templates</span>
                  {selectedCollection.creator_name && (
                    <span>Por {selectedCollection.creator_name}</span>
                  )}
                  <span>Criada {formatRelativeTime(selectedCollection.created_at)}</span>
                </div>

                <Button variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Detalhes
                </Button>
              </div>

              {/* Lista de templates na coleção seria exibida aqui */}
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                Visualização detalhada dos templates será implementada em breve
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default TemplateCollections