import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SafeHTML } from '@/components/ui/SafeHTML'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { emailApi } from '@/lib/api'
import { formatDate, formatRelativeTime, getStatusColor } from '@/lib/utils'
import { 
  ArrowLeft, 
  Send, 
  Eye, 
  MousePointer, 
  AlertTriangle, 
  Copy,
  Mail,
  User,
  Calendar,
  Activity,
  ExternalLink,
  MapPin
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Email {
  id: number
  from_email: string
  to_email: string
  subject: string
  html_content: string
  text_content: string
  status: string
  tracking_id: string
  tracking_enabled: boolean
  sent_at: string
  delivered_at?: string
  opened_at?: string
  clicked_at?: string
  bounce_reason?: string
  created_at: string
  updated_at: string
}

interface Analytics {
  id: number
  email_id: number
  event_type: string
  tracking_id: string
  link_url?: string
  user_agent?: string
  ip_address?: string
  location?: string
  created_at: string
}

export function EmailDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showHtmlContent, setShowHtmlContent] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['email', id],
    queryFn: () => emailApi.getEmail(id!),
    enabled: !!id
  })

  const { data: analyticsData } = useQuery({
    queryKey: ['email-analytics', id],
    queryFn: () => emailApi.getEmailAnalytics(id!),
    enabled: !!id
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/app/emails')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
        
        <div className="grid gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/app/emails')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
        
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Email não encontrado</h3>
              <p className="text-muted-foreground mb-4">
                O email solicitado não foi encontrado ou você não tem permissão para visualizá-lo.
              </p>
              <Button onClick={() => navigate('/app/emails')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar à lista
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const email: Email = data.data.email
  const analytics: Analytics[] = analyticsData?.data?.analytics || []

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a área de transferência!')
  }

  const getEventTypeLabel = (eventType: string) => {
    switch (eventType) {
      case 'open': return 'Abertura'
      case 'click': return 'Clique'
      case 'bounce': return 'Bounce'
      case 'delivery': return 'Entrega'
      case 'unsubscribe': return 'Descadastro'
      default: return eventType
    }
  }

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'open': return <Eye className="h-4 w-4 text-blue-500" />
      case 'click': return <MousePointer className="h-4 w-4 text-purple-500" />
      case 'bounce': return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'delivery': return <Send className="h-4 w-4 text-green-500" />
      case 'unsubscribe': return <User className="h-4 w-4 text-orange-500" />
      default: return <Activity className="h-4 w-4 text-gray-500" />
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
            <h1 className="text-2xl font-bold">Detalhes do Email</h1>
            <p className="text-muted-foreground">ID: {email.id}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {getStatusIcon(email.status)}
          {getStatusBadge(email)}
        </div>
      </div>

      {/* Email Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Informações do Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">De</label>
              <div className="flex items-center gap-2">
                <span className="font-mono">{email.from_email}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(email.from_email)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Para</label>
              <div className="flex items-center gap-2">
                <span className="font-mono">{email.to_email}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(email.to_email)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Assunto</label>
              <p className="font-medium">{email.subject}</p>
            </div>
            
            {email.bounce_reason && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-destructive">Motivo do Bounce</label>
                <p className="text-destructive">{email.bounce_reason}</p>
              </div>
            )}
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Criado</p>
                <p className="text-sm font-medium">{formatDate(email.created_at)}</p>
              </div>
            </div>
            
            {email.sent_at && (
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Enviado</p>
                  <p className="text-sm font-medium">{formatDate(email.sent_at)}</p>
                </div>
              </div>
            )}
            
            {email.opened_at && (
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Aberto</p>
                  <p className="text-sm font-medium">{formatDate(email.opened_at)}</p>
                </div>
              </div>
            )}
            
            {email.clicked_at && (
              <div className="flex items-center gap-2">
                <MousePointer className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Clicado</p>
                  <p className="text-sm font-medium">{formatDate(email.clicked_at)}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Conteúdo do Email</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={!showHtmlContent ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowHtmlContent(false)}
              >
                Texto
              </Button>
              <Button
                variant={showHtmlContent ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowHtmlContent(true)}
              >
                HTML
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showHtmlContent ? (
            <div className="border rounded-lg p-4">
              {email.html_content ? (
                <SafeHTML html={email.html_content} strict className="prose max-w-none" />
              ) : (
                <p className="text-muted-foreground">Conteúdo HTML não disponível</p>
              )}
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-gray-50">
              <pre className="whitespace-pre-wrap text-sm">
                {email.text_content || 'Conteúdo de texto não disponível'}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics */}
      {analytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Analytics de Engajamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead>Localização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEventIcon(event.event_type)}
                        <span>{getEventTypeLabel(event.event_type)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">{formatRelativeTime(event.created_at)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(event.created_at)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.link_url && (
                        <div className="flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          <a 
                            href={event.link_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-sm truncate max-w-[200px]"
                          >
                            {event.link_url}
                          </a>
                        </div>
                      )}
                      {event.user_agent && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {event.user_agent}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="text-sm">
                          {event.location || event.ip_address || 'N/A'}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
