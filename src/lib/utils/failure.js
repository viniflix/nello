// Only reviewed technical categories cross the UI/telemetry boundary.
export function classifyFailure(error, online = typeof navigator === 'undefined' ? undefined : navigator.onLine) {
  const code = String(error?.code || '');
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || error || '');
  const cause = error?.cause && error.cause !== error ? error.cause : null;
  if (error?.name === 'AbortError' || code === 'ABORTED') return 'aborted';
  if (error?.name === 'TimeoutError' || /timeout|timed out/i.test(message) || [408,504].includes(status)) return 'timeout';
  if (code === 'OFFLINE' || (online === false && /fetch|network|load failed/i.test(message))) return 'offline';
  if (code === 'NETWORK_FAILURE' || /failed to fetch|networkerror|network request failed|network error|load failed/i.test(message)) return 'network';
  if (status === 401 || /jwt expired|token has expired/i.test(message)) return 'unauthenticated';
  if (status === 403 || code === '42501') return 'forbidden';
  if ([409,412].includes(status) || ['40001','PT409','23505'].includes(code)) return 'conflict';
  if (status === 404 || code === 'PGRST116') return 'missing';
  if (status === 429) return 'rate_limit';
  if (status === 400 || ['22P02','22023','23502'].includes(code)) return 'validation';
  // Inspect the cause's category, never forward its arbitrary text or payload.
  if (cause) return classifyFailure({name:cause.name,code:cause.code,status:cause.status,message:cause.message},online);
  return 'unexpected';
}

const messages = {
  offline:'Você está sem conexão. Conecte-se e tente novamente.',
  network:'A conexão falhou. Verifique sua internet e tente novamente.',
  timeout:'A resposta demorou demais. Tente novamente em alguns instantes.',
  unauthenticated:'Sua sessão expirou. Entre novamente para continuar.',
  forbidden:'Você não tem permissão para esta ação.',
  conflict:'Este registro mudou. Atualize os dados e revise antes de salvar.',
  missing:'Este registro não está disponível. Volte à lista e confira o acesso.',
  rate_limit:'Limite de tentativas atingido. Aguarde antes de tentar novamente.',
  validation:'Revise os campos informados antes de continuar.',
  unexpected:'Não foi possível concluir. Tente novamente ou contate o suporte.',
  aborted:'A operação foi cancelada.',
};
export function failurePresentation(error) {
  const kind=classifyFailure(error);
  return {kind,message:messages[kind],retryable:['offline','network','timeout','unexpected'].includes(kind)};
}

// Query layers return Result; rejected promises are normalized at this boundary.
// No fallback turns a failed query into a successful empty dataset.
export async function settleResources(resources) {
  const entries=Object.entries(resources);
  const settled=await Promise.allSettled(entries.map(([,load])=>Promise.resolve().then(load)));
  return Object.fromEntries(entries.map(([key],index)=>{
    const result=settled[index];
    if(result.status==='rejected')return [key,{data:null,error:result.reason}];
    const value=result.value;
    return [key,value?.error?{data:null,error:value.error}:{data:value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'data')?value.data:value,error:null}];
  }));
}
