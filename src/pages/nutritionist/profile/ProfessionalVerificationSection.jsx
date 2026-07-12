import React, { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VerificationStatusCard from '@/components/verification/VerificationStatusCard';
import { submitProfessionalVerification } from '@/lib/supabase/verification-queries';
import { getVerificationCapabilities } from '@/lib/verification/verificationState';
import { useToast } from '@/components/ui/use-toast';

export default function ProfessionalVerificationSection({ initialVerification }) {
  const { toast } = useToast();
  const [verification, setVerification] = useState(initialVerification || { status: 'not_submitted' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    professional_role: initialVerification?.professional_role || 'nutritionist',
    crn_region: initialVerification?.crn_region || '',
    crn_number: initialVerification?.crn_number || '',
    institution_name: initialVerification?.institution_name || '',
    current_semester: initialVerification?.current_semester || '',
    expected_graduation_at: initialVerification?.expected_graduation_at || ''
  });
  const capabilities = getVerificationCapabilities(verification);

  const update = (field) => (event) => setForm(previous => ({ ...previous, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    const payload = form.professional_role === 'student'
      ? {
          professional_role: 'student',
          institution_name: form.institution_name,
          current_semester: Number(form.current_semester),
          expected_graduation_at: form.expected_graduation_at
        }
      : {
          professional_role: 'nutritionist',
          crn_region: form.crn_region,
          crn_number: form.crn_number
        };
    const { data, error } = await submitProfessionalVerification(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Não foi possível enviar', description: error.message, variant: 'destructive' });
      return;
    }
    setVerification(previous => ({ ...previous, ...payload, status: data?.status || 'pending', has_clinical_capacity: false }));
    setShowForm(false);
    toast({ title: 'Verificação enviada', description: 'A solicitação entrou na fila de análise.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck /> Verificação profissional</CardTitle>
        <CardDescription>Habilitação para atender, convidar pacientes reais e emitir documentos profissionais.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <VerificationStatusCard verification={verification} onAction={() => setShowForm(true)} />
        {showForm && capabilities.canSubmitVerification ? (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="professional-role">Perfil profissional</Label>
              <Select value={form.professional_role} onValueChange={(value) => setForm(previous => ({ ...previous, professional_role: value }))}>
                <SelectTrigger id="professional-role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="nutritionist">Nutricionista</SelectItem><SelectItem value="student">Estudante de Nutrição</SelectItem></SelectGroup></SelectContent>
              </Select>
            </div>
            {form.professional_role === 'student' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2 md:col-span-2"><Label htmlFor="institution">Instituição</Label><Input id="institution" required value={form.institution_name} onChange={update('institution_name')} /></div>
                <div className="flex flex-col gap-2"><Label htmlFor="semester">Semestre atual</Label><Input id="semester" type="number" min="1" max="20" required value={form.current_semester} onChange={update('current_semester')} /></div>
                <div className="flex flex-col gap-2"><Label htmlFor="graduation">Previsão de formatura</Label><Input id="graduation" type="date" required value={form.expected_graduation_at} onChange={update('expected_graduation_at')} /></div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2"><Label htmlFor="crn-region">Região do CRN</Label><Input id="crn-region" required placeholder="Ex.: 3" value={form.crn_region} onChange={update('crn_region')} /></div>
                <div className="flex flex-col gap-2"><Label htmlFor="crn-number">Número do CRN</Label><Input id="crn-number" required placeholder="Ex.: 12345" value={form.crn_number} onChange={update('crn_number')} /></div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null} Enviar para análise</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
