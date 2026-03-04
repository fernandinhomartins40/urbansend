export interface EmailAnalyticsEventLike {
  event_type?: string
  created_at?: string
}

const normalizeStatus = (status?: string | null) => String(status || '').toLowerCase()
const normalizeEventType = (eventType?: string | null) => String(eventType || '').toLowerCase()

export const getEmailStatusLabel = (status?: string | null) => {
  switch (normalizeStatus(status)) {
    case 'pending':
      return 'Processando'
    case 'sent':
      return 'Enviado'
    case 'delivered':
      return 'Aceito pelo servidor'
    case 'open':
    case 'opened':
      return 'Aberto'
    case 'click':
    case 'clicked':
      return 'Clicado'
    case 'queued':
      return 'Na fila'
    case 'failed':
      return 'Falhou'
    case 'bounced':
      return 'Bounce'
    default:
      return status || 'Desconhecido'
  }
}

export const isEmailOpened = (status?: string | null) => {
  const normalized = normalizeStatus(status)
  return normalized === 'opened' || normalized === 'clicked'
}

export const isEmailClicked = (status?: string | null) => normalizeStatus(status) === 'clicked'

const getFirstEventTimestamp = (events: EmailAnalyticsEventLike[], acceptedTypes: string[]) => {
  const timestamps = events
    .filter((event) => acceptedTypes.includes(normalizeEventType(event.event_type)))
    .map((event) => event.created_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())

  return timestamps[0]?.toISOString()
}

export const getClickedAtFromAnalytics = (events: EmailAnalyticsEventLike[]) =>
  getFirstEventTimestamp(events, ['click', 'clicked'])

export const getOpenedAtFromAnalytics = (events: EmailAnalyticsEventLike[], status?: string | null) =>
  getFirstEventTimestamp(events, ['open', 'opened']) ||
  (isEmailClicked(status) ? getClickedAtFromAnalytics(events) : undefined)
