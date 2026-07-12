import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  getMyStudentSupervisions,
  requestStudentSupervision,
  respondStudentSupervision
} from '@/lib/supabase/supervision-queries';

export default function StudentSupervisionCard({ verification }) {
  const { toast } = useToast();
  const [relationships, setRelationships] = useState([]);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const role = verification?.professional_role;
  const eligible = verification?.status === 'approved' && ['student', 'nutritionist'].includes(role);

  const reload = useCallback(async () => {
    if (!eligible) return;
    const { data } = await getMyStudentSupervisions();
    setRelationships(data || []);
  }, [eligible]);

  useEffect(() => { reload(); }, [reload]);

  const run = async (action) => {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) {
      toast({ title: 'Não foi possível atualizar a supervisão', description: error.message, variant: 'destructive' });
      return;
    }
    setEmail('');
    setReason('');
    await reload();
    toast({ title: 'Supervisão atualizada' });
  };

  if (!eligible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><GraduationCap /> Supervisão acadêmica</CardTitle>
        <CardDescription>
          Estudantes precisam de verificação semestral vigente e supervisão aceita para atender pacientes reais.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {role === 'student' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="supervisor-email">E-mail do supervisor</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="supervisor-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="supervisor@clinica.com.br" />
              <Button disabled={busy || !email.trim()} onClick={() => run(() => requestStudentSupervision(email))}>
                {busy ? <Loader2 className="animate-spin" /> : null} Solicitar supervisão
              </Button>
            </div>
          </div>
        ) : null}

        {relationships.length ? relationships.map((item) => (
          <div key={item.id} className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="font-medium">{item.counterpart_name || item.counterpart_email}</p>
              <p className="text-sm text-muted-foreground">Situação: {item.status}</p>
            </div>
            {item.perspective === 'supervisor' && item.status === 'pending' ? (
              <div className="space-y-2">
                <Label htmlFor={`decision-reason-${item.id}`}>Motivo da decisão</Label>
                <Input id={`decision-reason-${item.id}`} value={reason} onChange={(event) => setReason(event.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || reason.trim().length < 5} onClick={() => run(() => respondStudentSupervision(item.id, 'active', reason))}>Aceitar supervisão</Button>
                  <Button variant="outline" disabled={busy || reason.trim().length < 5} onClick={() => run(() => respondStudentSupervision(item.id, 'rejected', reason))}>Recusar</Button>
                </div>
              </div>
            ) : null}
          </div>
        )) : <p className="text-sm text-muted-foreground">Nenhum vínculo de supervisão registrado.</p>}
      </CardContent>
    </Card>
  );
}
