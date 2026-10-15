import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { AdminAccessContext } from '../hooks/useAdminAccess';
import { useAccessEpoch } from '@/hooks/useAccessEpoch';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { getPrivateSessionEpoch } from '@/lib/utils/privateSessionState';
import { Navigate } from 'react-router-dom';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import { getHomePath } from '@/app/router/homePath';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

async function fetchAccess(quiet = false, signal) {
  const rpc = name => { const request = supabase.rpc(name); return request.abortSignal ? request.abortSignal(signal) : request; };
  if (quiet) {
    const { data: stillAuthorized, error: checkError } = await rpc('check_is_admin');
    if (checkError) throw checkError;
    if (stillAuthorized === true) return { eligible: true, authorized: true };
  }
  const { data, error } = await rpc('admin_access_status');
  if (error) throw error;
  return data;
}

function AdminMfa({ onVerified }) {
  const alive = useRef(true);
  const session = useRef(getPrivateSessionEpoch());
  const current = () => alive.current && session.current === getPrivateSessionEpoch();
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingFactors, setLoadingFactors] = useState(true);

  useEffect(() => {
    alive.current = true;
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) setError('Não foi possível consultar seus fatores de autenticação.');
      else setFactor(data?.totp?.find((item) => item.status === 'verified') || null);
    }).catch(() => {
      if (active) setError('Não foi possível consultar seus fatores de autenticação.');
    }).finally(() => { if (active) setLoadingFactors(false); });
    return () => { active = false; alive.current = false; };
  }, []);

  const enroll = async () => {
    setBusy(true);
    setError('');
    try {
      // Re-read before enrollment: a refresh loses the secret, but leaves the
      // unconfirmed factor on the server. Never remove a verified factor.
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (!current()) return;
      if (listError) throw listError;
      const verified = factors?.totp?.find((item) => item.status === 'verified');
      if (verified) {
        setFactor(verified);
        return;
      }
      for (const pending of factors?.all || []) {
        if (pending.factor_type === 'totp' && pending.status === 'unverified' && pending.friendly_name === 'Nello Admin') {
          const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
          if (!current()) return;
          if (removeError) throw removeError;
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: 'Nello Admin',
      });
      if (!current()) return;
      if (enrollError) throw enrollError;
      setEnrollment(data);
    } catch {
      setError('Não foi possível iniciar a configuração do autenticador. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      const factorId = enrollment?.id || factor?.id;
      if (!factorId) throw new Error('missing_factor');
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (!current()) return;
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code,
      });
      if (!current()) return;
      if (verifyError) throw verifyError;
      setCode('');
      await onVerified();
    } catch {
      setError('Código inválido ou expirado. Confira o aplicativo autenticador e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const qr = enrollment?.totp?.qr_code;
  // Older SDKs prefix raw SVG with a data URL without escaping '#' in colors.
  const svg = qr?.startsWith('data:image/svg+xml;') ? qr.slice(qr.indexOf(',') + 1) : qr;
  const qrUrl = svg?.trimStart().startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    : qr?.startsWith('data:image/svg+xml;') ? qr : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck /></div>
          <CardTitle className="font-heading text-xl">Acesso administrativo protegido</CardTitle>
          <p className="text-sm text-muted-foreground">Confirme o código do seu aplicativo autenticador para abrir o painel.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {!factor && !enrollment && (
            <div className="space-y-3">
              <p className="text-sm">Configure a autenticação em duas etapas para esta conta.</p>
              <Button onClick={enroll} disabled={busy || loadingFactors} className="w-full">Configurar autenticador</Button>
            </div>
          )}
          {enrollment && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-medium">Leia o QR code no aplicativo autenticador.</p>
              {qrUrl && <img src={qrUrl} alt="QR code para configurar autenticação em duas etapas" className="mx-auto h-44 w-44 bg-white p-2" />}
              <p className="break-all text-xs text-muted-foreground">Chave manual: <span className="font-mono">{enrollment.totp?.secret}</span></p>
            </div>
          )}
          {(factor || enrollment) && (
            <form onSubmit={verify} className="space-y-3">
              <label htmlFor="admin-mfa-code" className="text-sm font-medium">Código de 6 dígitos</label>
              <Input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} required />
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Verificar e entrar
              </Button>
            </form>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">A perda do autenticador exige recuperação operacional da conta. Nenhum código é enviado por email.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminAccessGate({ children }) {
  const { user, isOffline } = useAuth();
  const userId = user?.id;
  const accessEpoch = useAccessEpoch(userId);
  const sessionEpoch = getPrivateSessionEpoch();
  const owner = `${userId || 'anonymous'}:${sessionEpoch}:${accessEpoch}`;
  const client = useContext(QueryClientContext);
  const [state, setState] = useState({ owner, phase: 'initial', status: null });
  const [retry, setRetry] = useState(0);
  const current = useRef({ owner, phase: 'initial', generation: 0 });
  if (current.current.owner !== owner) current.current = { owner, phase: 'initial', generation: current.current.generation + 1 };
  const checkRef = useRef(null);
  const mounted = useRef(false);
  const getGeneration = useCallback(() => current.current.generation, []);
  const canAct = useCallback(() => mounted.current && current.current.owner === owner && current.current.phase === 'authorized'
    && !isOffline && Boolean(userId) && getPrivateSessionEpoch() === sessionEpoch && getAccessEpoch(userId) === accessEpoch, [owner, isOffline, userId, sessionEpoch, accessEpoch]);
  const purge = useCallback(() => {
    if (!client) return;
    void client.cancelQueries({ queryKey: ['admin-workspace'] });
    client.removeQueries({ queryKey: ['admin-workspace'] });
  }, [client]);
  useEffect(() => {
    mounted.current = true;
    let active = true, flight = null, hasChecked = false;
    const controllers = new Set(), timers = new Set();
    current.current.phase = 'initial';
    setState({ owner, phase: 'initial', status: null });
    const publish = (phase, status = null) => {
      if (!active) return;
      current.current.phase = phase;
      setState({ owner, phase, status });
      if (['denied', 'mfa', 'unverifiable'].includes(phase)) purge();
    };
    const check = () => {
      if (!active || isOffline || !userId) return Promise.resolve();
      if (flight) return flight;
      const generation = ++current.current.generation;
      const quiet = hasChecked;
      hasChecked = true;
      const keepWork = current.current.phase === 'authorized';
      current.current.phase = keepWork ? 'revalidating' : 'initial';
      setState(previous => ({ owner, phase: current.current.phase, status: keepWork ? previous.status : null }));
      const controller = new AbortController();
      controllers.add(controller);
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = window.setTimeout(() => { controller.abort(); reject(new Error('admin_access_timeout')); }, 10000);
        timers.add(timer);
      });
      flight = Promise.race([fetchAccess(quiet, controller.signal), deadline]).then(status => {
        if (!active || generation !== current.current.generation || owner !== current.current.owner
          || sessionEpoch !== getPrivateSessionEpoch() || accessEpoch !== getAccessEpoch(userId)) return;
        if (!status || typeof status.eligible !== 'boolean' || typeof status.authorized !== 'boolean') throw new Error('invalid_admin_access');
        publish(!status.eligible ? 'denied' : status.authorized ? 'authorized' : 'mfa', status);
      }).catch(() => {
        if (active && generation === current.current.generation && owner === current.current.owner) publish('unverifiable');
      }).finally(() => { window.clearTimeout(timer); timers.delete(timer); controllers.delete(controller); flight = null; });
      return flight;
    };
    checkRef.current = check;
    if (isOffline || !userId) publish('unverifiable'); else void check();
    const onFocus = () => { void check(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => {
      if (current.current.phase === 'authorized') void check();
    }, 30000);
    return () => {
      mounted.current = false;
      active = false; current.current.generation += 1; checkRef.current = null;
      controllers.forEach(controller => controller.abort());
      timers.forEach(timer => window.clearTimeout(timer));
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      purge();
    };
  }, [owner, userId, isOffline, retry, purge, accessEpoch, sessionEpoch]);
  const phase = isOffline || !userId ? 'unverifiable' : state.owner === owner ? state.phase : 'initial';
  if (phase === 'unverifiable') return <div role="alert" className="space-y-4 p-8 text-center text-sm"><p className="text-destructive">A conexão segura com o painel não pôde ser validada. Confira sua conexão e tente novamente.</p><Button variant="outline" disabled={isOffline} onClick={() => setRetry(attempt => attempt + 1)}>Validar acesso novamente</Button>{isOffline && <p className="text-muted-foreground">Aguarde a conexão voltar para validar o acesso.</p>}</div>;
  if (phase === 'initial') return <div role="status" className="flex min-h-dvh items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span>Validando acesso administrativo…</span></div>;
  if (phase === 'denied') return <Navigate to={getHomePath(user)} replace />;
  if (phase === 'mfa') return <AdminMfa key={owner} onVerified={() => checkRef.current?.()} />;
  const blockAction = event => {
    if (!canAct() && (event.type === 'submit' || event.target.closest?.('button,a,[role="button"]'))) {
      event.preventDefault(); event.stopPropagation();
    }
  };
  return <AdminAccessContext.Provider value={{ userId, phase, canAct, getGeneration }}>
    <div aria-busy={phase === 'revalidating' || undefined} onClickCapture={blockAction} onSubmitCapture={blockAction}>
      {phase === 'revalidating' && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Validando acesso · ações temporariamente bloqueadas.</p>}
      {children}
    </div>
  </AdminAccessContext.Provider>;
}
