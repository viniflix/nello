import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Leaf, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog'; // Importa o AlertDialog
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient'; // Importa o Supabase

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Estados para o pop-up de recuperar senha
  const [resetEmail, setResetEmail] = useState('');
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Função para lidar com o login principal
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await signIn({ email, password });

    if (error) {
      toast({
        title: "Erro no login",
        description: error.message || "Email ou senha incorretos.",
        variant: "destructive",
      });
    } else if (data.user) {
       toast({
        title: "Login realizado com sucesso!",
        description: `Bem-vindo(a) de volta!`,
      });
      // A navegação é tratada pelo AuthProvider
    }
    setLoading(false);
  };

  // Nova função para lidar com a recuperação de senha
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
    
    // Chama a função do Supabase para enviar o e-mail de recuperação
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      // Redireciona para a página que JÁ CRIAMOS
      redirectTo: window.location.origin + '/update-password',
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao enviar e-mail",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso!",
        description: "Enviamos um link de recuperação para o seu e-mail.",
      });
      setIsAlertOpen(false); // Fecha o pop-up
      setResetEmail('');
    }
  };

  return (
    // Envolve tudo no AlertDialog para que ele possa ser aberto
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="glass-card shadow-xl">
            <CardHeader className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center"
              >
                <Leaf className="w-8 h-8 text-white" />
              </motion.div>
              <div>
                <CardTitle className="text-3xl font-bold gradient-text">HipoZero</CardTitle>
                <CardDescription className="text-gray-600 mt-2">
                  Acesse sua conta para continuar
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="transition-all duration-200 focus:scale-[1.02]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10 transition-all duration-200 focus:scale-[1.02]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Link "Esqueci minha senha" que abre o pop-up */}
                  <div className="text-right pt-1">
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                        onClick={() => setResetEmail(email)} // Opcional: já preenche o e-mail
                      >
                        Esqueceu sua senha?
                      </button>
                    </AlertDialogTrigger>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium py-2 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
                  disabled={loading}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  Não tem uma conta?{' '}
                  <Link
                    to="/register"
                    className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                  >
                    Cadastre-se
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Conteúdo do Pop-up (AlertDialog) */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recuperar Senha</AlertDialogTitle>
          <AlertDialogDescription>
            Digite seu e-mail abaixo. Enviaremos um link para você
            criar uma nova senha na página de atualização.
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
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          {/* Usamos AlertDialogAction para o botão principal, mas vamos controlá-lo com nosso clique */}
          <AlertDialogAction asChild>
            <Button onClick={handlePasswordReset} disabled={loading}>
              {loading ? "Enviando..." : "Enviar link"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}