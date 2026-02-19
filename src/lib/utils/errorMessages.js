const ERROR_TRANSLATIONS = [
  { test: /invalid login credentials/i, message: 'E-mail ou senha inválidos.' },
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
];

export function toPortugueseError(errorOrMessage, fallback = 'Ocorreu um erro. Tente novamente.') {
  const raw = typeof errorOrMessage === 'string'
    ? errorOrMessage
    : errorOrMessage?.message || '';

  if (!raw) return fallback;

  const normalized = raw.trim();
  const lower = normalized.toLowerCase();
  const alreadyPortuguese = /(não foi possível|erro|inválid|obrigat|sucesso|conexão|permissão|dados)/i.test(normalized);

  if (alreadyPortuguese) return normalized;

  const matched = ERROR_TRANSLATIONS.find((item) => item.test.test(lower));
  return matched?.message || fallback;
}
