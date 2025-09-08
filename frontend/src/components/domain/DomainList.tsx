import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useDomainSetup, DomainStatus } from '../../hooks/useDomainSetup';
import { 
  Plus, 
  Settings, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  XCircle,
  Eye,
  Copy
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface DomainListProps {
  onAddDomain?: () => void;
  onViewDomain?: (domainId: number) => void;
  onEditDomain?: (domainId: number) => void;
}

export const DomainList: React.FC<DomainListProps> = ({
  onAddDomain,
  onViewDomain,
  onEditDomain
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<DomainStatus | null>(null);

  const {
    loading,
    error,
    domains,
    loadDomains,
    removeDomain,
    refreshDomain
  } = useDomainSetup();

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const getStatusColor = (status: DomainStatus['status']) => {
    switch (status) {
      case 'verified':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'pending':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: DomainStatus['status']) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: DomainStatus['status']) => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'partial':
        return 'Partial Setup';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const handleDeleteDomain = async () => {
    if (!domainToDelete) return;

    try {
      await removeDomain(domainToDelete.id);
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
    } catch (error) {
      console.error('Failed to delete domain:', error);
    }
  };

  const handleRefreshDomain = async (domainId: number) => {
    try {
      await refreshDomain(domainId);
      toast.success('Domain status refreshed');
    } catch (error) {
      console.error('Failed to refresh domain:', error);
    }
  };

  const copyDomainName = async (domainName: string) => {
    try {
      await navigator.clipboard.writeText(domainName);
      toast.success('Domain name copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy domain name');
    }
  };

  const renderDNSStatus = (domain: DomainStatus) => {
    const checks = [
      { name: 'DKIM', status: domain.dns_status.dkim },
      { name: 'SPF', status: domain.dns_status.spf },
      { name: 'DMARC', status: domain.dns_status.dmarc }
    ];

    return (
      <div className="flex space-x-2">
        {checks.map(({ name, status }) => (
          <Badge
            key={name}
            variant={status.valid ? "default" : "destructive"}
            className="text-xs"
          >
            {name} {status.valid ? '✓' : '✗'}
          </Badge>
        ))}
      </div>
    );
  };

  const renderEmptyState = () => (
    <Card className="p-8 text-center">
      <div className="max-w-md mx-auto">
        <div className="mb-4">
          <Globe className="w-12 h-12 text-gray-400 mx-auto" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Nenhum domínio adicionado
        </h3>
        <p className="text-gray-600 mb-6">
          Adicione seu primeiro domínio para começar a enviar emails autenticados através do UltraZend.
        </p>
        <Button onClick={onAddDomain}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Domínio
        </Button>
      </div>
    </Card>
  );

  const renderDomainCard = (domain: DomainStatus) => (
    <Card key={domain.id} className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold">{domain.name}</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyDomainName(domain.name)}
              className="p-1"
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          
          <div className="flex items-center space-x-2 mb-2">
            <Badge className={getStatusColor(domain.status)}>
              {getStatusIcon(domain.status)}
              <span className="ml-1">{getStatusLabel(domain.status)}</span>
            </Badge>
            {domain.is_verified && (
              <Badge variant="outline" className="text-green-600">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            <div>Created: {format(new Date(domain.created_at), 'MMM dd, yyyy')}</div>
            {domain.verified_at && (
              <div>Verified: {format(new Date(domain.verified_at), 'MMM dd, yyyy HH:mm')}</div>
            )}
          </div>
        </div>

        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRefreshDomain(domain.id)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewDomain?.(domain.id)}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditDomain?.(domain.id)}
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDomainToDelete(domain);
              setDeleteDialogOpen(true);
            }}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Setup Progress</span>
          <span className="text-sm text-gray-600">{domain.completion_percentage}%</span>
        </div>
        <Progress value={domain.completion_percentage} className="h-2" />
      </div>

      {/* DNS Status */}
      <div className="mb-4">
        <div className="text-sm font-medium mb-2">DNS Configuration</div>
        {renderDNSStatus(domain)}
      </div>

      {/* Status specific messages */}
      {domain.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
            <span className="text-sm text-red-700">
              Domain verification failed. Click the settings button to view details and retry.
            </span>
          </div>
        </div>
      )}

      {domain.status === 'partial' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
            <span className="text-sm text-yellow-700">
              Some DNS records are missing or incorrect. Complete the setup to start sending emails.
            </span>
          </div>
        </div>
      )}

      {domain.status === 'pending' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center">
            <Clock className="w-4 h-4 text-blue-600 mr-2" />
            <span className="text-sm text-blue-700">
              DNS records are being verified. This may take a few minutes.
            </span>
          </div>
        </div>
      )}

      {domain.status === 'verified' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center">
            <CheckCircle2 className="w-4 h-4 text-green-600 mr-2" />
            <span className="text-sm text-green-700">
              Domain is fully configured and ready for sending emails!
            </span>
          </div>
        </div>
      )}
    </Card>
  );

  if (loading && domains.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading domains...</span>
      </div>
    );
  }

  const renderErrorState = () => {
    const isAuthError = error?.includes('token') || error?.includes('Access') || error?.includes('login');
    
    return (
      <Card className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900 mb-2">
          {isAuthError ? 'Autenticação Necessária' : 'Erro ao Carregar Domínios'}
        </h3>
        <p className="text-gray-600 mb-4">
          {isAuthError ? 'Faça login para visualizar e gerenciar seus domínios.' : error}
        </p>
        <div className="flex justify-center space-x-3">
          <Button onClick={loadDomains} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
          {isAuthError && (
            <Button onClick={onAddDomain}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Domínio
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header - Always visible */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Seus Domínios</h2>
          <p className="text-gray-600">
            Gerencie seus domínios configurados para envio de emails
          </p>
        </div>
        <Button onClick={onAddDomain}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Domínio
        </Button>
      </div>

      {/* Content Area */}
      {error && domains.length === 0 ? (
        renderErrorState()
      ) : (
        <>
          {/* Summary Stats */}
          {domains.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{domains.length}</div>
                <div className="text-sm text-gray-600">Total</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {domains.filter(d => d.status === 'verified').length}
                </div>
                <div className="text-sm text-gray-600">Verificados</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {domains.filter(d => d.status === 'partial').length}
                </div>
                <div className="text-sm text-gray-600">Parciais</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {domains.filter(d => d.status === 'failed').length}
                </div>
                <div className="text-sm text-gray-600">Com Falha</div>
              </Card>
            </div>
          )}

          {/* Domain List */}
          {domains.length === 0 ? (
            renderEmptyState()
          ) : (
            <div className="grid gap-4">
              {domains.map(renderDomainCard)}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Remover Domínio"
        description={
          domainToDelete
            ? `Tem certeza que deseja remover o domínio ${domainToDelete.name}? Esta ação não pode ser desfeita.`
            : ''
        }
        onConfirm={handleDeleteDomain}
        variant="danger"
      />
    </div>
  );
};