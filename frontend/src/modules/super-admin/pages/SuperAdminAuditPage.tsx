import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { superAdminApi } from '@/lib/api'
import type { AuditLogRow } from '../types'
import { toPagination } from '../utils'

export function SuperAdminAuditPage() {
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['super-admin', 'audit', page],
    queryFn: async () => {
      const payload = (await superAdminApi.getAuditLogs({ page, limit: 20 })).data.data
      return {
        rows: (payload.logs || []) as AuditLogRow[],
        pagination: toPagination(payload.pagination)
      }
    }
  })

  const rows = query.data?.rows || []
  const pagination = query.data?.pagination

  return (
    <div className="space-y-4">
      <Card className="border-violet-200">
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
          <CardDescription>Rastreabilidade completa de ações super admin.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Ação</th>
                <th className="px-2 py-2">Alvo</th>
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2">Origem IP</th>
                <th className="px-2 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">Carregando auditoria...</td>
                </tr>
              )}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">Nenhum registro encontrado.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-3 font-medium">{row.action}</td>
                  <td className="px-2 py-3">{row.target_type}{row.target_id ? ` #${row.target_id}` : ''}</td>
                  <td className="px-2 py-3">{row.reason || '-'}</td>
                  <td className="px-2 py-3">{row.ip_address || '-'}</td>
                  <td className="px-2 py-3">{new Date(row.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>

        <CardContent className="flex items-center justify-between pt-0">
          <span className="text-xs text-muted-foreground">
            Total: {pagination?.total || 0}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={(pagination?.page || 1) <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {pagination?.page || 1}/{pagination?.total_pages || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={(pagination?.page || 1) >= (pagination?.total_pages || 1)}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
