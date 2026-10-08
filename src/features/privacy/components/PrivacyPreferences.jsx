import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import posthog, { identifyUser } from '@/infrastructure/analytics/posthog';
import { useAuth } from '@/contexts/AuthContext';
import { getMyPrivacyPreferences, recordMyPrivacyChoice } from '../api/privacy-queries';
import { posthogOptions } from '@/app/config/posthog';
import { reportAnalyticsFailure } from '@/infrastructure/analytics/pipelineHealth';
import { bindConsentOwner, hasAnalyticsConsent, hasAnalyticsChoice, suspendAnalyticsConsent, hasPendingAnalyticsRevocation, markPendingAnalyticsRevocation, LEGAL_VERSION, storeAnalyticsChoice } from '../consent';

function applyChoice(allowed, user, persist = true) {
  bindConsentOwner(user?.id);
  if (!allowed && !persist) suspendAnalyticsConsent();
  const stored = persist ? storeAnalyticsChoice(allowed) : hasAnalyticsChoice();
  if (allowed && stored && hasAnalyticsConsent() && import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    && !posthog.__loaded && !posthog.initialized) {
    void Promise.resolve(posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, posthogOptions)).then(() => {
      if (!hasAnalyticsConsent(user?.id)) return;
      posthog.opt_in_capturing?.({ captureEventName: false, enable_persistence: false });
      identifyUser(user);
    }).catch(() => { if (hasAnalyticsConsent(user?.id)) reportAnalyticsFailure('sdk_failure'); });
  }
  if (!allowed || !stored || !hasAnalyticsConsent()) {
    // Invalidate queued events even while the optional SDK is still downloading.
    posthog.opt_out_capturing?.();
    posthog.reset?.();
    return;
  }
  if (!posthog.__loaded && !posthog.initialized) return;
  posthog.opt_in_capturing?.({ captureEventName: false, enable_persistence: false });
  identifyUser(user);
}

export default function PrivacyPreferences() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(true);
  const [ready, setReady] = useState(!user?.id);
  const [allowed, setAllowed] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currentOwner = useRef(user?.id);
  const preferenceEpoch = useRef(0);
  currentOwner.current = user?.id;
  useEffect(() => {
    let active = true;
    const epoch = ++preferenceEpoch.current;
    bindConsentOwner(user?.id);
    setNeedsChoice(!hasAnalyticsChoice());
    setAllowed(hasAnalyticsConsent());
    setTerms(false);
    setBusy(false);
    setMessage('');
    setOpen(false);
    setReady(!user?.id);
    if (!user?.id) { applyChoice(hasAnalyticsConsent(), null, false); return undefined; }
    // Default deny while the authenticated preference is being read.
    applyChoice(false, user, false);
    getMyPrivacyPreferences().then(({ data, error }) => {
      if (!active || epoch !== preferenceEpoch.current) return;
      if (error) {
        setReady(true);
        return;
      }
      const currentVersion = !error && data?.version === LEGAL_VERSION;
      const recorded = currentVersion && data?.analytics_choice_recorded === true;
      const consent = currentVersion && data?.analytics_allowed === true && !hasPendingAnalyticsRevocation(user.id);
      applyChoice(consent, user, recorded);
      setNeedsChoice(!recorded);
      setAllowed(consent);
      setTerms(currentVersion && data?.terms_accepted === true);
      setReady(true);
    }).catch(() => {
      if (active && epoch === preferenceEpoch.current) setReady(true);
      /* A failed read must never grant analytics or erase the stored choice. */
    });
    return () => { active = false; };
  }, [user?.id]);

  const save = async (analytics) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const ownerId = user?.id;
    ++preferenceEpoch.current;
    // Revocation takes effect before any network operation.
    if (!analytics) {
      markPendingAnalyticsRevocation(ownerId, true);
      applyChoice(false, user);
      // A refusal must stay effective in this browser after logout as well.
      if (ownerId) storeAnalyticsChoice(false, 'anonymous');
      setAllowed(false);
    }
    try {
      if (user?.id) {
        const { error } = await recordMyPrivacyChoice({
          p_version: LEGAL_VERSION, p_terms: terms, p_analytics: analytics,
        });
        if (error) throw error;
      }
      if (currentOwner.current !== ownerId) return;
      markPendingAnalyticsRevocation(ownerId, false);
      applyChoice(analytics, user);
      if (!ownerId && !hasAnalyticsChoice()) throw Error('browser_preference_not_saved');
      setAllowed(hasAnalyticsConsent());
      setNeedsChoice(false);
      setReady(true);
      setOpen(false);
      setMessage('Preferências salvas.');
    } catch {
      if (currentOwner.current !== ownerId) return;
      setMessage(!ownerId
        ? 'Não foi possível guardar a preferência neste navegador. As métricas continuam desligadas; verifique o armazenamento e tente novamente.'
        : analytics
        ? 'Não foi possível salvar. Analytics continua desligado; tente novamente.'
        : 'Analytics está desligado neste navegador. Falta salvar a revogação na conta; tente novamente.');
    } finally { if (currentOwner.current === ownerId) setBusy(false); }
  };

  if (!['/login', '/register', '/confirm-signup', '/update-password', '/convite', '/privacidade', '/ajuda', '/termos', '/seguranca', '/patient/profile', '/nutritionist/profile'].includes(pathname.replace(/\/$/, ''))) return null;
  const canReview = ['/privacidade', '/patient/profile', '/nutritionist/profile'].includes(pathname.replace(/\/$/, ''));
  if ((!ready && !canReview) || (!needsChoice && !open && !canReview)) return null;
  return <aside aria-label="Preferências de cookies" className="mx-auto my-4 w-full max-w-3xl rounded-lg border bg-card p-3 text-foreground shadow-sm">
    <button type="button" className="text-xs underline" aria-expanded={open} onClick={() => setOpen(v => !v)}>Preferências de privacidade</button>
    {needsChoice && !open && <div className="space-y-3 pt-2 text-sm">
      <p>Usamos recursos necessários para manter seu acesso e proteger a Plataforma. Com sua permissão, usamos métricas de navegação para melhorar o Nello. Você pode recusar as métricas e continuar normalmente.</p>
      <Link to="/privacidade" className="underline">Ler o aviso de privacidade</Link>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => save(true)} className="rounded border px-3 py-2">Aceitar todos</button>
        <button type="button" disabled={busy} onClick={() => save(false)} className="rounded border px-3 py-2">Recusar não essenciais</button>
        <button type="button" onClick={() => setOpen(true)} className="rounded border px-3 py-2">Configurar</button>
      </div>
    </div>}
    {open && <div className="space-y-3 p-2 text-sm">
      <p>Necessários: sempre ativos para acesso e segurança.</p>
      <p>Analytics de navegação é opcional e está {allowed ? 'ligado' : 'desligado'}. A recusa não bloqueia o Nello.</p>
      <Link to="/privacidade" className="underline">Ler o aviso de privacidade</Link>
      {user?.id && <label className="flex items-start gap-2"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Li e aceito os <Link to="/termos" className="underline">Termos de Uso</Link> e li o aviso de privacidade, versão {LEGAL_VERSION}.</span></label>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => save(false)} className="rounded border px-3 py-2">Sem analytics</button>
        <button type="button" disabled={busy} onClick={() => save(true)} className="rounded border px-3 py-2">Permitir analytics</button>
      </div>
      <button type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-2">Fechar preferências</button>
    </div>}
    <p role="status">{message}</p>
  </aside>;
}
