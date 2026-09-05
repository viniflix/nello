import React from 'react';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CalendarPlus, HeartPulse, MessageCircle, Pencil, Scale, Target, User, Utensils } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const goalLabels = {
    lose: 'Perda de peso', gain: 'Ganho de peso', maintain: 'Manutenção', muscle: 'Hipertrofia',
    health: 'Saúde e bem-estar', weight_loss: 'Perda de peso', weight_gain: 'Ganho de peso',
};

const formatDate = (value, pattern = 'dd/MM/yyyy') => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, pattern, { locale: ptBR });
};

const getAge = (birthDate) => {
    if (!birthDate) return null;
    const parsed = new Date(`${birthDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return differenceInYears(new Date(), parsed);
};

const getImc = (weight, height) => {
    const numericWeight = Number(weight);
    const numericHeight = Number(height);
    if (!Number.isFinite(numericWeight) || !Number.isFinite(numericHeight) || numericWeight <= 0 || numericHeight <= 0) return null;
    const heightMeters = numericHeight / 100;
    return (numericWeight / (heightMeters * heightMeters)).toFixed(1);
};

const getImcLabel = (imc) => {
    if (imc == null || imc === '') return null;
    const value = Number(imc);
    if (!Number.isFinite(value)) return null;
    if (value < 18.5) return 'Abaixo do peso';
    if (value < 25) return 'Faixa adequada';
    if (value < 30) return 'Sobrepeso';
    return 'Obesidade';
};

const flattenClinicalFlags = (clinicalFlags) => {
    if (!clinicalFlags || typeof clinicalFlags !== 'object') return [];
    const values = ['allergies', 'alergias', 'conditions', 'condicoes', 'alerts', 'alertas'].flatMap((key) => {
        const value = clinicalFlags[key];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string' && value.trim()) return [value];
        return [];
    });
    return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, 3);
};

function Metric({ icon: Icon, label, value, detail }) {
    return (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#d5d2cd] bg-[#efeeec] px-3 py-3 shadow-[inset_0_1px_3px_rgba(39,45,35,0.08)] sm:px-4">
            <Icon className="h-4 w-4 shrink-0 text-[#718065]" />
            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</p>
                <p className="truncate text-[15px] font-semibold leading-5 text-slate-800">{value}</p>
                {detail && <p className="truncate text-[11px] leading-4 text-slate-500">{detail}</p>}
            </div>
        </div>
    );
}

const PatientProfileSummary = ({
    patientData, latestMetrics, operationalContext, onEditProfile, onOpenChat,
    onScheduleAppointment, onOpenMealPlan, profileRequirements = [],
}) => {
    const age = getAge(patientData?.birth_date);
    const imc = getImc(latestMetrics?.weight, latestMetrics?.height);
    const rawGoal = patientData?.goal || latestMetrics?.goal || operationalContext?.activeGoal?.goal_type;
    const goal = operationalContext?.activeGoal?.title || goalLabels[String(rawGoal || '').toLowerCase()] || rawGoal || 'Objetivo não definido';
    const plan = operationalContext?.displayedPlan;
    const planStatusLabel = { draft: 'Rascunho salvo', review: 'Em revisão', active: 'Plano vigente', missing: 'Sem plano', unknown: 'Dados indisponíveis' }[operationalContext?.planStatus] || 'Dados indisponíveis';
    const nextAppointmentAt = operationalContext?.nextAppointment?.start_time || operationalContext?.nextAppointment?.appointment_time;
    const previousWeight = Number(latestMetrics?.previous_weight);
    const currentWeight = Number(latestMetrics?.weight);
    const weightDelta = currentWeight && previousWeight ? currentWeight - previousWeight : null;
    const flags = flattenClinicalFlags(patientData?.clinical_flags);

    return (
        <Card className="relative overflow-hidden rounded-xl border border-[#d8d5d0] bg-white shadow-card">
            <CardContent className="p-0">
                <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
                    <div className="flex min-w-0 items-stretch gap-4 sm:gap-5">
                        <div className="relative flex h-24 w-24 shrink-0 self-center items-center justify-center overflow-hidden rounded-2xl bg-[#65765a] text-xl font-bold text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] sm:h-28 sm:w-28 sm:text-2xl">
                            {patientData?.avatar_url ? <img src={patientData.avatar_url} alt={`Foto de ${patientData.name}`} className="h-full w-full object-cover" /> : <User className="h-11 w-11 text-white/85" />}
                            <Button variant="secondary" size="icon" onClick={onEditProfile} aria-label="Editar perfil" title="Editar perfil" className="absolute right-1.5 top-1.5 h-7 w-7 rounded-full border border-white/80 bg-white/95 text-slate-500 shadow-sm hover:bg-white hover:text-[#526047]"><Pencil className="h-3.5 w-3.5" /></Button>
                            {patientData?.is_active !== false && <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-white bg-emerald-500" />}
                        </div>

                        <div className="flex min-w-0 flex-col justify-center">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h1 className="truncate font-heading text-[22px] font-bold tracking-[0.025em] text-[#263125] sm:text-[28px]">{patientData?.name || 'Paciente'}</h1>
                                <Badge className={patientData?.is_active === false ? 'border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50'}>{patientData?.is_active === false ? 'Inativo' : 'Ativo'}</Badge>
                                {patientData?.patient_invite_code && <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-700">Sem conta</Badge>}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{age !== null ? `${age} anos` : 'Idade não informada'} · {goal}</p>
                            <p className="text-xs leading-5 text-slate-400">{patientData?.created_at ? `Membro desde ${formatDate(patientData.created_at)}` : 'Data de cadastro não informada'}</p>
                            {(flags.length > 0 || patientData?.patient_category) && <div className="mt-2 flex flex-wrap gap-1.5">{flags.map((flag) => <Badge key={flag} variant="outline" className="border-red-200 bg-red-50/60 text-[10px] font-medium text-red-600 sm:text-xs">{flag}</Badge>)}{patientData?.patient_category && <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-600 sm:text-xs">{patientData.patient_category}</Badge>}</div>}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 lg:flex">
                        <Button variant="outline" onClick={onScheduleAppointment} className="h-10 gap-1.5 border-[#d8d5d0] px-2 text-xs sm:px-3 sm:text-sm"><CalendarPlus className="h-4 w-4 shrink-0" /><span className="sm:hidden">Agendar</span><span className="hidden sm:inline">Agendar consulta</span></Button>
                        <Button variant="outline" onClick={onOpenChat} className="h-10 gap-1.5 border-[#d8d5d0] px-2 text-xs sm:px-3 sm:text-sm"><MessageCircle className="h-4 w-4 shrink-0" /><span className="sm:hidden">Chat</span><span className="hidden sm:inline">Abrir chat</span></Button>
                        <Button onClick={onOpenMealPlan} className="h-10 gap-1.5 bg-[#5f6f52] px-2 text-xs font-semibold text-white hover:bg-[#4e5c45] sm:px-3 sm:text-sm"><Utensils className="h-4 w-4 shrink-0" /><span className="sm:hidden">{plan ? 'Ajustar' : 'Iniciar'}</span><span className="hidden sm:inline">{plan ? 'Ajustar plano' : 'Iniciar plano'}</span></Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 px-4 py-4 sm:grid-cols-4 lg:px-5">
                    <Metric icon={Scale} label="Peso atual" value={currentWeight ? `${currentWeight.toLocaleString('pt-BR')} kg` : 'Não informado'} detail={weightDelta !== null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg no período` : null} />
                    <Metric icon={HeartPulse} label="IMC" value={imc || 'Não calculado'} detail={getImcLabel(imc)} />
                    <Metric icon={Utensils} label="Plano" value={plan?.daily_calories != null ? `${Math.round(Number(plan.daily_calories)).toLocaleString('pt-BR')} kcal` : plan ? plan.name : operationalContext?.planStatus === 'missing' ? 'Não iniciado' : '—'} detail={planStatusLabel} />
                    <Metric icon={CalendarDays} label="Próxima consulta" value={nextAppointmentAt ? formatDate(nextAppointmentAt, 'dd MMM · HH:mm') : 'Não agendada'} detail={nextAppointmentAt ? operationalContext?.nextAppointment?.status : null} />
                </div>

                {profileRequirements.length > 0 && <div role="status" className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 lg:mx-5"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0" />Complete os dados essenciais do perfil antes de novos registros clínicos.</div>}
            </CardContent>
        </Card>
    );
};

export default PatientProfileSummary;
