import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { copyToClipboard } from '@/lib/utils'

interface CodeSnippetCardProps {
  title: string
  description?: string
  code: string
  language?: string
}

export function CodeSnippetCard({ title, description, code, language }: CodeSnippetCardProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-col items-start justify-between gap-3 space-y-0 sm:flex-row">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {language ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600">
              {language}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(code)}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
          <code>{code}</code>
        </pre>
      </CardContent>
    </Card>
  )
}
