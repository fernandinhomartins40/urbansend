import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'react-hot-toast'
import {
  BarChart3,
  Play,
  Pause,
  Trophy,
  Users,
  Mail,
  MousePointer,
  TrendingUp,
  Plus,
  Eye,
  Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

interface ABTest {
  id: number
  name: string
  status: 'draft' | 'running' | 'completed' | 'stopped'
  test_type: 'subject' | 'content' | 'sender' | 'template'
  winner_variant?: 'A' | 'B'
  significance_achieved: boolean
  started_at?: string
  completed_at?: string
  variants: ABVariant[]
}

interface ABVariant {
  variant_name: 'A' | 'B'
  emails_sent: number
  opens: number
  clicks: number
  open_rate: number
  click_rate: number
}

export const ABTestDashboard: React.FC = () => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTest, setNewTest] = useState({
    name: '',
    test_type: 'subject',
    traffic_split: 50,
    variant_a: { subject: '' },
    variant_b: { subject: '' }
  })

  const queryClient = useQueryClient()

  // Buscar testes A/B
  const { data: testsData, isLoading } = useQuery({
    queryKey: ['ab-tests'],
    queryFn: async () => {
      const response = await api.get('/ab-tests')
      return response.data
    }
  })

  // Criar teste A/B
  const createTestMutation = useMutation({
    mutationFn: async (testConfig: any) => {
      const response = await api.post('/ab-tests', testConfig)
      return response.data
    },
    onSuccess: () => {
      toast.success('Teste A/B criado com sucesso!')
      setCreateDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar teste')
    }
  })

  // Iniciar teste
  const startTestMutation = useMutation({
    mutationFn: async (testId: number) => {
      const response = await api.post(`/ab-tests/${testId}/start`)
      return response.data
    },
    onSuccess: () => {
      toast.success('Teste iniciado!')
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] })
    }
  })

  const tests = testsData?.tests || []

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: { variant: 'secondary' as const, label: 'Rascunho' },
      running: { variant: 'default' as const, label: 'Em andamento' },
      completed: { variant: 'outline' as const, label: 'Concluído' },
      stopped: { variant: 'destructive' as const, label: 'Parado' }
    }
    return variants[status as keyof typeof variants] || variants.draft
  }

  const TestCard = ({ test }: { test: ABTest }) => {
    const variantA = test.variants.find(v => v.variant_name === 'A')
    const variantB = test.variants.find(v => v.variant_name === 'B')
    const winner = test.winner_variant
    
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{test.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Teste de {test.test_type === 'subject' ? 'assunto' : test.test_type}
              </p>
            </div>
            <Badge {...getStatusBadge(test.status)}>
              {getStatusBadge(test.status).label}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {test.status === 'running' || test.status === 'completed' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Variante A</span>
                  {winner === 'A' && <Trophy className="h-4 w-4 text-yellow-500" />}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Enviados: {variantA?.emails_sent || 0}</span>
                    <span>Taxa abertura: {variantA?.open_rate || 0}%</span>
                  </div>
                  <Progress value={variantA?.open_rate || 0} className="h-2" />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Variante B</span>
                  {winner === 'B' && <Trophy className="h-4 w-4 text-yellow-500" />}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Enviados: {variantB?.emails_sent || 0}</span>
                    <span>Taxa abertura: {variantB?.open_rate || 0}%</span>
                  </div>
                  <Progress value={variantB?.open_rate || 0} className="h-2" />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Teste não iniciado. Configure e inicie para ver resultados.
            </p>
          )}
          
          <div className="flex gap-2">
            {test.status === 'draft' && (
              <Button 
                size="sm" 
                onClick={() => startTestMutation.mutate(test.id)}
                disabled={startTestMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar teste
              </Button>
            )}
            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-2" />
              Ver detalhes
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const handleCreateTest = () => {
    createTestMutation.mutate({
      ...newTest,
      confidence_level: 95,
      min_sample_size: 100,
      test_duration_hours: 24,
      winner_criteria: 'open_rate'
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">A/B Testing</h2>
          <p className="text-muted-foreground">
            Teste diferentes variações dos seus emails para otimizar performance
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo teste A/B
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar teste A/B</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome do teste</Label>
                <Input 
                  value={newTest.name}
                  onChange={(e) => setNewTest(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Teste de assunto - Promoção"
                />
              </div>
              
              <div>
                <Label>Tipo de teste</Label>
                <Select 
                  value={newTest.test_type}
                  onValueChange={(value) => setNewTest(prev => ({ ...prev, test_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subject">Assunto</SelectItem>
                    <SelectItem value="content">Conteúdo</SelectItem>
                    <SelectItem value="sender">Remetente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Variante A - {newTest.test_type === 'subject' ? 'Assunto' : 'Valor'}</Label>
                  <Input 
                    value={newTest.variant_a.subject}
                    onChange={(e) => setNewTest(prev => ({ 
                      ...prev, 
                      variant_a: { ...prev.variant_a, subject: e.target.value }
                    }))}
                    placeholder="Primeira opção"
                  />
                </div>
                <div>
                  <Label>Variante B - {newTest.test_type === 'subject' ? 'Assunto' : 'Valor'}</Label>
                  <Input 
                    value={newTest.variant_b.subject}
                    onChange={(e) => setNewTest(prev => ({ 
                      ...prev, 
                      variant_b: { ...prev.variant_b, subject: e.target.value }
                    }))}
                    placeholder="Segunda opção"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateTest}
                  disabled={createTestMutation.isPending || !newTest.name}
                >
                  Criar teste
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tests.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tests.map((test: ABTest) => (
            <TestCard key={test.id} test={test} />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum teste A/B criado</h3>
          <p className="text-muted-foreground mb-4">
            Comece testando diferentes versões dos seus emails para otimizar a performance
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primeiro teste
          </Button>
        </Card>
      )}
    </div>
  )
}

export default ABTestDashboard