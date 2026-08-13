import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Leaf, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import {
  authFlowPolicy,
  clearForcedPasswordReset,
  updateAndVerifyPassword,
  validateNewPassword,
} from '@/features/auth/authFlows';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';
import { Events, track } from '@/infrastructure/analytics/posthog';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [session, setSession] = useState(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const passwordsDiffer = confirmPassword.length > 0 && password !== confirmPassword;

  useEffect(() => {
    let active = true;

    const acceptSession = (nextSession) => {
      if (!active || !nextSession?.user) return;
      setSession(nextSession);
      setCheckingSession(false);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        acceptSession(nextSession);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.session?.user) {
        setCheckingSession(false);
        return;
      }
      acceptSession(data.session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      toast({ title: 'Revise a senha', description: validationError, variant: 'destructive' });
      return;
    }
    if (!session?.user) {
      toast({
        title: 'Link inválido ou expirado',
        description: 'Solicite um novo link de recuperação e tente novamente.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await updateAndVerifyPassword(supabase, { session, password });
      try {
        await clearForcedPasswordReset(supabase, session.user.id);
      } catch (profileError) {
        // A credencial já foi confirmada. Uma falha auxiliar de perfil deve ser
        // observável, mas não pode transformar uma troca válida em falso erro.
        captureOperationalError(profileError, {
          operation: 'auth.clear_forced_password_reset',
          module: 'authentication',
          source: 'supabase_database',
        });
      }

      track(Events.AUTH_PASSWORD_UPDATED, {
        user_type: user?.profile?.user_type || 'unknown',
        flow: new URLSearchParams(window.location.search).get('mode') || 'email_link',
      });
      toast({
        title: 'Senha atualizada e validada!',
        description: 'O acesso com a nova senha foi confirmado. Você já está conectado.',
        variant: 'success',
      });

      window.history.replaceState({}, document.title, '/update-password');
      navigate(user?.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient', {
        replace: true,
      });
    } catch (error) {
      captureOperationalError(error, {
        operation: error.passwordWasUpdated
          ? 'auth.verify_updated_password'
          : 'auth.update_password',
        module: 'authentication',
        source: 'supabase_auth',
      });
      toast({
        title: error.passwordWasUpdated ? 'Senha gravada, validação pendente' : 'Erro ao atualizar senha',
        description: error.passwordWasUpdated
          ? 'A senha foi alterada, mas a confirmação do login falhou. Tente entrar com a nova senha ou solicite outro link.'
          : toPortugueseError(error, 'Não foi possível atualizar a senha.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Validando seu link seguro...
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link inválido ou expirado</CardTitle>
            <CardDescription>
              Por segurança, links de recuperação são de uso único. Solicite um novo link na tela de acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Voltar ao acesso
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/nello.png"
              alt="Nello"
              className="h-16 w-auto object-contain"
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold text-foreground">Definição de Senha</CardTitle>
            <CardDescription className="mt-2">Defina e confirme sua nova senha</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={authFlowPolicy.minPasswordLength}
                  maxLength={authFlowPolicy.maxPasswordLength}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use pelo menos {authFlowPolicy.minPasswordLength} caracteres.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirm-new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={authFlowPolicy.minPasswordLength}
                  maxLength={authFlowPolicy.maxPasswordLength}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={passwordsDiffer}
                  aria-describedby={passwordsDiffer ? 'confirmPasswordError' : undefined}
                  required
                  className={`pr-10 ${passwordsDiffer ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordsDiffer && (
                <p id="confirmPasswordError" className="text-xs font-medium text-destructive" role="alert">
                  As senhas não coincidem. Confira os dois campos.
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || passwordsDiffer || !password || !confirmPassword}
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando...</> : 'Atualizar e validar senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
