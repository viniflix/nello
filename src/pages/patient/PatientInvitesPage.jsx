import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket } from 'lucide-react';

export default function PatientInvitesPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleRedeem = async (e) => {
    e.preventDefault();
    const trimmed = code?.trim();
    if (!trimmed) {
      toast({ title: 'Código obrigatório', description: 'Digite o código que você recebeu.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('redeem_invite_code', { input_code: trimmed });
      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result?.success) {
        toast({
          title: 'Código resgatado!',
          description: 'Você foi vinculado ao nutricionista. Pode acessar o app normalmente.',
          variant: 'success',
        });
        setCode('');
        navigate('/patient', { replace: true });
      } else {
        toast({
          title: 'Não foi possível resgatar',
          description: result?.message || 'Código inválido ou expirado.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('redeem_invite_code error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao resgatar código. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Ticket className="h-6 w-6" />
            <CardTitle>Resgatar código de convite</CardTitle>
          </div>
          <CardDescription>
            Se seu nutricionista passou um código de acesso, digite abaixo para vincular sua conta e acessar o acompanhamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRedeem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: ABC123"
                className="font-mono uppercase"
                disabled={loading}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Resgatando...' : 'Resgatar código'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/patient')} disabled={loading}>
              Voltar ao início
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
