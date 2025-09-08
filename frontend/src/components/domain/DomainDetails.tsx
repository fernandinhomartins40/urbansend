import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  XCircle,
  Copy,
  RefreshCw,
  Settings,
  ArrowLeft,
  Eye,
  Globe,
  Shield,
  Key
} from 'lucide-react';
import { useDomainSetup, DomainDetails as DomainDetailsType } from '../../hooks/useDomainSetup';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface DomainDetailsProps {
  domainId: number;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (domainId: number) => void;
}

export const DomainDetails: React.FC<DomainDetailsProps> = ({
  domainId,
  isOpen,
  onClose,
  onEdit
}) => {
  const [domainDetails, setDomainDetails] = useState<DomainDetailsType | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const { 
    loadDomainDetails, 
    verifyDomainSetup, 
    getDNSInstructions,
    regenerateDKIMKeys
  } = useDomainSetup();

  useEffect(() => {
    if (isOpen && domainId) {
      loadDomainData();
    }
  }, [isOpen, domainId]);

  const loadDomainData = async () => {
    setLoading(true);
    try {
      const details = await loadDomainDetails(domainId);
      setDomainDetails(details);
    } catch (error) {
      toast.error('Erro ao carregar detalhes do domínio');
      console.error('Failed to load domain details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDomain = async () => {
    setVerifying(true);
    try {
      await verifyDomainSetup(domainId);
      await loadDomainData(); // Recarregar dados após verificação
    } catch (error) {
      console.error('Verification failed:', error);
    } finally {
      setVerifying(false);
    }
  };

  const handleRegenerateDKIM = async () => {
    try {
      await regenerateDKIMKeys(domainId);
      await loadDomainData(); // Recarregar dados após regeneração
    } catch (error) {
      console.error('DKIM regeneration failed:', error);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado para área de transferência!`);
    } catch (error) {
      toast.error('Falha ao copiar para área de transferência');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'partial':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
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

  const renderConfigStatus = (config: any, title: string, icon: React.ReactNode) => (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {icon}
          <h3 className="font-medium">{title}</h3>
        </div>
        <Badge 
          variant={config.configured && config.dns_valid ? "default" : "destructive"}
          className="text-xs"
        >
          {config.configured && config.dns_valid ? 'Configurado' : 'Pendente'}
        </Badge>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Habilitado:</span>
          <span>{config.enabled ? '✅ Sim' : '❌ Não'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Configurado:</span>
          <span>{config.configured ? '✅ Sim' : '❌ Não'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">DNS Válido:</span>
          <span>{config.dns_valid ? '✅ Sim' : '❌ Não'}</span>
        </div>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            <span>Carregando detalhes do domínio...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!domainDetails) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">Erro ao Carregar</h3>
            <p className="text-gray-600 mb-4">Não foi possível carregar os detalhes do domínio.</p>
            <Button onClick={loadDomainData}>Tentar Novamente</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const domain = domainDetails.domain;
  const config = domainDetails.configuration;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Globe className="w-5 h-5" />
            <span>Detalhes do Domínio: {domain.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Geral */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {getStatusIcon(domain.status)}
                <div>
                  <h3 className="font-medium text-lg">{domain.name}</h3>
                  <p className="text-sm text-gray-600">
                    Criado em {format(new Date(domain.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className={getStatusColor(domain.status)}>
                  {domain.status === 'verified' ? 'Verificado' : 
                   domain.status === 'partial' ? 'Parcial' : 
                   domain.status === 'pending' ? 'Pendente' : 'Falhou'}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyDomainName(domain.name)}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Progresso da Configuração</span>
                <span className="text-sm text-gray-600">{domain.completion_percentage}%</span>
              </div>
              <Progress value={domain.completion_percentage} className="h-2" />
            </div>

            {domain.verified_at && (
              <div className="mt-3 text-sm text-green-600">
                ✅ Verificado em {format(new Date(domain.verified_at), 'dd/MM/yyyy HH:mm')}
              </div>
            )}
          </Card>

          {/* Configurações DNS */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Configurações de Autenticação</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderConfigStatus(
                config.spf, 
                'SPF Record', 
                <Shield className="w-4 h-4 text-blue-600" />
              )}
              
              {renderConfigStatus(
                config.dkim, 
                'DKIM Signature', 
                <Key className="w-4 h-4 text-green-600" />
              )}
              
              {renderConfigStatus(
                config.dmarc, 
                'DMARC Policy', 
                <Shield className="w-4 h-4 text-purple-600" />
              )}
            </div>
          </div>

          {/* DKIM Details */}
          {config.dkim.enabled && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium flex items-center space-x-2">
                  <Key className="w-4 h-4" />
                  <span>Detalhes DKIM</span>
                </h4>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleRegenerateDKIM}
                >
                  Regenerar Chaves
                </Button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Selector:</span>
                  <span className="font-mono">{config.dkim.selector}</span>
                </div>
                {config.dkim.public_key && (
                  <div>
                    <div className="text-gray-600 mb-1">Chave Pública:</div>
                    <div className="bg-gray-50 p-2 rounded text-xs font-mono break-all">
                      {config.dkim.public_key.substring(0, 100)}...
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Separator />

          {/* Ações */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Fechar
            </Button>
            
            <div className="space-x-2">
              <Button
                variant="outline"
                onClick={handleVerifyDomain}
                disabled={verifying}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${verifying ? 'animate-spin' : ''}`} />
                {verifying ? 'Verificando...' : 'Verificar DNS'}
              </Button>
              
              <Button onClick={() => onEdit?.(domain.id)}>
                <Settings className="w-4 h-4 mr-2" />
                Editar Configuração
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Helper function
const copyDomainName = async (domainName: string) => {
  try {
    await navigator.clipboard.writeText(domainName);
    toast.success('Nome do domínio copiado para área de transferência');
  } catch (error) {
    toast.error('Falha ao copiar nome do domínio');
  }
};