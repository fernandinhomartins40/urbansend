import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert } from '../ui/alert';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { useDomainSetup, DNSInstructions, VerificationResult, DomainSetupResult } from '../../hooks/useDomainSetup';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Info } from 'lucide-react';
import toast from 'react-hot-toast';

interface DomainSetupWizardProps {
  onComplete?: (domainId: number) => void;
  onCancel?: () => void;
  initialDomain?: string;
  editDomainId?: number; // Para edição de domínio existente
}

export const DomainSetupWizard: React.FC<DomainSetupWizardProps> = ({
  onComplete,
  onCancel,
  initialDomain = '',
  editDomainId
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [domain, setDomain] = useState(initialDomain);
  const [setupResult, setSetupResult] = useState<DomainSetupResult | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const {
    loading,
    error,
    initiateDomainSetup,
    verifyDomainSetup,
    loadDomainDetails,
    getDNSInstructions,
    clearError
  } = useDomainSetup();

  const steps = [
    { label: 'Inserir Domínio', description: 'Forneça o nome do seu domínio' },
    { label: 'Configurar DNS', description: 'Adicionar registros DNS ao seu domínio' },
    { label: 'Verificar Config.', description: 'Verificar configuração DNS' },
    { label: 'Concluído', description: 'Configuração concluída com sucesso' }
  ];

  // Limpar erros quando o componente for montado ou o step mudar
  useEffect(() => {
    clearError();
  }, [currentStep, clearError]);

  // Carregar dados do domínio para edição
  useEffect(() => {
    if (editDomainId) {
      setIsEditMode(true);
      loadExistingDomain();
    }
  }, [editDomainId]);

  const loadExistingDomain = async () => {
    if (!editDomainId) return;
    
    try {
      const domainDetails = await loadDomainDetails(editDomainId);
      setDomain(domainDetails.domain.name);
      
      // Se o domínio já tem algumas configurações, buscar instruções DNS
      if (domainDetails.domain.completion_percentage > 0) {
        const dnsInstructions = await getDNSInstructions(editDomainId);
        // Reconstituir dados do setup para permitir navegação no wizard (domínio já cadastrado)
        setSetupResult({
          domain: domainDetails.domain,
          dns_instructions: dnsInstructions.instructions,
          setup_guide: dnsInstructions.setup_guide,
          verification_token: domainDetails.domain.verification_token
        });
        setCurrentStep(1); // Ir direto para configuração DNS
      }
    } catch (error) {
      console.error('Erro ao carregar domínio para edição:', error);
    }
  };

  const handleDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!domain.trim()) {
      toast.error('Por favor, insira um nome de domínio');
      return;
    }

    try {
      const result = await initiateDomainSetup(domain.trim());
      setSetupResult(result);
      setCurrentStep(1);
    } catch (error) {
      // Error já tratado no hook
      console.error('Domain setup failed:', error);
    }
  };

  const handleVerification = async () => {
    if (!setupResult) return;

    setIsVerifying(true);
    try {
      const result = await verifyDomainSetup(setupResult.domain.id);
      setVerificationResult(result);
      
      if (result.all_passed) {
        setCurrentStep(3);
      } else {
        // Continuar no step de verificação para mostrar problemas
      }
    } catch (error) {
      console.error('Domain verification failed:', error);
    } finally {
      setIsVerifying(false);
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

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'current';
    return 'upcoming';
  };

  const calculateProgress = () => {
    return ((currentStep + 1) / steps.length) * 100;
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Assistente de Configuração de Domínio</h2>
        <Badge variant="outline">
          Etapa {currentStep + 1} de {steps.length}
        </Badge>
      </div>
      
      <Progress value={calculateProgress()} className="mb-4" />
      
      <div className="flex justify-between">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          return (
            <div key={index} className="flex flex-col items-center flex-1">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-2
                ${status === 'completed' 
                  ? 'bg-green-100 text-green-800 border-2 border-green-300'
                  : status === 'current'
                    ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-gray-200'
                }
              `}>
                {status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>
              <div className="text-center">
                <div className={`text-sm font-medium ${
                  status === 'current' ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {step.label}
                </div>
                <div className="text-xs text-gray-500">
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderDomainInputStep = () => (
    <Card className="p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">{isEditMode ? 'Editar Domínio' : 'Adicionar Seu Domínio'}</h3>
        <p className="text-gray-600">
          {isEditMode ? 'Revise e atualize as configurações do seu domínio.' : 'Insira o domínio que você deseja configurar para envio de emails através do UltraZend.'}
        </p>
      </div>

      <form onSubmit={handleDomainSubmit} className="space-y-4">
        <div>
          <Label htmlFor="domain">Nome do Domínio</Label>
          <Input
            id="domain"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            required
            disabled={loading || isEditMode}
            className="mt-1"
          />
          <p className="text-sm text-gray-500 mt-1">
            Digite seu domínio sem "www" ou "https://"
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </Alert>
        )}

        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading || !domain.trim()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Configurando...
              </>
            ) : (
              isEditMode ? 'Continuar Edição' : 'Configurar Domínio'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );

  const renderDNSRecord = (type: string, record: any) => (
    <div key={type} className="bg-gray-50 p-4 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900 uppercase">{type}</h4>
        <Badge variant="outline" className="text-xs">
          Prioridade: {record.priority}
        </Badge>
      </div>
      
      <p className="text-sm text-gray-600">{record.description}</p>
      
      <div className="space-y-2">
        <div>
          <Label className="text-xs text-gray-500">Nome do Registro</Label>
          <div className="flex items-center space-x-2">
            <code className="bg-white p-2 rounded border text-sm flex-1">
              {record.record}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(record.record, `${type} record name`)}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        <div>
          <Label className="text-xs text-gray-500">Valor do Registro</Label>
          <div className="flex items-center space-x-2">
            <code className="bg-white p-2 rounded border text-sm flex-1 break-all">
              {record.value}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(record.value, `${type} record value`)}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDNSConfigurationStep = () => (
    <Card className="p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Configurar Registros DNS</h3>
        <p className="text-gray-600">
          Adicione os seguintes registros DNS nas configurações do seu domínio.
        </p>
      </div>

      {setupResult && (
        <>
          {/* Aviso sobre configuração híbrida */}
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Info className="h-4 w-4" />
            <div>
              <h4 className="font-medium">✅ Configuração Híbrida - Mantenha seu site funcionando!</h4>
              <p className="text-sm mt-1">
                Adicione apenas os registros abaixo para habilitar emails via UltraZend.
                <strong>NÃO altere</strong> seus registros @ e www existentes.
              </p>
            </div>
          </Alert>

          {/* Registros A para email */}
          <div className="mb-6">
            <h4 className="font-medium mb-4">🎯 Registros A - Subdomínios Email (OBRIGATÓRIOS)</h4>
            <p className="text-sm text-gray-600 mb-3">Adicione estes registros SEM alterar seus registros @ e www existentes:</p>
            <div className="space-y-4">
              {setupResult.dns_instructions.a_records && Object.entries(setupResult.dns_instructions.a_records).map(([key, record]) =>
                renderDNSRecord(`A - ${key.toUpperCase()}`, record)
              )}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Registro MX */}
          <div className="mb-6">
            <h4 className="font-medium mb-4">📧 Registro MX (OBRIGATÓRIO)</h4>
            <p className="text-sm text-gray-600 mb-3">Direciona emails do seu domínio para UltraZend:</p>
            <div className="space-y-4">
              {setupResult.dns_instructions.mx && renderDNSRecord('MX', setupResult.dns_instructions.mx)}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Registros TXT */}
          <div className="mb-6">
            <h4 className="font-medium mb-4">📝 Registros TXT (Autenticação)</h4>
            <p className="text-sm text-gray-600 mb-3">Protegem contra spam e garantem entregabilidade:</p>
            <div className="space-y-4">
              {setupResult.dns_instructions.spf && renderDNSRecord('SPF', setupResult.dns_instructions.spf)}
              {setupResult.dns_instructions.dkim && renderDNSRecord('DKIM', setupResult.dns_instructions.dkim)}
              {setupResult.dns_instructions.dmarc && renderDNSRecord('DMARC', setupResult.dns_instructions.dmarc)}
            </div>
          </div>

          <Separator className="my-6" />

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Guia de Configuração</h4>
            <ol className="text-sm text-blue-800 space-y-1">
              {setupResult.setup_guide.map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2 font-medium">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(0)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => setCurrentStep(2)}
            >
              Adicionei Estes Registros
            </Button>
          </div>
        </>
      )}
    </Card>
  );

  const renderVerificationStep = () => (
    <Card className="p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Verificar Configuração</h3>
        <p className="text-gray-600">
          Clique em verificar para checar seus registros DNS e completar a configuração.
        </p>
      </div>

      {verificationResult && (
        <div className="space-y-6 mb-6">
          {/* Registros A (críticos) */}
          <div>
            <h4 className="font-medium mb-3">🎯 Registros A (CRÍTICOS)</h4>
            <div className="space-y-2">
              {['smtp_a', 'mail_a'].map((key) => {
                const result = verificationResult.results[key];
                if (!result) return null;
                return (
                  <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {result.valid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium">
                          {key === 'smtp_a' ? 'SMTP A Record' : 'MAIL A Record'}
                        </div>
                        {result.error && (
                          <div className="text-sm text-red-600">
                            {result.error}
                          </div>
                        )}
                        {result.actualValue && (
                          <div className="text-xs text-gray-500">
                            Atual: {result.actualValue}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={result.valid ? "default" : "destructive"}>
                      {result.valid ? '✅ OK' : '❌ FALHA'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Registro MX */}
          <div>
            <h4 className="font-medium mb-3">📧 Registro MX</h4>
            {verificationResult.results.mx && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  {verificationResult.results.mx.valid ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <div>
                    <div className="font-medium">MX Record</div>
                    {verificationResult.results.mx.error && (
                      <div className="text-sm text-red-600">
                        {verificationResult.results.mx.error}
                      </div>
                    )}
                    {verificationResult.results.mx.actualValue && (
                      <div className="text-xs text-gray-500">
                        Atual: {verificationResult.results.mx.actualValue}
                      </div>
                    )}
                  </div>
                </div>
                <Badge variant={verificationResult.results.mx.valid ? "default" : "destructive"}>
                  {verificationResult.results.mx.valid ? '✅ OK' : '❌ FALHA'}
                </Badge>
              </div>
            )}
          </div>

          {/* Registros TXT */}
          <div>
            <h4 className="font-medium mb-3">📝 Registros TXT (Autenticação)</h4>
            <div className="space-y-2">
              {['spf', 'dkim', 'dmarc'].map((key) => {
                const result = verificationResult.results[key];
                if (!result) return null;
                return (
                  <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {result.valid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium capitalize">
                          {key.toUpperCase()} Record
                        </div>
                        {result.error && (
                          <div className="text-sm text-red-600">
                            {result.error}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={result.valid ? "default" : "destructive"}>
                      {result.valid ? '✅ OK' : '❌ FALHA'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {!verificationResult.all_passed && verificationResult.next_steps && verificationResult.next_steps.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <div>
                <h4 className="font-medium">Próximos Passos Necessários</h4>
                <ul className="text-sm mt-1 space-y-1">
                  {verificationResult.next_steps.map((step, index) => (
                    <li key={index}>• {step}</li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => setCurrentStep(1)}
        >
          Voltar para DNS
        </Button>
        <div className="space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleVerification}
            disabled={isVerifying}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isVerifying ? 'animate-spin' : ''}`} />
            Verify Again
          </Button>
          <Button
            type="button"
            onClick={handleVerification}
            disabled={isVerifying}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              'Verificar Registros DNS'
            )}
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderCompletionStep = () => (
    <Card className="p-6 text-center">
      <div className="mb-6">
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-green-600 mb-2">
          🎉 Configuração de Domínio Concluída!
        </h3>
        <p className="text-gray-600">
          Seu domínio {setupResult?.domain.name} agora está configurado e pronto para enviar emails autenticados.
        </p>
      </div>

      {verificationResult && (
        <div className="bg-green-50 p-4 rounded-lg mb-6">
          <h4 className="font-medium text-green-900 mb-2">O que foi Configurado</h4>
          <div className="text-sm text-green-800 space-y-1">
            <div>✅ Subdomínios de email (smtp + mail) configurados</div>
            <div>✅ Registro MX configurado para direcionamento de email</div>
            <div>✅ Registro SPF configurado para autorização de email</div>
            <div>✅ Chaves DKIM configuradas para autenticação de email</div>
            <div>✅ Política DMARC configurada para segurança de email</div>
            <div className="mt-2 pt-2 border-t border-green-200">
              🌐 <strong>Configuração Híbrida:</strong> Seu site continua funcionando normalmente!
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={() => onComplete?.(setupResult!.domain.id)}
          className="w-full"
        >
          Ir para o Painel
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open('https://docs.ultrazend.com.br/domains', '_blank')}
          className="w-full"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Ver Documentação
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {renderStepIndicator()}
      
      {currentStep === 0 && renderDomainInputStep()}
      {currentStep === 1 && renderDNSConfigurationStep()}
      {currentStep === 2 && renderVerificationStep()}
      {currentStep === 3 && renderCompletionStep()}
    </div>
  );
};