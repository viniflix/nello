import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fields = [
  ['name', 'Nome completo', true], ['email', 'E-mail'], ['phone', 'Telefone'],
  ['birth_date', 'Data de nascimento'], ['occupation', 'Ocupação'], ['civil_status', 'Estado civil'],
];
const addressFields = [['street', 'Logradouro'], ['city', 'Cidade'], ['state', 'Estado'], ['postal_code', 'CEP']];

export default function ProgressivePatientProfile({ patient = {}, requirements = [], onSave, readOnly = false }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  useEffect(() => setForm({
    ...Object.fromEntries(fields.map(([key]) => [key, patient[key] || ''])),
    gender: patient.gender || '',
    address: Object.fromEntries(addressFields.map(([key]) => [key, patient.address?.[key] || ''])),
  }), [patient]);

  const submit = async (event) => {
    event.preventDefault(); setError(''); setSuccess('');
    if (!form.name?.trim() || form.name.trim().length < 2) { setError('Nome é obrigatório.'); return; }
    setSaving(true);
    const result = await onSave?.({ ...form, name: form.name.trim() });
    setSaving(false);
    if (result?.error) setError('Não foi possível salvar o perfil.');
    else setSuccess('Perfil atualizado com sucesso.');
  };

  return <Card>
    <CardHeader><CardTitle>Perfil progressivo</CardTitle><p className="text-sm text-muted-foreground">Pedimos somente o necessário para identificar e acompanhar o paciente com segurança.</p></CardHeader>
    <CardContent><form onSubmit={submit} className="space-y-5">
      {requirements.includes('birth_date') && <p role="status" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="h-4 w-4 shrink-0" />A data de nascimento é necessária para este contexto clínico.</p>}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Identificação</legend>
        {fields.slice(0, 2).map(([key, label, required]) => <div key={key} className="space-y-2"><Label htmlFor={`profile-${key}`}>{label}{required ? ' *' : ''}</Label><Input id={`profile-${key}`} type={key === 'email' ? 'email' : 'text'} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} aria-required={required} /></div>)}
      </fieldset>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Contato</legend>{fields.slice(2, 3).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`profile-${key}`}>{label}</Label><Input id={`profile-${key}`} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}</fieldset>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Contextual</legend>{fields.slice(3).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`profile-${key}`}>{label}</Label><Input id={`profile-${key}`} type={key === 'birth_date' ? 'date' : 'text'} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}</fieldset>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Gênero e endereço</legend>
        <div className="space-y-2"><Label htmlFor="profile-gender">Gênero</Label><select id="profile-gender" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Não informado</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="not_informed">Prefere não informar</option></select></div>
        {addressFields.map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`profile-address-${key}`}>{label}</Label><Input id={`profile-address-${key}`} value={form.address?.[key] || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, [key]: e.target.value } })} /></div>)}
      </fieldset>
      <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground"><p>Medidas corporais ficam na Antropometria.</p><p>Notas clínicas serão registradas no prontuário.</p></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{success && <p role="status" className="text-sm text-green-700">{success}</p>}
      <Button disabled={saving || readOnly}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar perfil</Button>
    </form></CardContent>
  </Card>;
}
