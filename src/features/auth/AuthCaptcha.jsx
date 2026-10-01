import { useCallback, useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loadingScript;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loadingScript) loadingScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(fail, 20_000);
    function fail() {
      window.clearTimeout(timer); script.remove(); loadingScript = undefined;
      reject(new Error('captcha_unavailable'));
    }
    script.src = SCRIPT_URL; script.async = true;
    script.onload = () => {
      if (!window.turnstile) { fail(); return; }
      window.clearTimeout(timer); resolve(window.turnstile);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loadingScript;
}

export function useAuthCaptcha() {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [token, setToken] = useState('');
  const [attempt, setAttempt] = useState(0);
  const reset = useCallback(() => { setToken(''); setAttempt(v => v + 1); }, []);
  return {
    ready: !sitekey || Boolean(token),
    options: token ? { captchaToken: token } : {},
    reset,
    widget: { sitekey, attempt, onToken: setToken },
  };
}

export default function AuthCaptcha({ sitekey, attempt, onToken }) {
  const container = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!sitekey) return undefined;
    let active = true;
    let widget;
    let provider;
    setFailed(false); onToken('');
    loadTurnstile().then(api => {
      if (!active) return;
      provider = api;
      widget = api.render(container.current, {
        sitekey, language: 'pt-BR', size: 'flexible',
        callback: value => { if (active) { onToken(value); setFailed(false); } },
        'expired-callback': () => { if (active) onToken(''); },
        'error-callback': () => { if (active) { onToken(''); setFailed(true); } },
      });
    }).catch(() => { if (active) { onToken(''); setFailed(true); } });
    return () => { active = false; if (widget !== undefined) provider?.remove(widget); };
  }, [sitekey, attempt, onToken]);
  if (!sitekey) return null;
  return <div className="space-y-2">
    <div ref={container} aria-label="Verificação de segurança" />
    {failed && <p role="alert" className="text-sm text-destructive">Não foi possível carregar a verificação de segurança. Confira a conexão e recarregue a página. Se persistir, procure o suporte.</p>}
  </div>;
}
