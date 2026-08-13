import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, AlertTriangle } from 'lucide-react';
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

export default function ForcePasswordUpdate() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();
  const { user, updateUserProfile } = useAuth();
  const passwordsDiffer = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      toast({ title: 'Revise a senha', description: validationError, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      await updateAndVerifyPassword(supabase, {
        session: sessionData?.session,
        password,
      });
      await clearForcedPasswordReset(supabase, user.id);

      track(Events.AUTH_PASSWORD_UPDATED, { user_type: 'patient', flow: 'first_access' });
      updateUserProfile({ needs_password_reset: false });
      toast({
        title: 'Senha atualizada e validada!',
        description: 'O acesso com a nova senha foi confirmado.',
        variant: 'success',
      });
    } catch (error) {
      captureOperationalError(error, {
        operation: error.passwordWasUpdated
          ? 'auth.verify_first_access_password'
          : 'auth.update_first_access_password',
        module: 'authentication',
        source: 'supabase_auth',
      });
      toast({
        title: error.passwordWasUpdated ? 'Senha gravada, validação pendente' : 'Erro ao atualizar senha',
        description: error.passwordWasUpdated
          ? 'A senha foi alterada, mas a confirmação do acesso falhou. Atualize a página e tente entrar com a nova senha.'
          : toPortugueseError(error, 'Não foi possível atualizar a senha.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-emerald-100 bg-white">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800">AÇÃO NECESSÁRIA</CardTitle>
            <CardDescription className="text-gray-600 mt-2 flex items-start gap-2 text-left bg-amber-50 p-3 rounded-md text-amber-800 border border-amber-200">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>Por segurança, defina uma senha pessoal antes de continuar.</span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div className="space-y-2">
              <Label htmlFor="firstAccessPassword">Nova senha</Label>
              <div className="relative">
                <Input
                  id="firstAccessPassword"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Use pelo menos {authFlowPolicy.minPasswordLength} caracteres.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="firstAccessPasswordConfirmation">Confirmar nova senha</Label>
              <div className="relative">
                <Input
                  id="firstAccessPasswordConfirmation"
                  name="confirm-new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={authFlowPolicy.minPasswordLength}
                  maxLength={authFlowPolicy.maxPasswordLength}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={passwordsDiffer}
                  aria-describedby={passwordsDiffer ? 'firstAccessPasswordConfirmationError' : undefined}
                  required
                  className={`pr-10 ${passwordsDiffer ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordsDiffer && (
                <p
                  id="firstAccessPasswordConfirmationError"
                  className="text-xs font-medium text-destructive"
                  role="alert"
                >
                  As senhas não coincidem. Confira os dois campos.
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || passwordsDiffer || !password || !confirmPassword}
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando...</> : 'Definir e validar senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
