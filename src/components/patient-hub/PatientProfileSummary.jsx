import React from 'react';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User, Mail, Phone, MapPin, Calendar, Weight, Target, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PatientProfileSummary = ({
    patientData,
    latestMetrics,
    onEditProfile,
    onOpenChat,
    onScheduleAppointment
}) => {
    const getPatientAge = (birthDate) => {
        if (!birthDate) return null;
        try {
            const date = new Date(birthDate);
            date.setHours(date.getHours() + 4); // Correção de fuso horário
            return differenceInYears(new Date(), date);
        } catch {
            return null;
        }
    };

    const calculateIMC = (weight, height) => {
        if (!weight || !height || height === 0) return null;
        const heightInMeters = height / 100;
        return (weight / (heightInMeters * heightInMeters)).toFixed(1);
    };

    const getIMCCategory = (imc) => {
        if (!imc) return { label: 'N/A', variant: 'secondary' };
        if (imc < 18.5) return { label: 'Abaixo do peso', variant: 'destructive' };
        if (imc < 25) return { label: 'Peso normal', variant: 'success' };
        if (imc < 30) return { label: 'Sobrepeso', variant: 'warning' };
        return { label: 'Obesidade', variant: 'destructive' };
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Não informado';
        try {
            return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
        } catch {
            return 'Data inválida';
        }
    };

    const formatPhone = (phone) => {
        if (!phone) return 'Não informado';
        // Formato: (XX) XXXXX-XXXX
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 11) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
        }
        return phone;
    };

    const formatAddress = (addressObj) => {
        if (!addressObj) return null;

        // Se for string, retornar direto
        if (typeof addressObj === 'string') return addressObj;

        // Se for objeto JSONB
        const parts = [];
        if (addressObj.street) parts.push(addressObj.street);
        if (addressObj.number) parts.push(addressObj.number);
        if (addressObj.neighborhood) parts.push(addressObj.neighborhood);
        if (addressObj.city) parts.push(addressObj.city);
        if (addressObj.state) parts.push(addressObj.state);
        if (addressObj.zipcode) parts.push(addressObj.zipcode);

        return parts.length > 0 ? parts.join(', ') : null;
    };

    const translateGoal = (goal) => {
        if (!goal) return 'Não definido';

        const goalMap = {
            'lose': 'Perder Peso',
            'gain': 'Ganhar Peso',
            'maintain': 'Manter Peso',
            'muscle': 'Ganhar Massa Muscular',
            'health': 'Saúde e Bem-estar'
        };

        return goalMap[goal.toLowerCase()] || goal;
    };

    const age = getPatientAge(patientData?.birth_date);
    const imc = calculateIMC(latestMetrics?.weight, latestMetrics?.height);
    const imcCategory = getIMCCategory(imc);

    return (
        <Card className="bg-card shadow-lg border-border">
            <CardContent className="p-6">
                {/* Header com Avatar e Info Básica */}
                <div className="flex flex-col md:flex-row gap-6 mb-6">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                        <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center font-bold text-primary overflow-hidden border-4 border-primary/20">
                            {patientData?.avatar_url ? (
                                <img
                                    src={patientData.avatar_url}
                                    alt={patientData.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User className="w-12 h-12 text-primary/70" />
                            )}
                        </div>
                    </div>

                    {/* Informações Básicas */}
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-foreground mb-2">
                            {patientData?.name || 'Paciente'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="w-4 h-4" />
                                <span>{patientData?.email || 'Não informado'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="w-4 h-4" />
                                <span>{formatPhone(patientData?.phone)}</span>
                            </div>
                            {formatAddress(patientData?.address) && (
                                <div className="flex items-center gap-2 text-muted-foreground md:col-span-2">
                                    <MapPin className="w-4 h-4" />
                                    <span className="truncate">{formatAddress(patientData.address)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Botões de Ação - Desktop */}
                    <div className="hidden md:flex flex-row gap-2 items-start">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onEditProfile}
                            className="whitespace-nowrap"
                        >
                            Editar Perfil
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onOpenChat}
                            className="whitespace-nowrap"
                        >
                            Abrir Chat
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={onScheduleAppointment}
                            className="whitespace-nowrap"
                        >
                            Agendar Consulta
                        </Button>
                    </div>
                </div>

                {/* Métricas e Informações */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {/* Idade */}
                    <div className="bg-background-page p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1">
                            <Calendar className="w-4 h-4 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground">Idade</span>
                        </div>
                        <p className="text-xl font-bold text-foreground">
                            {age ? `${age} anos` : 'N/A'}
                        </p>
                    </div>

                    {/* Peso Atual */}
                    <div className="bg-background-page p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1">
                            <Weight className="w-4 h-4 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground">Peso Atual</span>
                        </div>
                        <p className="text-xl font-bold text-foreground">
                            {latestMetrics?.weight ? `${latestMetrics.weight} kg` : 'N/A'}
                        </p>
                    </div>

                    {/* IMC */}
                    <div className="bg-background-page p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-4 h-4 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground">IMC</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-foreground">
                                {imc || 'N/A'}
                            </p>
                            {imc && (
                                <Badge variant={imcCategory.variant} className="text-xs">
                                    {imcCategory.label}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Objetivo */}
                    <div className="bg-background-page p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1">
                            <Target className="w-4 h-4 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground">Objetivo</span>
                        </div>
                        <p className="text-sm font-semibold text-foreground truncate">
                            {translateGoal(patientData?.goal)}
                        </p>
                    </div>
                </div>

                {/* Datas Importantes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-background-page p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Paciente desde</p>
                        <p className="text-sm font-semibold text-foreground">
                            {formatDate(patientData?.created_at)}
                        </p>
                    </div>
                    <div className="bg-background-page p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Última consulta</p>
                        <p className="text-sm font-semibold text-foreground">
                            {latestMetrics?.last_appointment || 'Sem registro'}
                        </p>
                    </div>
                    <div className="bg-background-page p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Próxima consulta</p>
                        <p className="text-sm font-semibold text-foreground">
                            {latestMetrics?.next_appointment || 'Não agendada'}
                        </p>
                    </div>
                </div>

                {/* Botões de Ação - Mobile */}
                <div className="flex md:hidden flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onEditProfile}
                        className="flex-1"
                    >
                        Editar Perfil
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onOpenChat}
                        className="flex-1"
                    >
                        Abrir Chat
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onScheduleAppointment}
                        className="flex-1"
                    >
                        Agendar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default PatientProfileSummary;
