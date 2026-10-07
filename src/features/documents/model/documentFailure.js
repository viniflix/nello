import { failurePresentation } from '@/lib/utils/failure';

// Reviewed server messages only. Never display arbitrary SQL details.
export function documentFailurePresentation(error) {
  const message = error?.message;
  if (error?.code === '23514' && message === 'responsible_document_identity_required') {
    return { message: 'Configure os dados da identidade documental do profissional responsável antes de emitir.', identityRequired: true };
  }
  if (message === 'document_artifact_revision_conflict' || error?.code === 'PT409') {
    return { message: 'O documento foi atualizado em outra sessão. Atualize os documentos e revise antes de continuar.' };
  }
  if (message === 'document_signature_requires_current_verified_crn') return { message: 'A assinatura exige um CRN aprovado e vigente. Revise os dados da verificação profissional.' };
  if (error?.code === '23505' && message === 'meal_plan_document_already_exists') {
    return { message: 'Este plano já possui um documento oficial. Atualize os documentos para continuar.' };
  }
  return { message: failurePresentation(error).message };
}
