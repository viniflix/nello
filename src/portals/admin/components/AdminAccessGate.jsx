import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { getHomePath } from '@/app/router/homePath';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

async function fetchAccess() {
  const { data, error } = await supabase.rpc('admin_access_status');
  if (error) throw error;
  return data;
}

function AdminMfa({ onVerified }) {
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) setError('Não foi possível consultar seus fatores de autenticação.');
      else setFactor(data?.totp?.find((item) => item.status === 'verified') || null);
    });
    return () => { active = false; };
  }, []);

  const enroll = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: 'Nello Admin',
      });
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
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code,
      });
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
  const qrUrl = qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
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
              <Button onClick={enroll} disabled={busy} className="w-full">Configurar autenticador</Button>
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
  const [access, setAccess] = useState(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    const status = await fetchAccess();
    setAccess(status);
    setError(false);
  }, []);

  useEffect(() => {
    let active = true;
    setAccess(null);
    setError(false);
    fetchAccess().then((status) => { if (active) setAccess(status); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user?.id]);

  if (isOffline || error) return <div role="alert" className="p-8 text-center text-sm text-destructive">A conexão segura com o painel não pôde ser validada. Atualize a página quando estiver online.</div>;
  if (!access) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!access.eligible) return <Navigate to={getHomePath(user)} replace />;
  if (!access.authorized) return <AdminMfa onVerified={refresh} />;
  return children;
}
