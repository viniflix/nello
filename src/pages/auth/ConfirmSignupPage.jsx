import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { confirmEmailWithCode, confirmationRetryAfterMs, isExpectedConfirmationRejection, normalizeAuthEmail, resendEmailConfirmation } from '@/features/auth/authFlows';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { publicOrigin } from '@/lib/utils/publicOrigin';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';

const RESEND_COOLDOWN_MS = 60_000;
const COOLDOWN_STORAGE_KEY = 'nello_confirmation_resend';

const readCooldown = (email, sentAt) => {
  let until = Number(sentAt || 0) + RESEND_COOLDOWN_MS;
  try {
    const saved = JSON.parse(sessionStorage.getItem(COOLDOWN_STORAGE_KEY) || 'null');
    if (saved?.email === normalizeAuthEmail(email)) until = Math.max(until, Number(saved.until) || 0);
  } catch { /* Session storage may be unavailable. */ }
  return until;
};

export default function ConfirmSignupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(() => readCooldown(location.state?.email, location.state?.sentAt));
  const [now, setNow] = useState(Date.now());
  const [feedback, setFeedback] = useState('');
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const startCooldown = (durationMs) => {
    const until = Date.now() + durationMs;
    setCooldownUntil(until);
    setNow(Date.now());
    try { sessionStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify({ email: normalizeAuthEmail(email), until })); }
    catch { /* In-memory cooldown remains active. */ }
  };

  useEffect(() => {
    if (!secondsLeft) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const handleConfirm = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      await confirmEmailWithCode(supabase, email, code);
      toast({ title: 'E-mail confirmado', description: 'Sua conta está pronta para acessar o Nello.' });
      navigate('/login', { replace: true, state: { confirmed: true } });
    } catch (error) {
      if (!isExpectedConfirmationRejection(error)) {
        captureOperationalError(error, { operation: 'auth.confirm_signup', module: 'authentication', source: 'supabase_auth' });
      }
      setFeedback(toPortugueseError(error, 'Não foi possível confirmar. Confira o código ou solicite outro.'));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    setFeedback('');
    try {
      await resendEmailConfirmation(supabase, email, publicOrigin());
      startCooldown(RESEND_COOLDOWN_MS);
      setCode('');
      toast({ title: 'Novo código enviado', description: 'Use somente o código mais recente. Confira também a caixa de spam.' });
    } catch (error) {
      if (Number(error?.status || error?.statusCode) === 429) {
        startCooldown(confirmationRetryAfterMs(error));
        setFeedback('Muitas tentativas de envio. Aguarde o tempo indicado antes de pedir outro código.');
      } else if (isExpectedConfirmationRejection(error)) {
        setFeedback(toPortugueseError(error, 'Código não reenviado. Confira o e-mail e tente novamente.'));
      } else {
        captureOperationalError(error, { operation: 'auth.resend_confirmation', module: 'authentication', source: 'supabase_auth' });
        setFeedback(toPortugueseError(error, 'Não foi possível reenviar o código. Tente novamente.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 rounded-full bg-primary/10 p-3 text-primary"><Mail className="h-6 w-6" /></div>
          <CardTitle>Confirme seu e-mail</CardTitle>
          <p className="text-sm text-muted-foreground">Digite o código de 6 números que enviamos para o e-mail do cadastro.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirmation-email">E-mail</Label>
              <Input id="confirmation-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation-code">Código de confirmação</Label>
              <Input id="confirmation-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
            </div>
            {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>Confirmar e-mail</Button>
          </form>
          <Button type="button" variant="outline" className="w-full" disabled={busy || secondsLeft > 0 || !email.trim()} onClick={handleResend}>
            {secondsLeft > 0 ? `Pedir novo código em ${secondsLeft}s` : 'Pedir novo código'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Use apenas o código mais recente. Se não receber, confira o spam.</p>
          <p className="text-center text-sm"><Link to="/login" className="text-primary hover:underline">Voltar ao login</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}
