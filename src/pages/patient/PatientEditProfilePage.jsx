import { useState, useEffect } from 'react';
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
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

/**
 * PatientEditProfilePage - Página de edição completa do perfil do paciente
 */
export default function PatientEditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    birth_date: '',
    gender: '',
    height: '',
    weight: '',
    zipcode: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });

  useEffect(() => {
    if (user?.profile) {
      const address = user.profile.address || {};
      setFormData({
        name: user.profile.name || '',
        phone: user.profile.phone || '',
        birth_date: user.profile.birth_date || '',
        gender: user.profile.gender || '',
        height: user.profile.height || '',
        weight: user.profile.weight || '',
        zipcode: address.zipcode || '',
        street: address.street || '',
        number: address.number || '',
        complement: address.complement || '',
        neighborhood: address.neighborhood || '',
        city: address.city || '',
        state: address.state || ''
      });
    }
  }, [user]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCepChange = async (cep) => {
    // Remove caracteres não numéricos
    const cleanCep = cep.replace(/\D/g, '');
    handleChange('zipcode', cleanCep);

    // Busca CEP apenas se tiver 8 dígitos
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();

        if (data.erro) {
          toast({
            title: 'CEP não encontrado',
            description: 'Verifique o CEP digitado.',
            variant: 'destructive'
          });
          return;
        }

        // Preencher campos automaticamente
        setFormData(prev => ({
          ...prev,
          street: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.uf || ''
        }));

        toast({
          title: 'CEP encontrado!',
          description: 'Endereço preenchido automaticamente.'
        });
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível buscar o CEP.',
          variant: 'destructive'
        });
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validações básicas
    if (!formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

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

      const { error } = await supabase
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
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Sucesso!',
        description: 'Suas informações foram atualizadas.'
      });

      // Navegar de volta e recarregar para atualizar dados
      navigate('/patient/perfil');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar suas informações.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-3xl mx-auto w-full px-4 md:px-8 py-8">
        {/* Header com botão voltar */}
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/patient/perfil')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Editar Perfil</h1>
            <p className="text-muted-foreground mt-1">
              Atualize suas informações pessoais
            </p>
          </div>
        </div>

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
                        disabled={loadingCep}
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
                    onClick={() => navigate('/patient/perfil')}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading}
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
              </CardContent>
            </Card>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
