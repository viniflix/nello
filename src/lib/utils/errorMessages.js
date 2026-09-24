const ERROR_TRANSLATIONS = [
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
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Você pode reenviar o link de confirmação abaixo.';
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
