import React from 'react';
import { AlertCircle, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getVerificationCapabilities } from '@/lib/verification/verificationState';

const STATUS_CONTENT = {
  not_submitted: {
    title: 'Verificação não enviada',
    description: 'Você pode explorar o Nello e trabalhar com pacientes fictícios. Para atender ou convidar pacientes reais, envie seus dados profissionais.',
    badge: 'Não verificado',
    badgeVariant: 'secondary',
    action: 'Enviar verificação',
    icon: ShieldAlert
  },
  pending: {
    title: 'Verificação em análise',
    description: 'Seus dados foram recebidos. Enquanto a análise estiver pendente, operações com pacientes reais permanecem bloqueadas.',
    badge: 'Em análise',
    badgeVariant: 'warning',
    icon: Clock3
  },
  needs_information: {
    title: 'Complementação necessária',
    description: 'A equipe precisa de informações adicionais para concluir sua análise.',
    badge: 'Ação necessária',
    badgeVariant: 'warning',
    action: 'Enviar complementação',
    icon: AlertCircle
  },
  approved: {
    title: 'Perfil aprovado',
    description: 'Sua identidade profissional está habilitada para operações clínicas reais.',
    badge: 'Aprovado',
    badgeVariant: 'success',
    icon: CheckCircle2
  },
  rejected: {
    title: 'Verificação não aprovada',
    description: 'Revise os dados e envie uma nova solicitação.',
    badge: 'Não aprovada',
    badgeVariant: 'destructive',
    action: 'Reenviar verificação',
    icon: AlertCircle
  },
  expired: {
    title: 'Verificação expirada',
    description: 'Seu histórico permanece disponível, mas novas operações reais exigem renovação.',
    badge: 'Expirada',
    badgeVariant: 'secondary',
    action: 'Renovar verificação',
    icon: Clock3
  },
  suspended: {
    title: 'Verificação suspensa',
    description: 'Novas operações clínicas reais estão temporariamente bloqueadas. Consulte o suporte do Nello.',
    badge: 'Suspensa',
    badgeVariant: 'destructive',
    icon: ShieldAlert
  }
};

export default function VerificationStatusCard({ verification, onAction }) {
  const capabilities = getVerificationCapabilities(verification);
  const content = STATUS_CONTENT[capabilities.status] || STATUS_CONTENT.not_submitted;
  const Icon = content.icon;
  const description = capabilities.isLegacyApproval
    ? 'Perfil aprovado para continuidade do ambiente alpha. A revisão formal será solicitada antes do lançamento.'
    : content.description;

  return (
    <Alert>
      <Icon />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {content.title}
        <Badge variant={content.badgeVariant}>{content.badge}</Badge>
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{description}</p>
        {verification?.document_required_reason ? (
          <p><strong>Solicitação:</strong> {verification.document_required_reason}</p>
        ) : null}
        {content.action && capabilities.canSubmitVerification && onAction ? (
          <div>
            <Button type="button" size="sm" onClick={onAction}>{content.action}</Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
