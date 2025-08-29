import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { emailApi } from '@/lib/api'
import { formatDate, formatRelativeTime, getStatusColor } from '@/lib/utils'
import { Search, Filter, RefreshCw, Send, Eye, MousePointer, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSmartPolling } from '@/hooks/useSmartPolling'

interface Email {
  id: number
  from_email: string
  to_email: string
  subject: string
  status: string
  sent_at: string
  opened_at?: string
  clicked_at?: string
  bounce_reason?: string
  created_at: string
}

export function EmailList() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const queryClient = useQueryClient()

  // Smart polling for email list
  const { 
    data, 
    isLoading, 
    error, 
    refetch,
    currentInterval,
    pausePolling,
    resumePolling
  } = useSmartPolling({
    queryKey: ['emails', { search, statusFilter, page, limit }],
    queryFn: () => emailApi.getEmails({
      search,
      status: statusFilter === 'all' ? undefined : statusFilter,
      page,
      limit,
      sort: 'created_at',
      order: 'desc'
    }),
    baseInterval: 15000, // 15 seconds
    maxInterval: 120000, // 2 minutes
    onError: (error) => {
      console.error('Error fetching emails:', error)
      toast.error('Erro ao buscar emails')
    }
  })

  const emails = data?.data?.emails || []
  const pagination = data?.data?.pagination || { page: 1, pages: 1, total: 0 }

  const handleRefresh = () => {
    toast.promise(
      refetch(),
      {
        loading: 'Atualizando emails...',
        success: 'Emails atualizados!',
        error: 'Erro ao atualizar emails'
      }
    )
  }

  const handleFullRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    toast.success('Cache limpo e dados atualizados!')
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Send className="h-4 w-4 text-blue-500" />
      case 'delivered': return <Eye className="h-4 w-4 text-green-500" />
      case 'opened': return <Eye className="h-4 w-4 text-blue-600" />
      case 'clicked': return <MousePointer className="h-4 w-4 text-purple-500" />
      case 'bounced': return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-600" />
      default: return <div className="h-4 w-4 rounded-full bg-gray-400" />
    }
  }

  const getStatusBadge = (email: Email) => {
    if (email.clicked_at) {
      return <Badge variant="default" className="bg-purple-100 text-purple-800">Clicado</Badge>
    }
    if (email.opened_at) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Aberto</Badge>
    }
    if (email.bounce_reason) {
      return <Badge variant="destructive">Bounce</Badge>
    }
    
    const color = getStatusColor(email.status)
    return (
      <Badge 
        variant="secondary" 
        className={color}
      >
        {email.status === 'sent' ? 'Enviado' :
         email.status === 'delivered' ? 'Entregue' :
         email.status === 'queued' ? 'Na fila' :
         email.status === 'failed' ? 'Falhou' :
         email.status}
      </Badge>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Emails</h1>
            <p className="text-muted-foreground">Gerencie seus emails enviados</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Erro ao carregar emails</h3>
              <p className="text-muted-foreground mb-4">
                Não foi possível carregar a lista de emails. Tente novamente.
              </p>
              <Button onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Emails</h1>
          <p className="text-muted-foreground">
            {pagination.total} emails • {emails.filter((e: Email) => e.status === 'delivered').length} entregues
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Novo Email
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Send className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{pagination.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Entregues</p>
                <p className="text-2xl font-bold">
                  {emails.filter((e: Email) => e.status === 'delivered').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Abertos</p>
                <p className="text-2xl font-bold">
                  {emails.filter((e: Email) => e.opened_at).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MousePointer className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Clicados</p>
                <p className="text-2xl font-bold">
                  {emails.filter((e: Email) => e.clicked_at).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setSearch('')
                setStatusFilter('all')
                toast.success('Filtros limpos!')
              }}>
                Limpar filtros
              </Button>
              <Button variant="ghost" size="sm" onClick={handleFullRefresh}>
                Limpar cache
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar por email, assunto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              {['all', 'sent', 'delivered', 'opened', 'bounced', 'failed'].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'Todos' :
                   status === 'sent' ? 'Enviados' :
                   status === 'delivered' ? 'Entregues' :
                   status === 'opened' ? 'Abertos' :
                   status === 'bounced' ? 'Bounces' :
                   status === 'failed' ? 'Falharam' :
                   status}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email List */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Status</TableHead>
              <TableHead>Para</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>De</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 w-4 bg-gray-200 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-48 bg-gray-200 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-16 bg-gray-200 rounded animate-pulse" /></TableCell>
                </TableRow>
              ))
            ) : emails.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center">
                    <Send className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhum email encontrado</h3>
                    <p className="text-muted-foreground mb-4">
                      {search || statusFilter !== 'all'
                        ? 'Tente ajustar os filtros ou fazer uma nova busca.'
                        : 'Você ainda não enviou nenhum email. Que tal começar agora?'
                      }
                    </p>
                    <Button>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar primeiro email
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              emails.map((email: Email) => (
                <TableRow key={email.id}>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(email.status)}
                      {getStatusBadge(email)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{email.to_email}</div>
                    {email.bounce_reason && (
                      <div className="text-sm text-destructive">{email.bounce_reason}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{email.subject}</div>
                    <div className="text-sm text-muted-foreground">ID: {email.id}</div>
                  </TableCell>
                  <TableCell>{email.from_email}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {formatRelativeTime(email.sent_at || email.created_at)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(email.sent_at || email.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      Ver detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              Página {pagination.page} de {pagination.pages} • {pagination.total} emails
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                Anterior
              </Button>
              
              {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                const pageNumber = i + 1
                return (
                  <Button
                    key={pageNumber}
                    variant={page === pageNumber ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                )
              })}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= pagination.pages}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}