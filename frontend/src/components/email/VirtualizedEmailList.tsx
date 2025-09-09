import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import InfiniteLoader from 'react-window-infinite-loader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Mail, 
  Eye, 
  MousePointer, 
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Calendar,
  User
} from 'lucide-react'
import { formatDistance } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { type Email } from '@/hooks/useEmails'
import { type InfiniteEmailsResult } from '@/hooks/useInfiniteEmails'

/**
 * Configurações da lista virtualizada
 */
const VIRTUALIZED_CONFIG = {
  ITEM_HEIGHT: 80,           // Altura fixa de cada item
  OVERSCAN_COUNT: 5,         // Itens extras para render fora da viewport
  SCROLL_THRESHOLD: 15,      // Threshold para infinite scroll
  SELECTION_ENABLED: true,   // Habilitar seleção múltipla
  PREFETCH_MARGIN: 200,      // Margem para prefetch
} as const

/**
 * Props do componente principal
 */
interface VirtualizedEmailListProps {
  infiniteQuery: InfiniteEmailsResult
  height?: number
  width?: string | number
  onEmailClick?: (email: Email) => void
  onEmailSelect?: (selectedIds: Set<number>) => void
  selectedEmails?: Set<number>
  showSelection?: boolean
  showAnalytics?: boolean
  className?: string
  itemClassName?: string
  loadingComponent?: React.ComponentType
  emptyComponent?: React.ComponentType
}

/**
 * Props do item individual
 */
interface EmailItemProps {
  index: number
  style: React.CSSProperties
  data: {
    emails: Email[]
    isItemLoaded: (index: number) => boolean
    onEmailClick?: (email: Email) => void
    onEmailSelect?: (emailId: number, selected: boolean) => void
    selectedEmails: Set<number>
    showSelection: boolean
    showAnalytics: boolean
    itemClassName?: string
  }
}

/**
 * Componente do item individual da lista
 * Otimizado com React.memo para evitar re-renders desnecessários
 */
const EmailItem = React.memo<EmailItemProps>(({ index, style, data }) => {
  const {
    emails,
    isItemLoaded,
    onEmailClick,
    onEmailSelect,
    selectedEmails,
    showSelection,
    showAnalytics,
    itemClassName
  } = data

  // Verificar se o item está carregado
  const isLoaded = isItemLoaded(index)
  
  if (!isLoaded) {
    return (
      <div style={style} className={cn('px-4 py-2', itemClassName)}>
        <EmailItemSkeleton />
      </div>
    )
  }

  const email = emails[index]
  if (!email) {
    return (
      <div style={style} className={cn('px-4 py-2', itemClassName)}>
        <EmailItemSkeleton />
      </div>
    )
  }

  const isSelected = selectedEmails.has(email.id)

  const handleClick = useCallback(() => {
    onEmailClick?.(email)
  }, [email, onEmailClick])

  const handleCheckboxChange = useCallback((checked: boolean) => {
    onEmailSelect?.(email.id, checked)
  }, [email.id, onEmailSelect])

  return (
    <div 
      style={style} 
      className={cn(
        'px-4 py-2 border-b hover:bg-muted/50 transition-colors cursor-pointer group',
        isSelected && 'bg-primary/5 border-primary/20',
        itemClassName
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox para seleção */}
        {showSelection && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
        )}

        {/* Status visual */}
        <div className="flex-shrink-0">
          <StatusIcon status={email.status} />
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-medium text-sm truncate">
                {email.to_email}
              </span>
              {email.tracking_enabled && (
                <Mail className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={email.status} />
              <span className="text-xs text-muted-foreground">
                {formatDistance(new Date(email.created_at), new Date(), { 
                  addSuffix: true,
                  locale: ptBR 
                })}
              </span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground truncate mb-1">
            {email.subject}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="truncate max-w-[150px]">{email.from_email}</span>
              {email.sent_at && (
                <>
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDistance(new Date(email.sent_at), new Date(), { 
                      addSuffix: true,
                      locale: ptBR 
                    })}
                  </span>
                </>
              )}
            </div>

            {/* Analytics (se habilitado) */}
            {showAnalytics && email.analytics && (
              <div className="flex items-center gap-3 text-xs">
                {email.analytics.opens > 0 && (
                  <div className="flex items-center gap-1 text-blue-600">
                    <Eye className="h-3 w-3" />
                    <span>{email.analytics.opens}</span>
                  </div>
                )}
                {email.analytics.clicks > 0 && (
                  <div className="flex items-center gap-1 text-green-600">
                    <MousePointer className="h-3 w-3" />
                    <span>{email.analytics.clicks}</span>
                  </div>
                )}
                {email.analytics.engagement_score > 0 && (
                  <div className="flex items-center gap-1 text-purple-600">
                    <TrendingUp className="h-3 w-3" />
                    <span>{email.analytics.engagement_score}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

EmailItem.displayName = 'EmailItem'

/**
 * Componente de skeleton para loading
 */
const EmailItemSkeleton = React.memo(() => (
  <div className="flex items-center gap-3 animate-pulse">
    <div className="flex-shrink-0">
      <div className="h-4 w-4 bg-muted rounded-full" />
    </div>
    <div className="flex-1 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  </div>
))

EmailItemSkeleton.displayName = 'EmailItemSkeleton'

/**
 * Ícone de status do email
 */
const StatusIcon = React.memo<{ status: Email['status'] }>(({ status }) => {
  const iconProps = { className: "h-4 w-4" }
  
  switch (status) {
    case 'delivered':
    case 'opened':
    case 'clicked':
      return <CheckCircle {...iconProps} className={cn(iconProps.className, "text-green-500")} />
    case 'sent':
      return <Clock {...iconProps} className={cn(iconProps.className, "text-blue-500")} />
    case 'queued':
    case 'draft':
      return <Clock {...iconProps} className={cn(iconProps.className, "text-yellow-500")} />
    case 'bounced':
    case 'failed':
      return <XCircle {...iconProps} className={cn(iconProps.className, "text-red-500")} />
    default:
      return <AlertCircle {...iconProps} className={cn(iconProps.className, "text-muted-foreground")} />
  }
})

StatusIcon.displayName = 'StatusIcon'

/**
 * Badge de status do email
 */
const StatusBadge = React.memo<{ status: Email['status'] }>(({ status }) => {
  const getVariant = (status: Email['status']) => {
    switch (status) {
      case 'delivered':
      case 'opened':
      case 'clicked':
        return 'default'
      case 'sent':
        return 'secondary'
      case 'queued':
      case 'draft':
        return 'outline'
      case 'bounced':
      case 'failed':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const getDisplayText = (status: Email['status']) => {
    const statusMap: Record<Email['status'], string> = {
      'draft': 'Rascunho',
      'queued': 'Na Fila',
      'sent': 'Enviado',
      'delivered': 'Entregue',
      'bounced': 'Rejeitado',
      'failed': 'Falhou',
      'opened': 'Aberto',
      'clicked': 'Clicado'
    }
    return statusMap[status] || status
  }

  return (
    <Badge variant={getVariant(status)} className="text-xs">
      {getDisplayText(status)}
    </Badge>
  )
})

StatusBadge.displayName = 'StatusBadge'

/**
 * Componente principal da lista virtualizada
 */
export const VirtualizedEmailList: React.FC<VirtualizedEmailListProps> = ({
  infiniteQuery,
  height = 600,
  width = '100%',
  onEmailClick,
  onEmailSelect,
  selectedEmails = new Set(),
  showSelection = false,
  showAnalytics = true,
  className,
  itemClassName,
  loadingComponent: LoadingComponent,
  emptyComponent: EmptyComponent
}) => {
  const listRef = useRef<List>(null)
  const [localSelectedEmails, setLocalSelectedEmails] = useState<Set<number>>(selectedEmails)

  // Sincronizar seleção local com prop externa
  useEffect(() => {
    setLocalSelectedEmails(selectedEmails)
  }, [selectedEmails])

  const { emails, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } = infiniteQuery

  // Função para verificar se um item está carregado
  const isItemLoaded = useCallback(
    (index: number): boolean => !!emails[index],
    [emails]
  )

  // Função para carregar mais itens
  const loadMoreItems = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Handle da seleção de emails
  const handleEmailSelect = useCallback(
    (emailId: number, selected: boolean) => {
      const newSelected = new Set(localSelectedEmails)
      if (selected) {
        newSelected.add(emailId)
      } else {
        newSelected.delete(emailId)
      }
      setLocalSelectedEmails(newSelected)
      onEmailSelect?.(newSelected)
    },
    [localSelectedEmails, onEmailSelect]
  )

  // Seleção em massa
  const handleSelectAll = useCallback(() => {
    const allIds = new Set(emails.map(email => email.id))
    setLocalSelectedEmails(allIds)
    onEmailSelect?.(allIds)
  }, [emails, onEmailSelect])

  const handleDeselectAll = useCallback(() => {
    const empty = new Set<number>()
    setLocalSelectedEmails(empty)
    onEmailSelect?.(empty)
  }, [onEmailSelect])

  // Dados memoizados para o item renderer
  const itemData = useMemo(
    () => ({
      emails,
      isItemLoaded,
      onEmailClick,
      onEmailSelect: handleEmailSelect,
      selectedEmails: localSelectedEmails,
      showSelection,
      showAnalytics,
      itemClassName
    }),
    [
      emails,
      isItemLoaded,
      onEmailClick,
      handleEmailSelect,
      localSelectedEmails,
      showSelection,
      showAnalytics,
      itemClassName
    ]
  )

  // Loading state
  if (isLoading && emails.length === 0) {
    return LoadingComponent ? (
      <LoadingComponent />
    ) : (
      <div className={cn('p-6', className)}>
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="p-4 border-b">
              <EmailItemSkeleton />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (!isLoading && emails.length === 0) {
    return EmptyComponent ? (
      <EmptyComponent />
    ) : (
      <Card className={cn('p-8 text-center', className)}>
        <CardContent>
          <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum email encontrado</h3>
          <p className="text-muted-foreground">
            Não há emails que correspondam aos critérios selecionados.
          </p>
        </CardContent>
      </Card>
    )
  }

  const itemCount = hasNextPage ? emails.length + 1 : emails.length

  return (
    <div className={cn('border rounded-lg overflow-hidden bg-background', className)}>
      {/* Header com controles de seleção */}
      {showSelection && (
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {localSelectedEmails.size > 0 
                ? `${localSelectedEmails.size} selecionado(s)`
                : `${emails.length} email(s)`
              }
            </span>
            {localSelectedEmails.size > 0 && (
              <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                Desmarcar todos
              </Button>
            )}
            {localSelectedEmails.size === 0 && emails.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                Selecionar todos
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Lista virtualizada com infinite loader */}
      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={itemCount}
        loadMoreItems={loadMoreItems}
        threshold={VIRTUALIZED_CONFIG.SCROLL_THRESHOLD}
      >
        {({ onItemsRendered, ref }) => (
          <List
            ref={(list) => {
              listRef.current = list
              ref(list)
            }}
            height={height}
            width={width}
            itemCount={itemCount}
            itemSize={VIRTUALIZED_CONFIG.ITEM_HEIGHT}
            itemData={itemData}
            onItemsRendered={onItemsRendered}
            overscanCount={VIRTUALIZED_CONFIG.OVERSCAN_COUNT}
          >
            {EmailItem}
          </List>
        )}
      </InfiniteLoader>

      {/* Footer com loading indicator */}
      {isFetchingNextPage && (
        <div className="p-4 border-t bg-muted/20 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-sm text-muted-foreground">
              Carregando mais emails...
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Hook para controlar a lista virtualizada externamente
 */
export const useVirtualizedEmailListControl = () => {
  const listRef = useRef<List>(null)

  return {
    // Rolar para um índice específico
    scrollToItem: (index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start') => {
      listRef.current?.scrollToItem(index, align)
    },

    // Rolar para o topo
    scrollToTop: () => {
      listRef.current?.scrollToItem(0, 'start')
    },

    // Rolar para o fim
    scrollToBottom: () => {
      listRef.current?.scrollToItem(99999, 'end')
    },

    // Ref da lista
    listRef
  }
}

export default VirtualizedEmailList