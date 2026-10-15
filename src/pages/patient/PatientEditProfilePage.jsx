import {executeRead,readPolicies} from '@/lib/utils/readPolicy';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDraftGuard } from '@/hooks/useDraftGuard';
import { failurePresentation } from '@/lib/utils/failure';
import { invalidateDomain } from '@/infrastructure/realtime/events';

/**
 * PatientEditProfilePage - Página de edição completa do perfil do paciente
 */
const formFromProfile = profile => {
  const fields = ['name', 'phone', 'birth_date', 'gender', 'height', 'weight'];
  const addressFields = ['zipcode', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'];
  return Object.fromEntries([...fields.map(key => [key, String(profile?.[key] ?? '')]),
    ...addressFields.map(key => [key, String(profile?.address?.[key] ?? '')])]);
};
const sameForm = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export default function PatientEditProfilePage() {
  const { user } = useAuth();
  if (!user?.id || !user.profile) return <p role="status">Carregando perfil…</p>;
  // Remount only for a different account, before any previous draft can render.
  return <PatientProfileEditor key={user.id} user={user} />;
}

function PatientProfileEditor({ user }) {
  const { updateUserProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [base, setBase] = useState(() => formFromProfile(user.profile));
  const [formData, setFormData] = useState(base);
  const [external, setExternal] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const dirty = !sameForm(formData, base);
  const latestProfile = JSON.stringify(formFromProfile(user.profile));
  const latest = JSON.parse(latestProfile);
  const conflict = external || (dirty && !sameForm(latest, base) ? latest : null);
  const mounted = useRef(false), saving = useRef(false), postal = useRef({ sequence: 0, controller: null });
  const fields = useRef(formData); fields.current = formData;
  useDraftGuard(dirty || loading);

  useEffect(() => {
    mounted.current = true;
    const requests = postal.current;
    return () => { mounted.current = false; requests.sequence += 1; requests.controller?.abort(); };
  }, []);
  useEffect(() => {
    const updated = JSON.parse(latestProfile);
    if (sameForm(updated, base)) { setExternal(null); return; }
    if (saving.current) return;
    if (dirty) setExternal(updated);
    else { setBase(updated); setFormData(updated); setExternal(null); }
  }, [latestProfile, base, dirty]);

  const handleChange = (field, value) => {
    const next = { ...fields.current, [field]: value };
    fields.current = next; setFormData(next); setSaveError(null);
  };
  const leave = () => {
    if (saving.current) return;
    if (dirty && !window.confirm('Descartar as alterações deste perfil e voltar?')) return;
    navigate('/patient/perfil');
  };
  const reviewExternal = keepDraft => {
    const snapshot = formFromProfile(user.profile);
    if (!keepDraft && dirty && !window.confirm('Descartar sua edição e usar o perfil atualizado?')) return;
    setBase(snapshot); setExternal(null); setSaveError(null);
    if (!keepDraft) { postal.current.controller?.abort(); postal.current.sequence += 1; setLoadingCep(false); setFormData(snapshot); fields.current = snapshot; }
  };
  const handleCepChange = async cep => {
    const cleanCep = cep.replace(/\D/g, '');
    handleChange('zipcode', cleanCep);
    postal.current.controller?.abort();
    const sequence = ++postal.current.sequence;
    setLoadingCep(false);
    if (cleanCep.length !== 8) return;
    const controller = new AbortController(); postal.current.controller = controller;
    const before = { ...fields.current };
    const current = () => mounted.current && postal.current.sequence === sequence && !controller.signal.aborted;
    setLoadingCep(true);
    try {
      const data = await executeRead(async signal => {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { signal });
        if (!response.ok) throw Object.assign(new Error('postal_source_unavailable'), {status:response.status});
        return response.json();
      }, {signal:controller.signal,policy:readPolicies.provider});
      if (!current()) return;
      if (data.erro) { toast({ title: 'CEP não encontrado', description: 'Verifique o CEP digitado.', variant: 'destructive' }); return; }
      const next = { ...fields.current };
      for (const [field, source] of [['street', 'logradouro'], ['neighborhood', 'bairro'], ['city', 'localidade'], ['state', 'uf']]) {
        if (next[field] === before[field]) next[field] = data[source] || '';
      }
      fields.current = next; setFormData(next);
    } catch {
      if (mounted.current && postal.current.sequence === sequence && (!controller.signal.aborted || controller.signal.reason?.name === 'TimeoutError')) {
        toast({ title: 'CEP não consultado', description: 'Preencha o endereço ou tente novamente.', variant: 'destructive' });
      }
    } finally { if (mounted.current && postal.current.sequence === sequence) setLoadingCep(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving.current || conflict || loadingCep || !mounted.current) return;

    // Validações básicas
    if (!formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    saving.current = true; setLoading(true); setSaveError(null);

    try {
      // Preparar objeto de endereço
      const address = {
        zipcode: formData.zipcode || null,
        street: formData.street || null,
        number: formData.number || null,
        complement: formData.complement || null,
        neighborhood: formData.neighborhood || null,
        city: formData.city || null,
        state: formData.state || null
      };

      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          name: formData.name,
          phone: formData.phone,
          birth_date: formData.birth_date || null,
          gender: formData.gender || null,
          height: formData.height ? parseFloat(formData.height) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          address: address
        })
        .eq('id', user.id).select('id,name,phone,birth_date,gender,height,weight,address').single();

      if (!mounted.current) return;
      if (error) throw error;
      if (!data || data.id !== user.id) throw new Error('profile_write_not_confirmed');
      updateUserProfile(data);
      invalidateDomain(user.id, 'profile');
      setBase(formFromProfile(data));

      toast({
        title: 'Sucesso!',
        description: 'Suas informações foram atualizadas.'
      });

      navigate('/patient/perfil');
    } catch (error) {
      if (!mounted.current) return;
      setSaveError(failurePresentation(error));
      logDiagnostic('error', 'pages/patient/PatientEditProfilePage.jsx:171', 'Erro ao atualizar perfil:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar suas informações.',
        variant: 'destructive'
      });
    } finally {
      saving.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <div className="patient-page-content max-w-3xl">
        {/* Header com botão voltar */}
        <div className="mb-6 flex items-start gap-2 sm:items-center sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar ao perfil"
            onClick={leave}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="patient-page-title">Editar Perfil</h1>
            <p className="text-muted-foreground mt-1">
              Atualize suas informações pessoais
            </p>
          </div>
        </div>

        {conflict && <section role="alert" className="mb-4 space-y-3 rounded-xl border p-4 text-sm">
          <p>Seu perfil foi atualizado enquanto você editava. Sua edição foi preservada. Revise antes de salvar.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => reviewExternal(false)}>Usar perfil atualizado</Button>
            <Button variant="outline" disabled={loading} onClick={() => reviewExternal(true)}>Manter minha edição</Button></div>
        </section>}
        {saveError && <p role="alert" className="mb-4 rounded-xl border p-3 text-sm">{saveError.message} Sua edição foi preservada.</p>}
        {/* Formulário */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Informações Pessoais</CardTitle>
                <CardDescription>
                  Mantenha seus dados atualizados para um melhor acompanhamento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <fieldset disabled={loading} className="min-w-0 space-y-6">
                {/* Nome Completo */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    placeholder="Digite seu nome completo"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                  />
                </div>

                {/* Grid de 2 colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Telefone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  </div>

                  {/* Data de Nascimento */}
                  <div className="space-y-2">
                    <Label htmlFor="birth_date">Data de Nascimento</Label>
                    <DateInputWithCalendar
                      id="birth_date"
                      value={formData.birth_date}
                      onChange={(value) => handleChange('birth_date', value)}
                    />
                  </div>
                </div>

                {/* Gênero */}
                <div className="space-y-2">
                  <Label htmlFor="gender">Gênero</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleChange('gender', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione seu gênero" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Masculino</SelectItem>
                      <SelectItem value="female">Feminino</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefiro não informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Medidas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Altura */}
                  <div className="space-y-2">
                    <Label htmlFor="height">Altura (cm)</Label>
                    <Input
                      id="height"
                      type="number"
                      step="0.1"
                      placeholder="170"
                      value={formData.height}
                      onChange={(e) => handleChange('height', e.target.value)}
                    />
                  </div>

                  {/* Peso Atual */}
                  <div className="space-y-2">
                    <Label htmlFor="weight">Peso (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      placeholder="70"
                      value={formData.weight}
                      onChange={(e) => handleChange('weight', e.target.value)}
                    />
                  </div>
                </div>

                <hr className="border-t" />

                {/* Seção: Endereço */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Endereço</h3>

                  {/* CEP */}
                  <div className="space-y-2">
                    <Label htmlFor="zipcode">CEP</Label>
                    <div className="relative">
                      <Input
                        id="zipcode"
                        type="text"
                        placeholder="00000-000"
                        maxLength={8}
                        value={formData.zipcode}
                        onChange={(e) => handleCepChange(e.target.value)}
                        aria-busy={loadingCep}
                      />
                      {loadingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Digite o CEP para preencher automaticamente
                    </p>
                  </div>

                  {/* Grid de endereço */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Rua */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="street">Rua/Logradouro</Label>
                      <Input
                        id="street"
                        placeholder="Nome da rua"
                        value={formData.street}
                        onChange={(e) => handleChange('street', e.target.value)}
                      />
                    </div>

                    {/* Número */}
                    <div className="space-y-2">
                      <Label htmlFor="number">Número</Label>
                      <Input
                        id="number"
                        placeholder="123"
                        value={formData.number}
                        onChange={(e) => handleChange('number', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Grid complemento e bairro */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Complemento */}
                    <div className="space-y-2">
                      <Label htmlFor="complement">Complemento</Label>
                      <Input
                        id="complement"
                        placeholder="Apto, bloco, etc."
                        value={formData.complement}
                        onChange={(e) => handleChange('complement', e.target.value)}
                      />
                    </div>

                    {/* Bairro */}
                    <div className="space-y-2">
                      <Label htmlFor="neighborhood">Bairro</Label>
                      <Input
                        id="neighborhood"
                        placeholder="Nome do bairro"
                        value={formData.neighborhood}
                        onChange={(e) => handleChange('neighborhood', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Grid cidade e estado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cidade */}
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        placeholder="Nome da cidade"
                        value={formData.city}
                        onChange={(e) => handleChange('city', e.target.value)}
                      />
                    </div>

                    {/* Estado */}
                    <div className="space-y-2">
                      <Label htmlFor="state">Estado</Label>
                      <Input
                        id="state"
                        placeholder="UF"
                        maxLength={2}
                        value={formData.state}
                        onChange={(e) => handleChange('state', e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                </div>

                <hr className="border-t" />

                {/* Botões de Ação */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={leave}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading || loadingCep || Boolean(conflict) || ['forbidden', 'unauthenticated'].includes(saveError?.kind)}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </div>
                </fieldset>
              </CardContent>
            </Card>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
