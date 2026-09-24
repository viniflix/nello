import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';

export default function AccountEmailChange({ currentEmail }) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || nextEmail === currentEmail?.toLowerCase()) return;
    setPending(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setEmail('');
      setMessage({ type: 'success', text: 'Solicitação enviada. Confirme a alteração nos emails exigidos antes de usar o novo endereço para entrar.' });
    } catch {
      setMessage({ type: 'error', text: 'Não foi possível solicitar a troca. Confira o endereço e tente novamente.' });
    } finally {
      setPending(false);
    }
  };

  return <form onSubmit={submit} className="space-y-3 border-t pt-4">
    <div className="space-y-1"><Label htmlFor="account-new-email">Novo email de acesso</Label><p className="text-xs text-muted-foreground">Use uma caixa que você já consegue acessar. O endereço atual continua válido até a confirmação.</p></div>
    <div className="flex flex-col gap-2 sm:flex-row"><Input id="account-new-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} placeholder="voce@dominio.com.br" /><Button type="submit" disabled={pending || !email.trim() || email.trim().toLowerCase() === currentEmail?.toLowerCase()}>{pending ? 'Solicitando...' : 'Solicitar alteração'}</Button></div>
    {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={message.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}>{message.text}</p>}
  </form>;
}
