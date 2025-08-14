import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Leaf, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    type: '',
    crn: '',
    birth_date: '',
    gender: '',
    height: '',
    weight: '',
    goal: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Erro no cadastro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const profileData = {
      name: formData.name,
      user_type: formData.type,
      crn: formData.type === 'nutritionist' ? formData.crn : null,
      birth_date: formData.type === 'patient' ? formData.birth_date : null,
      gender: formData.type === 'patient' ? formData.gender : null,
      height: formData.type === 'patient' ? parseInt(formData.height) || null : null,
      weight: formData.type === 'patient' ? parseFloat(formData.weight) || null : null,
      goal: formData.type === 'patient' ? formData.goal : null,
    };

    const { error } = await signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: profileData,
        emailRedirectTo: window.location.origin,
      }
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Erro no cadastro",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Cadastro realizado com sucesso!",
        description: "Enviamos um link de confirmação para o seu e-mail.",
      });
      navigate('/login');
    }
  };

  return (
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
                Crie sua conta para começar
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome completo"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                  className="transition-all duration-200 focus:scale-[1.02]"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                  className="transition-all duration-200 focus:scale-[1.02]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo de usuário</Label>
                <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nutritionist">Nutricionista</SelectItem>
                    <SelectItem value="patient">Paciente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.type === 'nutritionist' && (
                <div className="space-y-2">
                  <Label htmlFor="crn">CRN</Label>
                  <Input
                    id="crn"
                    type="text"
                    placeholder="CRN-3 12345"
                    value={formData.crn}
                    onChange={(e) => handleInputChange('crn', e.target.value)}
                    required
                    className="transition-all duration-200 focus:scale-[1.02]"
                  />
                </div>
              )}

              {formData.type === 'patient' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="birthDate">Data de nascimento</Label>
                      <Input
                        id="birthDate"
                        type="date"
                        value={formData.birth_date}
                        onChange={(e) => handleInputChange('birth_date', e.target.value)}
                        required
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexo</Label>
                      <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sexo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Masculino</SelectItem>
                          <SelectItem value="female">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="height">Altura (cm)</Label>
                      <Input
                        id="height"
                        type="number"
                        placeholder="175"
                        value={formData.height}
                        onChange={(e) => handleInputChange('height', e.target.value)}
                        required
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weight">Peso (kg)</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        placeholder="70.5"
                        value={formData.weight}
                        onChange={(e) => handleInputChange('weight', e.target.value)}
                        required
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal">Objetivo</Label>
                    <Select value={formData.goal} onValueChange={(value) => handleInputChange('goal', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione seu objetivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lose">Perder peso</SelectItem>
                        <SelectItem value="maintain">Manter peso</SelectItem>
                        <SelectItem value="gain">Ganhar peso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    required
                    className="pr-10 transition-all duration-200 focus:scale-[1.02]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium py-2 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
                disabled={loading || !formData.type}
              >
                {loading ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Já tem uma conta?{' '}
                <Link
                  to="/login"
                  className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                >
                  Entrar
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}