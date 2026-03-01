import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Calendar, CheckCircle, Clock, Eye, Mail, MousePointer, TrendingUp, User, XCircle } from 'lucide-react'
import { formatDistance } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { type Email } from '@/hooks/useEmails'
import { type InfiniteEmailsResult } from '@/hooks/useInfiniteEmails'

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

const StatusIcon = ({ status }: { status: Email['status'] }) => {
  switch (status) {
    case 'delivered':
    case 'opened':
    case 'clicked':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'sent':
      return <Clock className="h-4 w-4 text-blue-500" />
    case 'queued':
    case 'draft':
      return <Clock className="h-4 w-4 text-yellow-500" />
    case 'bounced':
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />
  }
}

const StatusBadge = ({ status }: { status: Email['status'] }) => {
  const labelMap: Record<Email['status'], string> = {
    draft: 'Rascunho',
    queued: 'Na fila',
    sent: 'Enviado',
    delivered: 'Entregue',
    bounced: 'Rejeitado',
    failed: 'Falhou',
    opened: 'Aberto',
    clicked: 'Clicado',
  }

  const variant =
    status === 'delivered' || status === 'opened' || status === 'clicked'
      ? 'default'
      : status === 'bounced' || status === 'failed'
        ? 'destructive'
        : status === 'queued' || status === 'draft'
          ? 'outline'
          : 'secondary'

  return <Badge variant={variant}>{labelMap[status]}</Badge>
}

const EmailItemSkeleton = () => (
  <div className="flex items-center gap-3 border-b px-4 py-3">
    <Skeleton className="h-4 w-4 rounded-full" />
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
)

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
  emptyComponent: EmptyComponent,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [localSelectedEmails, setLocalSelectedEmails] = useState<Set<number>>(selectedEmails)
  const { emails, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } = infiniteQuery

  useEffect(() => {
    setLocalSelectedEmails(selectedEmails)
  }, [selectedEmails])

  const handleEmailSelect = useCallback(
    (emailId: number, checked: boolean) => {
      if (emailId === -1) {
        const empty = new Set<number>()
        setLocalSelectedEmails(empty)
        onEmailSelect?.(empty)
        return
      }

      const nextSelected = new Set(localSelectedEmails)
      if (checked) {
        nextSelected.add(emailId)
      } else {
        nextSelected.delete(emailId)
      }

      setLocalSelectedEmails(nextSelected)
      onEmailSelect?.(nextSelected)
    },
    [localSelectedEmails, onEmailSelect]
  )

  const handleScroll = useCallback(async () => {
    const element = containerRef.current
    if (!element || !hasNextPage || isFetchingNextPage) {
      return
    }

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (remaining < 200) {
      await fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const visibleEmails = useMemo(() => emails, [emails])

  if (isLoading && visibleEmails.length === 0) {
    return LoadingComponent ? (
      <LoadingComponent />
    ) : (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: 8 }).map((_, index) => (
          <EmailItemSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (!isLoading && visibleEmails.length === 0) {
    return EmptyComponent ? (
      <EmptyComponent />
    ) : (
      <Card className={cn('p-8 text-center', className)}>
        <CardContent>
          <Mail className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">Nenhum email encontrado</h3>
          <p className="text-muted-foreground">Nao ha emails para os filtros atuais.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-background', className)} style={{ width }}>
      {showSelection && (
        <div className="flex items-center justify-between border-b bg-muted/20 p-4">
          <span className="text-sm text-muted-foreground">
            {localSelectedEmails.size > 0 ? `${localSelectedEmails.size} selecionado(s)` : `${visibleEmails.length} email(s)`}
          </span>
          {localSelectedEmails.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => handleEmailSelect(-1, false)}>
              Limpar selecao
            </Button>
          )}
        </div>
      )}

      <div ref={containerRef} className="overflow-y-auto" style={{ height }} onScroll={handleScroll}>
        {visibleEmails.map((email) => {
          const isSelected = localSelectedEmails.has(email.id)

          return (
            <div
              key={email.id}
              className={cn(
                'cursor-pointer border-b px-4 py-3 transition-colors hover:bg-muted/50',
                isSelected && 'bg-primary/5',
                itemClassName
              )}
              onClick={() => onEmailClick?.(email)}
            >
              <div className="flex items-center gap-3">
                {showSelection && (
                  <div onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={isSelected} onCheckedChange={(value) => handleEmailSelect(email.id, Boolean(value))} />
                  </div>
                )}

                <StatusIcon status={email.status} />

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{email.to_email}</div>
                      <div className="truncate text-sm text-muted-foreground">{email.subject}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={email.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatDistance(new Date(email.created_at), new Date(), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      <span className="truncate">{email.from_email}</span>
                      {email.sent_at && (
                        <>
                          <Calendar className="h-3 w-3" />
                          <span>{formatDistance(new Date(email.sent_at), new Date(), { addSuffix: true, locale: ptBR })}</span>
                        </>
                      )}
                    </div>

                    {showAnalytics && email.analytics && (
                      <div className="flex items-center gap-3">
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
        })}

        {isFetchingNextPage && (
          <div className="border-t p-4 text-center text-sm text-muted-foreground">Carregando mais emails...</div>
        )}
      </div>
    </div>
  )
}

export const useVirtualizedEmailListControl = () => {
  return {
    scrollToItem: (_index: number) => undefined,
    scrollToTop: () => undefined,
    scrollToBottom: () => undefined,
    listRef: { current: null },
  }
}

export default VirtualizedEmailList
