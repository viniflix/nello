const ERROR_TRANSLATIONS = [
  { test: /patient_creation_rate_limited|over_email_send_rate_limit/i, message: 'Limite de envios atingido. Aguarde alguns minutos antes de tentar novamente.' },
  { test: /professional_verification_required/i, message: 'Conclua a verificação profissional para convidar pacientes.' },
  { test: /patient_account_already_exists/i, message: 'Este email já tem uma conta. Use o vínculo por convite ou a recuperação de acesso, sem criar outra conta.' },
  { test: /valid_birth_date_required/i, message: 'Informe uma data de nascimento válida para a senha inicial.' },
  { test: /patient_invite_required|invalid_invite/i, message: 'Peça um convite válido ao seu profissional para entrar como paciente.' },
  { test: /legal_acceptance_required/i, message: 'Leia e aceite os termos para concluir o cadastro.' },
  { test: /DIARY_MEAL_NOT_FOUND/i, message: 'Esta refeição não está disponível para edição na sua conta.' },
  { test: /DIARY_FOOD_UNAVAILABLE/i, message: 'Um alimento foi desativado ou não está disponível. Remova-o e escolha outro.' },
  { test: /DIARY_INVALID_(ITEM|MEASURE|WEIGHT|FOOD_BASE|NUTRITION|MEAL|PAYLOAD)/i, message: 'Revise os alimentos, quantidades e horário antes de salvar.' },
  { test: /DIARY_AUTH_REQUIRED/i, message: 'Sua sessão expirou. Entre novamente para salvar a refeição.' },
  { test: /invalid login credentials/i, message: 'E-mail ou senha inválidos.' },
  { test: /MEASURE_IN_USE/i, message: 'Esta medida já está em um plano alimentar. Preserve o peso usado ou crie uma nova medida.' },
  { test: /MEASURE_NOT_OWNED|FOOD_NOT_OWNED/i, message: 'Este alimento ou medida não pertence à sua conta.' },
  { test: /INVALID_FOOD|INVALID_NUTRIENT|INVALID_MEASURE|DUPLICATE_MEASURE/i, message: 'Revise os dados nutricionais e as medidas caseiras informadas.' },
  { test: /ANAMNESIS_FILE_ACCESS_DENIED/i, message: 'Este formulário não aceita mais alterações em anexos.' },
  { test: /ANAMNESIS_FILE_(INVALID|PATH_INVALID|FIELD_INVALID|LIMIT_OR_DUPLICATE)/i, message: 'O anexo não atende aos requisitos deste formulário.' },
  { test: /email not confirmed/i, message: 'Confirme seu e-mail antes de entrar.' },
  { test: /user already registered/i, message: 'Já existe uma conta com este e-mail.' },
  { test: /invalid email/i, message: 'E-mail inválido.' },
  { test: /password should be at least/i, message: 'A senha deve ter pelo menos 6 caracteres.' },
  { test: /new password should be different/i, message: 'A nova senha deve ser diferente da atual.' },
  { test: /jwt expired|token has expired/i, message: 'Sua sessão expirou. Entre novamente.' },
  { test: /permission denied|not authorized|forbidden|row-level security/i, message: 'Você não tem permissão para esta ação.' },
  { test: /network error|failed to fetch|timeout/i, message: 'Falha de conexão. Verifique sua internet e tente novamente.' },
  { test: /duplicate key value/i, message: 'Esse registro já existe.' },
  { test: /violates foreign key constraint/i, message: 'Não foi possível concluir por vínculo com outros dados.' },
  { test: /violates not-null constraint/i, message: 'Existem campos obrigatórios não preenchidos.' },
  { test: /invalid input syntax/i, message: 'Dados inválidos. Revise os campos e tente novamente.' },
  { test: /violates row-level security|policy.*failed|new row violates/i, message: 'O paciente precisa estar vinculado a você. Adicione-o como paciente primeiro.' },
];

export function toPortugueseError(errorOrMessage, fallback = 'Ocorreu um erro. Tente novamente.') {
  const code = typeof errorOrMessage === 'string' ? '' : String(errorOrMessage?.code || '');
  if (['40001', 'PT409'].includes(code)) return 'Este registro mudou em outra aba. Recarregue e revise as versões antes de salvar.';
  if (['OFFLINE','NETWORK_FAILURE','RETRY_EXPIRED','RETRY_LIMIT','SESSION_CHANGED'].includes(code)) return 'A operação não foi concluída. Confira a conexão e a sessão antes de tentar novamente.';
  if (code === 'captcha_failed' || code === 'captcha_verification_failed') return 'A verificação de segurança expirou ou falhou. Complete a nova verificação e tente novamente.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Digite o código recebido ou peça um novo.';
  if (code === 'over_email_send_rate_limit' || Number(errorOrMessage?.status) === 429) return 'Aguarde um minuto antes de pedir outro código. Confira também a caixa de spam.';
  if (code === 'otp_expired' || code === 'invalid_token') return 'Código inválido ou expirado. Peça um novo código e use apenas o mais recente.';
  if (code === 'same_password') return 'A nova senha deve ser diferente da senha atual.';
  if (code === 'invalid_credentials') return 'E-mail ou senha inválidos.';
  const raw = typeof errorOrMessage === 'string'
    ? errorOrMessage
    : errorOrMessage?.message || '';

  if (!raw) return fallback;

  const normalized = raw.trim();
  const lower = normalized.toLowerCase();
  
  // Mensagens escritas pela própria interface já são seguras e úteis para o
  // usuário. Não as substitua pelo fallback genérico só porque não contêm a
  // palavra "erro" (ex.: "As senhas não coincidem.").
  const alreadyPortuguese = /(não\s+foi\s+possível|não\s+coincid|não\s+pode|não\s+encontr|não\s+está|erro|falha|inválid|incomplet|obrigat|sucesso|conexão|permissão|dados|senha|senhas|confirme|solicite|tente|conta|sessão|vínculo|paciente|usuário|atualiz|alterad|preencha|selecione|informe|escolha|insira|digite)/i.test(normalized);

  if (alreadyPortuguese) return normalized;

  const matched = ERROR_TRANSLATIONS.find((item) => item.test.test(lower));
  return matched?.message || fallback;
}
