import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Leaf, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';

export default function ForcePasswordUpdate() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();
  const { user, updateUserProfile } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Senha Curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // 1. Atualizar a senha no auth
    const { error: authError } = await supabase.auth.updateUser({
      password: password,
    });

    if (authError) {
      setLoading(false);
      toast({
        title: "Erro ao atualizar senha",
        description: toPortugueseError(authError, 'Não foi possível atualizar a senha.'),
        variant: "destructive",
      });
      return;
    }

    // 2. Atualizar o profile removendo a flag
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ needs_password_reset: false })
      .eq('id', user.id);

    setLoading(false);

    if (profileError) {
      console.error(profileError);
      toast({
        title: "Aviso",
        description: "Senha alterada, mas houve um erro ao salvar o perfil. Atualize a página.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso!",
        description: "Sua senha foi redefinida. Bem-vindo(a) ao HipoZero!",
        variant: "success"
      });
      // Atualizar o contexto para que PatientMobileLayout esconda esta tela
      updateUserProfile({ needs_password_reset: false });
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
            <CardTitle className="text-2xl font-bold text-slate-800">Ação Necessária</CardTitle>
            <CardDescription className="text-gray-600 mt-2 flex items-start gap-2 text-left bg-amber-50 p-3 rounded-md text-amber-800 border border-amber-200">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>Por motivos de segurança, você precisa alterar sua senha temporária antes de continuar.</span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-6"
              disabled={loading || !password || (password !== confirmPassword && confirmPassword.length > 0)}
            >
              {loading ? "Salvando..." : "Definir Nova Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
