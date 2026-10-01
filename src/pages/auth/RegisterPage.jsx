import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import AuthCaptcha, { useAuthCaptcha } from '@/features/auth/AuthCaptcha';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { authFlowPolicy, validateNewPassword } from '@/features/auth/authFlows';
import { publicOrigin } from '@/lib/utils/publicOrigin';
import LegalSignupChoice from '@/features/privacy/components/LegalSignupChoice';
import PublicHelpLinks from '@/features/privacy/components/PublicHelpLinks';
import { signupLegalMetadata } from '@/features/privacy/consent';
import { Events, track } from '@/infrastructure/analytics/posthog';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    type: '',
    inviteCode: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const captcha = useAuthCaptcha();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const passwordsDiffer = formData.confirmPassword.length > 0
    && formData.password !== formData.confirmPassword;

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || !captcha.ready) return;
    const passwordError = validateNewPassword(formData.password, formData.confirmPassword);
    const inviteCode = formData.inviteCode.trim().toUpperCase();
    const invalid = passwordError || (!accepted && 'Leia e aceite os termos para criar sua conta.')
      || (!['nutritionist', 'patient'].includes(formData.type) && 'Selecione o tipo de acesso.')
      || (formData.type === 'patient' && !inviteCode && 'Para entrar como paciente, peça um convite ao seu profissional.');
    if (invalid) { toast({ title: 'Revise o cadastro', description: invalid, variant: 'destructive' }); return; }
    setLoading(true);
    track(Events.AUTH_SIGNUP_STARTED, { flow: formData.type });
    try {
      const { error } = await signUp({
        email: formData.email.trim().toLowerCase(), password: formData.password,
        options: { ...captcha.options, data: { name: formData.name.trim(), user_type: formData.type,
          ...(formData.type === 'patient' ? { invite_code: inviteCode } : {}),
          ...signupLegalMetadata(analytics) }, emailRedirectTo: `${publicOrigin()}/login` },
      });
      if (error) throw error;
      if (formData.type === 'patient') {
        try { localStorage.setItem('pending_invite_code', inviteCode); }
        catch { /* The confirmation link and manual invitation remain available. */ }
      }
      track(Events.AUTH_SIGNUP_SUBMITTED, { flow: formData.type });
      toast({ title: 'Cadastro enviado', description: 'Confira seu email para confirmar o acesso. Se a conta já existir, use o login ou a recuperação.' });
      navigate('/confirm-signup', { state: { email: formData.email.trim().toLowerCase(), sentAt: Date.now() } });
    } catch (error) {
      logDiagnostic('error', 'auth.register', error);
      if (!error.status || error.status >= 500) captureOperationalError(error, { operation: 'auth.signup', module: 'authentication', source: 'supabase_auth' });
      track(Events.AUTH_SIGNUP_FAILED, { flow: formData.type, error_code: error.code || 'unknown', http_status: error.status });
      toast({ title: 'Não foi possível cadastrar', description: toPortugueseError(error, 'Confira o convite e os dados de acesso. Em caso de limite de envios, aguarde antes de tentar novamente.'), variant: 'destructive' });
    } finally { captcha.reset(); setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* Register Card */}
        <Card className="bg-card shadow-card-dark border-border">
          <CardHeader className="space-y-4 pb-6">
            {/* Logo */}
              <div className="flex justify-center">
                <img
                  src="/nello-logo.png"
                  alt="Nello"
                  width="158"
                  height="64"
                  className="h-16 w-auto object-contain"
                  fetchPriority="high"
                  loading="eager"
                  decoding="async"
                />
              </div>

            <div className="text-center">
              <CardTitle className="text-2xl font-semibold text-foreground">
                Criar Conta
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Preencha os dados para começar
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Nome completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nome completo"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      required
                      maxLength={100}
                      className="pl-10 h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      required
                      maxLength={100}
                      className="pl-10 h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type" className="text-sm font-medium">Tipo de usuário</Label>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                    <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                      <SelectTrigger className="pl-10 h-10">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nutritionist">Nutricionista</SelectItem>
                        <SelectItem value="patient">Paciente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {formData.type === 'patient' ? <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="inviteCode">Código de convite do profissional</Label>
                <Input id="inviteCode" required maxLength={128} value={formData.inviteCode}
                  onChange={e => handleInputChange('inviteCode', e.target.value)} placeholder="Código recebido do profissional" />
                <p className="text-xs text-muted-foreground">O vínculo será confirmado após verificar seu email. Informações clínicas são registradas durante o acompanhamento.</p>
              </div> : formData.type === 'nutritionist' && <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                Sua conta começa pendente de verificação profissional. Após confirmar o email, envie os documentos pela tela de verificação. Recursos clínicos protegidos exigem aprovação.
              </p>}

              {/* Password fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="new-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      minLength={authFlowPolicy.minPasswordLength}
                      maxLength={72}
                      className="pl-10 pr-10 h-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirmar senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      name="confirm-new-password"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      aria-invalid={passwordsDiffer}
                      aria-describedby={passwordsDiffer ? 'registerPasswordConfirmationError' : undefined}
                      required
                      minLength={authFlowPolicy.minPasswordLength}
                      maxLength={72}
                      className={`pl-10 pr-10 h-10 ${passwordsDiffer ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"} aria-pressed={showConfirmPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordsDiffer && (
                    <p id="registerPasswordConfirmationError" className="text-xs font-medium text-destructive" role="alert">
                      As senhas não coincidem. Confira os dois campos.
                    </p>
                  )}
                </div>
              </div>

              <LegalSignupChoice accepted={accepted} analytics={analytics} onAccepted={setAccepted} onAnalytics={setAnalytics} />
              <AuthCaptcha {...captcha.widget} />
              <Button
                type="submit"
                className="w-full h-10 bg-primary hover:bg-primary/90 text-white font-medium mt-6"
                disabled={loading || !captcha.ready || !formData.type || passwordsDiffer || !accepted}
              >
                {loading ? "Cadastrando..." : "Criar conta"}
              </Button>
            </form>

            <div className="mt-6 text-center border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">
                Já tem uma conta?{' '}
                <Link
                  to="/login"
                  className="text-primary hover:underline font-medium transition-colors"
                >
                  Entrar
                </Link>
              </p>
            </div>
            <PublicHelpLinks />
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Plataforma profissional de gestão nutricional
          </p>
        </div>
      </motion.div>
    </div>
  );
}
