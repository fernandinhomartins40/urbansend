import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('vm-page-header', className)}>
      <div className="min-w-0">
        <h1 className="vm-page-title">{title}</h1>
        {description ? <p className="vm-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
    </header>
  )
}

interface PageHeroProps {
  children: ReactNode
  className?: string
}

export function PageHero({ children, className }: PageHeroProps) {
  return <section className={cn('vm-page-hero', className)}>{children}</section>
}
