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
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface DomainSetupWizardProps {
  onComplete?: (domainId: number) => void;
  onCancel?: () => void;
  initialDomain?: string;
}

export const DomainSetupWizard: React.FC<DomainSetupWizardProps> = ({
  onComplete,
  onCancel,
  initialDomain = ''
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [domain, setDomain] = useState(initialDomain);
  const [setupResult, setSetupResult] = useState<DomainSetupResult | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const {
    loading,
    error,
    initiateDomainSetup,
    verifyDomainSetup,
    clearError
  } = useDomainSetup();

  const steps = [
    { label: 'Enter Domain', description: 'Provide your domain name' },
    { label: 'Configure DNS', description: 'Add DNS records to your domain' },
    { label: 'Verify Setup', description: 'Verify DNS configuration' },
    { label: 'Complete', description: 'Setup completed successfully' }
  ];

  // Limpar erros quando o componente for montado ou o step mudar
  useEffect(() => {
    clearError();
  }, [currentStep, clearError]);

  const handleDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!domain.trim()) {
      toast.error('Please enter a domain name');
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
      toast.success(`${label} copied to clipboard!`);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
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
        <h2 className="text-2xl font-bold">Domain Setup Wizard</h2>
        <Badge variant="outline">
          Step {currentStep + 1} of {steps.length}
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
        <h3 className="text-lg font-semibold mb-2">Add Your Domain</h3>
        <p className="text-gray-600">
          Enter the domain you want to configure for sending emails through UltraZend.
        </p>
      </div>

      <form onSubmit={handleDomainSubmit} className="space-y-4">
        <div>
          <Label htmlFor="domain">Domain Name</Label>
          <Input
            id="domain"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            required
            disabled={loading}
            className="mt-1"
          />
          <p className="text-sm text-gray-500 mt-1">
            Enter your domain without "www" or "https://"
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
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !domain.trim()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              'Configure Domain'
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
          Priority: {record.priority}
        </Badge>
      </div>
      
      <p className="text-sm text-gray-600">{record.description}</p>
      
      <div className="space-y-2">
        <div>
          <Label className="text-xs text-gray-500">Record Name</Label>
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
          <Label className="text-xs text-gray-500">Record Value</Label>
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
        <h3 className="text-lg font-semibold mb-2">Configure DNS Records</h3>
        <p className="text-gray-600">
          Add the following DNS records to your domain's DNS settings.
        </p>
      </div>

      {setupResult && (
        <>
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <div>
              <h4 className="font-medium">Important Instructions</h4>
              <p className="text-sm mt-1">
                Log into your domain registrar or DNS provider and add these TXT records. 
                DNS changes can take 5-60 minutes to propagate.
              </p>
            </div>
          </Alert>

          <div className="space-y-4 mb-6">
            {Object.entries(setupResult.dns_instructions).map(([type, record]) =>
              renderDNSRecord(type, record)
            )}
          </div>

          <Separator className="my-6" />

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Setup Guide</h4>
            <ol className="text-sm text-blue-800 space-y-1">
              {setupResult.setup_guide.map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2">{index + 1}.</span>
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
              Back
            </Button>
            <Button 
              type="button" 
              onClick={() => setCurrentStep(2)}
            >
              I've Added These Records
            </Button>
          </div>
        </>
      )}
    </Card>
  );

  const renderVerificationStep = () => (
    <Card className="p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Verify Configuration</h3>
        <p className="text-gray-600">
          Click verify to check your DNS records and complete the setup.
        </p>
      </div>

      {verificationResult && (
        <div className="space-y-4 mb-6">
          {Object.entries(verificationResult.results).map(([key, result]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                {result.valid ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <div>
                  <div className="font-medium capitalize">
                    {key.replace('_', ' ')} Record
                  </div>
                  {result.error && (
                    <div className="text-sm text-red-600">
                      {result.error}
                    </div>
                  )}
                </div>
              </div>
              <Badge variant={result.valid ? "default" : "destructive"}>
                {result.status}
              </Badge>
            </div>
          ))}

          {!verificationResult.all_passed && verificationResult.next_steps.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <div>
                <h4 className="font-medium">Next Steps Required</h4>
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
          Back to DNS
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
                Verifying...
              </>
            ) : (
              'Verify DNS Records'
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
          🎉 Domain Setup Complete!
        </h3>
        <p className="text-gray-600">
          Your domain {setupResult?.domain.name} is now configured and ready to send authenticated emails.
        </p>
      </div>

      {verificationResult && (
        <div className="bg-green-50 p-4 rounded-lg mb-6">
          <h4 className="font-medium text-green-900 mb-2">What's Configured</h4>
          <div className="text-sm text-green-800 space-y-1">
            <div>✅ Domain ownership verified</div>
            <div>✅ SPF record configured for email authorization</div>
            <div>✅ DKIM keys set up for email authentication</div>
            <div>✅ DMARC policy configured for email security</div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={() => onComplete?.(setupResult!.domain.id)}
          className="w-full"
        >
          Go to Dashboard
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open('https://docs.ultrazend.com.br/domains', '_blank')}
          className="w-full"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View Documentation
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