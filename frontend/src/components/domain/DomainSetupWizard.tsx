import React, { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Info, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Progress } from '../ui/progress'
import { Separator } from '../ui/separator'
import { type DomainSetupResult, type VerificationResult, useDomainSetup } from '../../hooks/useDomainSetup'

interface DomainSetupWizardProps {
  onComplete?: (domainId: number) => void
  onCancel?: () => void
  initialDomain?: string
  editDomainId?: number
}

const steps = [
  { label: 'Inserir dominio', description: 'Informe o dominio que sera usado no envio' },
  { label: 'Configurar DNS', description: 'Adicione os registros no provedor de DNS' },
  { label: 'Verificar', description: 'Confirme SPF, DKIM e DMARC' },
  { label: 'Concluido', description: 'Dominio pronto para enviar' },
]

export const DomainSetupWizard: React.FC<DomainSetupWizardProps> = ({
  onComplete,
  onCancel,
  initialDomain = '',
  editDomainId,
}) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [domain, setDomain] = useState(initialDomain)
  const [setupResult, setSetupResult] = useState<DomainSetupResult | null>(null)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)

  const {
    loading,
    error,
    initiateDomainSetup,
    verifyDomainSetup,
    loadDomainDetails,
    getDNSInstructions,
    clearError,
  } = useDomainSetup()

  const isEditMode = Boolean(editDomainId)

  useEffect(() => {
    clearError()
  }, [currentStep, clearError])

  useEffect(() => {
    if (!editDomainId) {
      return
    }

    const loadExistingDomain = async () => {
      try {
        const domainDetails = await loadDomainDetails(editDomainId)
        const dnsInstructions = await getDNSInstructions(editDomainId)

        setDomain(domainDetails.domain.name)
        setSetupResult({
          domain: {
            id: domainDetails.domain.id,
            name: domainDetails.domain.name,
            status: (['pending', 'partial', 'verified', 'failed'].includes(domainDetails.domain.status)
              ? domainDetails.domain.status
              : 'pending') as DomainSetupResult['domain']['status'],
            completion_percentage: domainDetails.domain.completion_percentage,
            is_verified: domainDetails.domain.is_verified,
            created_at: domainDetails.domain.created_at,
            verified_at: domainDetails.domain.verified_at,
          },
          dns_instructions: dnsInstructions.instructions,
          setup_guide: dnsInstructions.setup_guide,
        })

        setCurrentStep(domainDetails.domain.is_verified ? 3 : 1)
      } catch (loadError) {
        console.error('Erro ao carregar dominio para edicao:', loadError)
      }
    }

    loadExistingDomain()
  }, [editDomainId, getDNSInstructions, loadDomainDetails])

  const handleDomainSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!domain.trim()) {
      toast.error('Informe um dominio valido')
      return
    }

    try {
      const result = await initiateDomainSetup(domain.trim())
      setSetupResult(result)
      setCurrentStep(1)
    } catch (submitError) {
      console.error('Falha ao iniciar configuracao de dominio:', submitError)
    }
  }

  const handleVerification = async () => {
    if (!setupResult) {
      return
    }

    setIsVerifying(true)
    try {
      const result = await verifyDomainSetup(setupResult.domain.id)
      setVerificationResult(result)
      setCurrentStep(result.all_passed ? 3 : 2)
    } catch (verifyError) {
      console.error('Falha ao verificar dominio:', verifyError)
    } finally {
      setIsVerifying(false)
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copiado`)
    } catch {
      toast.error('Nao foi possivel copiar')
    }
  }

  const calculateProgress = () => ((currentStep + 1) / steps.length) * 100

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Assistente de dominio</h2>
          <p className="text-sm text-muted-foreground">
            Feche a autenticacao do dominio antes de liberar o envio.
          </p>
        </div>
        <Badge variant="outline">
          Etapa {currentStep + 1} de {steps.length}
        </Badge>
      </div>

      <Progress value={calculateProgress()} className="mb-4" />

      <div className="grid gap-4 md:grid-cols-4">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep

          return (
            <div key={step.label} className="flex items-start gap-3 rounded-lg border bg-white p-3">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium',
                  isCompleted && 'border-green-300 bg-green-100 text-green-800',
                  isCurrent && 'border-blue-300 bg-blue-100 text-blue-800',
                  !isCompleted && !isCurrent && 'border-gray-200 bg-gray-100 text-gray-500',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div>
                <div className="text-sm font-medium">{step.label}</div>
                <div className="text-xs text-muted-foreground">{step.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderDNSRecord = (type: string, record: any) => (
    <div key={type} className="space-y-3 rounded-lg border bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium uppercase">{type}</h4>
        <Badge variant="outline">Prioridade {record.priority}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">{record.description}</p>

      <div className="space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground">Host</Label>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded border bg-white p-2 text-sm">{record.record}</code>
            <Button size="sm" variant="outline" onClick={() => copyToClipboard(record.record, `${type} host`)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Valor</Label>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded border bg-white p-2 text-sm break-all">{record.value}</code>
            <Button size="sm" variant="outline" onClick={() => copyToClipboard(record.value, `${type} valor`)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderDomainInputStep = () => (
    <Card className="p-6">
      <div className="mb-6 text-center">
        <h3 className="mb-2 text-lg font-semibold">{isEditMode ? 'Revisar dominio' : 'Adicionar dominio'}</h3>
        <p className="text-muted-foreground">
          {isEditMode
            ? 'Revise a configuracao atual e ajuste os registros se necessario.'
            : 'Informe o dominio que sera autenticado para envio transacional.'}
        </p>
      </div>

      <form onSubmit={handleDomainSubmit} className="space-y-4">
        <div>
          <Label htmlFor="domain">Dominio</Label>
          <Input
            id="domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            disabled={loading || isEditMode}
            className="mt-1"
            required
          />
          <p className="mt-1 text-sm text-muted-foreground">Use apenas o dominio, sem protocolo ou www.</p>
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparando...
              </>
            ) : isEditMode ? (
              'Continuar'
            ) : (
              'Configurar dominio'
            )}
          </Button>
        </div>
      </form>
    </Card>
  )

  const renderDNSConfigurationStep = () => (
    <Card className="p-6">
      <div className="mb-6 text-center">
        <h3 className="mb-2 text-lg font-semibold">Configurar DNS</h3>
        <p className="text-muted-foreground">Adicione os registros abaixo no provedor do seu dominio.</p>
      </div>

      {setupResult && (
        <>
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Info className="h-4 w-4" />
            <div>
              <h4 className="font-medium">Mantenha os registros atuais do site</h4>
              <p className="text-sm">
                Adicione apenas os registros de email mostrados aqui. Isso ativa o envio sem interferir no site.
              </p>
            </div>
          </Alert>

          {setupResult.dns_instructions.a_records && (
            <div className="mb-6">
              <h4 className="mb-3 font-medium">Registros A</h4>
              <div className="space-y-4">
                {Object.entries(setupResult.dns_instructions.a_records).map(([key, record]) =>
                  renderDNSRecord(`A ${key}`, record)
                )}
              </div>
            </div>
          )}

          {setupResult.dns_instructions.mx && (
            <>
              <Separator className="my-6" />
              <div className="mb-6">
                <h4 className="mb-3 font-medium">Registro MX</h4>
                {renderDNSRecord('MX', setupResult.dns_instructions.mx)}
              </div>
            </>
          )}

          <Separator className="my-6" />

          <div className="mb-6">
            <h4 className="mb-3 font-medium">Autenticacao TXT</h4>
            <div className="space-y-4">
              {setupResult.dns_instructions.spf && renderDNSRecord('SPF', setupResult.dns_instructions.spf)}
              {setupResult.dns_instructions.dkim && renderDNSRecord('DKIM', setupResult.dns_instructions.dkim)}
              {setupResult.dns_instructions.dmarc && renderDNSRecord('DMARC', setupResult.dns_instructions.dmarc)}
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="mb-2 font-medium text-blue-900">Passo a passo</h4>
            <ol className="space-y-1 text-sm text-blue-800">
              {setupResult.setup_guide.map((step, index) => (
                <li key={`${step}-${index}`}>
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex justify-between pt-6">
            <Button type="button" variant="outline" onClick={() => setCurrentStep(0)}>
              Voltar
            </Button>
            <Button type="button" onClick={() => setCurrentStep(2)}>
              Ja configurei
            </Button>
          </div>
        </>
      )}
    </Card>
  )

  const renderVerificationResult = (label: string, result?: VerificationResult['results']['spf']) => {
    if (!result) {
      return null
    }

    return (
      <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
        <div className="flex items-center gap-3">
          {result.valid ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <div>
            <div className="font-medium">{label}</div>
            {result.error && <div className="text-sm text-red-600">{result.error}</div>}
            {result.found && <div className="text-xs text-muted-foreground">Atual: {result.found}</div>}
          </div>
        </div>
        <Badge variant={result.valid ? 'default' : 'destructive'}>{result.valid ? 'OK' : 'Ajustar'}</Badge>
      </div>
    )
  }

  const renderVerificationStep = () => (
    <Card className="p-6">
      <div className="mb-6 text-center">
        <h3 className="mb-2 text-lg font-semibold">Verificar configuracao</h3>
        <p className="text-muted-foreground">Confira se SPF, DKIM e DMARC ja propagaram no DNS.</p>
      </div>

      {verificationResult && (
        <div className="mb-6 space-y-6">
          <div className="space-y-2">
            {renderVerificationResult('SPF', verificationResult.results.spf)}
            {renderVerificationResult('DKIM', verificationResult.results.dkim)}
            {renderVerificationResult('DMARC', verificationResult.results.dmarc)}
          </div>

          {!verificationResult.all_passed && verificationResult.next_steps.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <div>
                <h4 className="font-medium">Pendencias encontradas</h4>
                <ul className="mt-1 space-y-1 text-sm">
                  {verificationResult.next_steps.map((step, index) => (
                    <li key={`${step}-${index}`}>- {step}</li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => setCurrentStep(1)}>
          Voltar para DNS
        </Button>
        <div className="space-x-2">
          <Button type="button" variant="outline" onClick={handleVerification} disabled={isVerifying}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isVerifying ? 'animate-spin' : ''}`} />
            Verificar novamente
          </Button>
          <Button type="button" onClick={handleVerification} disabled={isVerifying}>
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              'Verificar DNS'
            )}
          </Button>
        </div>
      </div>
    </Card>
  )

  const renderCompletionStep = () => (
    <Card className="p-6 text-center">
      <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-600" />
      <h3 className="mb-2 text-2xl font-bold text-green-600">Dominio configurado</h3>
      <p className="mb-6 text-muted-foreground">
        {setupResult?.domain.name} esta autenticado e pronto para uso no envio de emails.
      </p>

      <div className="mb-6 rounded-lg bg-green-50 p-4 text-left">
        <h4 className="mb-2 font-medium text-green-900">O que ficou valido</h4>
        <div className="space-y-1 text-sm text-green-800">
          <div>OK SPF autorizado</div>
          <div>OK DKIM assinado</div>
          <div>OK DMARC publicado</div>
          <div>OK infraestrutura de email preparada</div>
        </div>
      </div>

      <div className="space-y-3">
        <Button onClick={() => setupResult && onComplete?.(setupResult.domain.id)} className="w-full">
          Ir para dominios
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.open('https://docs.ultrazend.com.br/domains', '_blank')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Ver documentacao
        </Button>
      </div>
    </Card>
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {renderStepIndicator()}
      {currentStep === 0 && renderDomainInputStep()}
      {currentStep === 1 && renderDNSConfigurationStep()}
      {currentStep === 2 && renderVerificationStep()}
      {currentStep === 3 && renderCompletionStep()}
    </div>
  )
}
