import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Mail, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel,
  AlertDialogAction
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toPortugueseError } from '@/lib/utils/errorMessages';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const { signIn, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Smart redirect logic: wait for auth to finish loading, then redirect if user has profile
  useEffect(() => {
    // Don't redirect while AuthContext is still loading (checking session, fetching profile, etc.)
    if (authLoading) {
      return;
    }

    // If user exists and profile is loaded, redirect based on user_type
    if (user?.profile) {
      const dashboard = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
      console.log('Redirecting authenticated user to dashboard:', dashboard);
      navigate(dashboard, { replace: true });
      return;
    }

    // If user exists but profile is not loaded yet (self-healing in progress), wait
    // The AuthContext will update user when profile is ready, triggering this effect again
    if (user && !user.profile) {
      console.log('User authenticated but profile not loaded yet, waiting...');
      return;
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await signIn({ email, password });

    if (error) {
      toast({
        title: "Erro no login",
        description: toPortugueseError(error, "E-mail ou senha incorretos."),
        variant: "destructive",
      });
    } else if (data.user) {
       toast({
        title: "Login realizado com sucesso!",
        description: `Bem-vindo(a) de volta!`,
      });
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (resetEmail.trim() === '') {
      toast({
        title: "Erro",
        description: "Por favor, insira seu e-mail.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao enviar e-mail",
        description: toPortugueseError(error, 'Não foi possível enviar o e-mail de recuperação.'),
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso!",
        description: "Enviamos um link de recuperação para o seu e-mail.",
      });
      setIsAlertOpen(false);
      setResetEmail('');
    }
  };

  // Show loading state while AuthContext is loading (checking session, fetching profile, self-healing)
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Login Card */}
          <Card className="bg-card shadow-card-dark border-border">
            <CardHeader className="space-y-4 pb-6">
              {/* Logo */}
              <div className="flex justify-center">
                <img
                  src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png"
                  alt="HipoZero"
                  className="h-16 w-auto"
                />
              </div>

              <div className="text-center">
                <CardTitle className="text-2xl font-semibold text-foreground">
                  Acesso ao Sistema
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Entre com suas credenciais
                </p>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10 h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">
                      Senha
                    </Label>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline transition-colors"
                        onClick={() => setResetEmail(email)}
                      >
                        Esqueceu a senha?
                      </button>
                    </AlertDialogTrigger>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pl-10 pr-10 h-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-white font-medium mt-6"
                  disabled={loading}
                >
                  {loading ? (
                    "Entrando..."
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Entrar
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center border-t border-border pt-6">
                <p className="text-sm text-muted-foreground">
                  Não tem uma conta?{' '}
                  <Link
                    to="/register"
                    className="text-primary hover:underline font-medium transition-colors"
                  >
                    Cadastre-se
                  </Link>
                </p>
              </div>
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

      {/* Password Reset Dialog */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recuperar Senha</AlertDialogTitle>
          <AlertDialogDescription>
            Digite seu e-mail abaixo. Enviaremos um link para você criar uma nova senha.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            placeholder="seu@email.com"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            className="mt-2"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={handlePasswordReset} disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? "Enviando..." : "Enviar link"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
