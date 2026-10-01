import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import posthog, { identifyUser } from '@/infrastructure/analytics/posthog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { posthogOptions } from '@/app/config/posthog';
import { bindConsentOwner, hasAnalyticsConsent, hasPendingAnalyticsRevocation, markPendingAnalyticsRevocation, LEGAL_VERSION, storeAnalyticsChoice } from '../consent';

function applyChoice(allowed, user) {
  bindConsentOwner(user?.id);
  const stored = storeAnalyticsChoice(allowed);
  if (allowed && stored && hasAnalyticsConsent() && import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    && !posthog.__loaded && !posthog.initialized) {
    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, posthogOptions);
  }
  if (!posthog.__loaded && !posthog.initialized) return;
  if (allowed && stored && hasAnalyticsConsent()) {
    posthog.opt_in_capturing?.({ captureEventName: false, enable_persistence: false });
    identifyUser(user);
  } else {
    posthog.opt_out_capturing?.();
    posthog.reset?.();
  }
}

export default function PrivacyPreferences() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
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
    setAllowed(hasAnalyticsConsent());
    setTerms(false);
    setBusy(false);
    setMessage('');
    if (!user?.id) { applyChoice(hasAnalyticsConsent(), null); return undefined; }
    // Default deny while the authenticated preference is being read.
    applyChoice(false, user);
    supabase.rpc('get_my_privacy_preferences').then(({ data, error }) => {
      if (!active || epoch !== preferenceEpoch.current) return;
      const consent = !error && data?.analytics_allowed === true && !hasPendingAnalyticsRevocation(user.id);
      applyChoice(consent, user);
      setAllowed(consent);
      setTerms(!error && data?.terms_accepted === true);
    }).catch(() => { /* A failed read must never grant analytics. */ });
    return () => { active = false; };
  }, [user?.id]);

  const save = async (analytics) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const ownerId = user?.id;
    ++preferenceEpoch.current;
    // Revocation takes effect before any network operation.
    if (!analytics) { markPendingAnalyticsRevocation(ownerId, true); applyChoice(false, user); setAllowed(false); }
    try {
      if (user?.id) {
        const { error } = await supabase.rpc('record_my_privacy_choice', {
          p_version: LEGAL_VERSION, p_terms: terms, p_analytics: analytics,
        });
        if (error) throw error;
      }
      if (currentOwner.current !== ownerId) return;
      markPendingAnalyticsRevocation(ownerId, false);
      applyChoice(analytics, user);
      setAllowed(hasAnalyticsConsent());
      setMessage('Preferências salvas.');
    } catch {
      if (currentOwner.current !== ownerId) return;
      setMessage(analytics
        ? 'Não foi possível salvar. Analytics continua desligado; tente novamente.'
        : 'Analytics está desligado neste navegador. Falta salvar a revogação na conta; tente novamente.');
    } finally { if (currentOwner.current === ownerId) setBusy(false); }
  };

  if (!['/login', '/register', '/confirm-signup', '/update-password', '/convite', '/privacidade', '/ajuda', '/termos', '/seguranca', '/patient/profile', '/nutritionist/profile'].includes(pathname.replace(/\/$/, ''))) return null;
  return <aside className="fixed bottom-2 right-2 z-50 max-w-sm rounded-lg border bg-card p-2 shadow-sm">
    <button type="button" className="text-xs underline" aria-expanded={open} onClick={() => setOpen(v => !v)}>Preferências de privacidade</button>
    {open && <div className="space-y-3 p-2 text-sm">
      <p>Analytics de navegação é opcional e está {allowed ? 'ligado' : 'desligado'}. A recusa não bloqueia o Nello.</p>
      <Link to="/privacidade" className="underline">Ler o aviso de privacidade</Link>
      {user?.id && <label className="flex items-start gap-2"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Li e aceito os <Link to="/termos" className="underline">Termos de Uso</Link> e li o aviso de privacidade, versão {LEGAL_VERSION}.</span></label>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => save(false)} className="rounded border px-3 py-2">Sem analytics</button>
        <button type="button" disabled={busy} onClick={() => save(true)} className="rounded border px-3 py-2">Permitir analytics</button>
      </div>
      <p role="status">{message}</p>
    </div>}
  </aside>;
}
