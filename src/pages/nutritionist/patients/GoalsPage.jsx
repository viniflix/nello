import {useGoalsPageController} from './useGoalsPageController';
import {ActiveGoalCard,GoalHistoryItem,getGoalTypeIcon} from './GoalsPage.model';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Target, TrendingDown, TrendingUp, Calendar, AlertCircle, CheckCircle2, Pause, Play, X, Flame, Scale, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/infrastructure/supabase/client';
import {
    createGoal,
    getPatientGoals,
    getActiveGoal,
    updateGoalProgress,
    completeGoal,
    cancelGoal,
    pauseGoal,
    resumeGoal,
    deleteGoal,
    getDaysRemaining,
    getProgressStatus,
    calculateGoalViability,
    calculateMinimumDeadline,
    calculateIdealDeadline
} from '@/lib/supabase/goals-queries';
import { logClinicalImpact } from '@/lib/supabase/clinical-impact-queries';
import { cn } from '@/lib/utils';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { formatDateToIsoDate, getTodayIsoDate } from '@/lib/utils/date';
import { patientHubRoute } from '@/lib/utils/patientRoutes';

const GoalsPage = () => {
const {loading,loadError,loadData,navigate,patientId,paramValue,patientName,activeGoal,showForm,setShowForm,formData,handleInputChange,deadlineRecommendation,loadingViability,viabilityPreview,getViabilityColor,getViabilityLabel,handleCreateGoal,submitting,showImpactConfirm,setShowImpactConfirm,handleConfirmCreateWithImpact,setShowProgressModal,handleCompleteGoal,handlePauseGoal,setShowCancelDialog,pastGoals,showProgressModal,newWeight,setNewWeight,handleUpdateProgress,showCancelDialog,handleCancelGoal}=useGoalsPageController();
return loading ? null : loadError ? (<section role="alert" className="m-4 rounded-lg border p-4"><h1 className="font-semibold">Não foi possível carregar as metas</h1><p>{loadError.message}</p>{loadError.correlationId && <p>Código: {loadError.correlationId}</p>}<Button onClick={loadData}>Tentar novamente</Button></section>) : (
        <div className="flex flex-col min-h-dvh bg-background overflow-x-hidden">
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-4 md:py-8 min-w-0">
                {/* Header */}
                <div className="flex flex-col gap-4 mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(patientHubRoute({ id: patientId, slug: paramValue }, 'adherence'))}
                        className="gap-2 -ml-2 w-fit shrink-0 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                                <Target className="w-6 h-6 md:w-8 md:h-8 text-[#5f6f52]" />
                                <span className="truncate">Metas Nutricionais</span>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                                Paciente: <span className="font-medium text-foreground">{patientName}</span>
                            </p>
                        </div>
                        {!activeGoal && !showForm && (
                            <Button
                                onClick={() => setShowForm(true)}
                                className="gap-2 w-full sm:w-auto"
                            >
                                <Target className="w-4 h-4" />
                                Nova Meta
                            </Button>
                        )}
                    </div>
                </div>

                {/* Formulário de Nova Meta */}
                {showForm && (
                    <Card className="mb-6 shadow-md">
                        <CardHeader className="bg-[#fefae0]/50 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-[#5f6f52] flex items-center justify-center">
                                            <Target className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">Criar Nova Meta</CardTitle>
                                            <CardDescription className="text-sm">Defina uma meta nutricional realista e sustentável</CardDescription>
                                        </div>
                                    </div>
                                </div>
                                {!activeGoal && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowForm(false)}
                                        className="hover:bg-red-50 hover:text-red-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6 pt-6">
                            {/* SEÇÃO: Informações Básicas */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                    <Target className="w-4 h-4 text-[#5f6f52]" />
                                    <h3 className="font-semibold text-[#5f6f52]">Informações Básicas</h3>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="goal_type" className="text-sm font-medium">Tipo de Meta</Label>
                                    <Select
                                        value={formData.goal_type}
                                        onValueChange={(value) => handleInputChange('goal_type', value)}
                                    >
                                        <SelectTrigger id="goal_type" className="h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="weight_loss">Perda de Peso</SelectItem>
                                            <SelectItem value="weight_gain">Ganho de Peso</SelectItem>
                                            <SelectItem value="weight_maintenance">Manutenção de Peso</SelectItem>
                                            <SelectItem value="body_composition">Composição Corporal</SelectItem>
                                            <SelectItem value="custom">Personalizada</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="initial_weight" className="text-sm font-medium flex items-center gap-1.5">
                                            <Scale className="w-3.5 h-3.5 text-[#5f6f52]" />
                                            Peso Inicial (kg)
                                        </Label>
                                        <Input
                                            id="initial_weight"
                                            type="number"
                                            step="0.1"
                                            value={formData.initial_weight}
                                            onChange={(e) => handleInputChange('initial_weight', e.target.value)}
                                            placeholder="70.0"
                                            className="h-11 font-semibold bg-[#fefae0]/20"
                                        />
                                        <p className="text-xs text-muted-foreground">Peso atual do paciente</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="target_weight" className="text-sm font-medium flex items-center gap-1.5">
                                            <Target className="w-3.5 h-3.5 text-[#c4661f]" />
                                            Peso Meta (kg)
                                        </Label>
                                        <Input
                                            id="target_weight"
                                            type="number"
                                            step="0.1"
                                            value={formData.target_weight}
                                            onChange={(e) => handleInputChange('target_weight', e.target.value)}
                                            placeholder="65.0"
                                            className="h-11 font-semibold bg-[#fefae0]/20"
                                        />
                                        <p className="text-xs text-muted-foreground">Peso que deseja atingir</p>
                                    </div>
                                </div>
                            </div>

                            {/* SEÇÃO: Recomendação de Prazo */}
                            {deadlineRecommendation && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                        <Calendar className="w-4 h-4 text-[#5f6f52]" />
                                        <h3 className="font-semibold text-[#5f6f52]">Recomendação de Prazo</h3>
                                    </div>

                                    <div className="bg-[#fefae0]/30 border border-[#a9b388]/40 rounded-lg p-4">
                                        <div className="text-sm text-foreground mb-3">
                                            Para {formData.goal_type === 'weight_loss' ? 'perder' : 'ganhar'} <strong>{deadlineRecommendation.weightChange.toFixed(1)}kg</strong> de forma saudável:
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="bg-white p-3 rounded border border-[#c4661f]/30 hover:border-[#c4661f]/60 transition-colors">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Flame className="w-4 h-4 text-[#c4661f]" />
                                                    <div className="text-xs font-semibold text-[#c4661f] uppercase">Prazo Mínimo</div>
                                                </div>
                                                <div className="text-xl font-bold text-foreground mb-1">
                                                    {deadlineRecommendation.minDays} dias
                                                </div>
                                                <div className="text-xs text-muted-foreground mb-2">
                                                    até {new Date(deadlineRecommendation.minDate).toLocaleDateString('pt-BR')}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-xs h-8"
                                                    onClick={() => handleInputChange('target_date', deadlineRecommendation.minDate)}
                                                >
                                                    Usar este prazo
                                                </Button>
                                                <p className="text-xs text-muted-foreground mt-1.5">Agressivo</p>
                                            </div>
                                            <div className="bg-[#5f6f52]/5 p-3 rounded border border-[#5f6f52]/40 hover:border-[#5f6f52] transition-colors">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <CheckCircle2 className="w-4 h-4 text-[#5f6f52]" />
                                                    <div className="text-xs font-semibold text-[#5f6f52] uppercase">Prazo Ideal</div>
                                                </div>
                                                <div className="text-xl font-bold text-foreground mb-1">
                                                    {deadlineRecommendation.idealDays} dias
                                                </div>
                                                <div className="text-xs text-muted-foreground mb-2">
                                                    até {new Date(deadlineRecommendation.idealDate).toLocaleDateString('pt-BR')}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    className="w-full bg-[#5f6f52] hover:bg-[#5f6f52]/90 text-white text-xs h-8"
                                                    onClick={() => handleInputChange('target_date', deadlineRecommendation.idealDate)}
                                                >
                                                    Usar este prazo (Recomendado)
                                                </Button>
                                                <p className="text-xs text-muted-foreground mt-1.5">Sustentável</p>
                                            </div>
                                        </div>
                                        <div className="bg-[#5f6f52]/10 rounded p-2.5 mt-3">
                                            <p className="text-xs text-foreground/80">
                                                <strong>💡 Dica:</strong> O prazo ideal considera um déficit moderado e seguro para resultados sustentáveis.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SEÇÃO: Cronograma */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                    <Calendar className="w-4 h-4 text-[#5f6f52]" />
                                    <h3 className="font-semibold text-[#5f6f52]">Cronograma</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="start_date" className="text-sm font-medium">Data de Início</Label>
                                        <DateInputWithCalendar
                                            id="start_date"
                                            value={formData.start_date}
                                            onChange={(value) => handleInputChange('start_date', value)}
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="target_date" className="text-sm font-medium">Data Meta</Label>
                                        <DateInputWithCalendar
                                            id="target_date"
                                            value={formData.target_date}
                                            onChange={(value) => handleInputChange('target_date', value)}
                                            min={formData.start_date}
                                            className="h-10"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SEÇÃO: Detalhes Adicionais */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                    <Activity className="w-4 h-4 text-[#5f6f52]" />
                                    <h3 className="font-semibold text-[#5f6f52]">Observações</h3>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-sm font-medium">Observações (Opcional)</Label>
                                    <Textarea
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        placeholder="Ex: Restrições alimentares, preferências de exercícios..."
                                        rows={3}
                                        className="resize-none"
                                    />
                                </div>
                            </div>

                            {/* SEÇÃO: Análise de Viabilidade */}
                            {(loadingViability || viabilityPreview) && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                        <Activity className="w-4 h-4 text-[#5f6f52]" />
                                        <h3 className="font-semibold text-[#5f6f52]">Análise de Viabilidade</h3>
                                    </div>

                                    {loadingViability && (
                                        <div className="text-center py-6 bg-[#fefae0]/30 rounded-lg border border-[#a9b388]/40">
                                            <Activity className="w-6 h-6 animate-spin text-[#5f6f52] mx-auto mb-2" />
                                            <p className="text-sm text-muted-foreground">Calculando viabilidade da meta...</p>
                                        </div>
                                    )}

                                    {viabilityPreview && !loadingViability && (
                                        <Alert className={cn(
                                            "shadow-sm",
                                            getViabilityColor(viabilityPreview.viability_score)
                                        )}>
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertDescription>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-semibold">
                                                            {getViabilityLabel(viabilityPreview.viability_score)}
                                                        </div>
                                                        <Badge variant="outline" className="text-xs">
                                                            {viabilityPreview.viability_score}/5
                                                        </Badge>
                                                    </div>

                                                    {viabilityPreview.warnings && viabilityPreview.warnings.length > 0 && (
                                                        <div className="space-y-1 mt-2">
                                                            {viabilityPreview.warnings.map((warning, index) => (
                                                                <div key={index} className="flex items-start gap-1.5 text-sm">
                                                                    <span>•</span>
                                                                    <span>{warning.message}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {viabilityPreview.viability_notes && (
                                                        <div className="text-xs whitespace-pre-line mt-2 pt-2 border-t opacity-80">
                                                            {viabilityPreview.viability_notes}
                                                        </div>
                                                    )}
                                                </div>
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}

                            {/* Botões de Ação */}
                            <div className="flex gap-2 justify-end pt-4 border-t">
                                {!activeGoal && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowForm(false)}
                                    >
                                        Cancelar
                                    </Button>
                                )}
                                <Button
                                    onClick={handleCreateGoal}
                                    disabled={submitting || !viabilityPreview}
                                    className="bg-[#5f6f52] hover:bg-[#5f6f52]/90 text-white"
                                >
                                    <>
                                        <Target className="w-4 h-4 mr-2" />
                                        Criar Meta
                                    </>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Modal: Confirmação de impacto antes de criar */}
                <Dialog open={showImpactConfirm} onOpenChange={setShowImpactConfirm}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Target className="w-5 h-5 text-[#5f6f52]" />
                                Simulação de Impacto
                            </DialogTitle>
                            <DialogDescription>
                                Revise o impacto estimado antes de confirmar a criação da meta.
                            </DialogDescription>
                        </DialogHeader>
                        {viabilityPreview && (
                            <div className="space-y-3 py-2">
                                <div className="rounded-lg border border-[#a9b388]/40 bg-[#fefae0]/20 p-3">
                                    <p className="text-xs font-semibold text-[#5f6f52] uppercase tracking-wide mb-2">Impacto estimado</p>
                                    <ul className="text-sm space-y-1">
                                        <li>Déficit/superávit necessário: <strong>{viabilityPreview.required_daily_deficit ?? '--'} kcal/dia</strong></li>
                                        {viabilityPreview.daily_calorie_goal != null && (
                                            <li>Meta calórica sugerida: <strong>{Math.round(viabilityPreview.daily_calorie_goal)} kcal/dia</strong></li>
                                        )}
                                        <li>Viabilidade: <strong>{viabilityPreview.viability_score}/5</strong> — {getViabilityLabel(viabilityPreview.viability_score)}</li>
                                    </ul>
                                </div>
                                <div className="rounded border border-muted bg-muted/30 p-2">
                                    <p className="text-xs text-muted-foreground">
                                        Faixa de incerteza: ±{(viabilityPreview.viability_score >= 4 ? '10' : viabilityPreview.viability_score >= 3 ? '20' : '30')}% no déficit diário, dependendo da adesão e metabolismo.
                                    </p>
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowImpactConfirm(false)} disabled={submitting}>
                                Cancelar
                            </Button>
                            <Button onClick={handleConfirmCreateWithImpact} disabled={submitting} className="bg-[#5f6f52] hover:bg-[#5f6f52]/90">
                                {submitting ? (
                                    <>
                                        <Activity className="w-4 h-4 mr-2 animate-spin" />
                                        Criando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Confirmar e criar
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Meta Ativa */}
                {activeGoal && !showForm && (
                    <ActiveGoalCard
                        goal={activeGoal}
                        onUpdateProgress={() => setShowProgressModal(true)}
                        onComplete={handleCompleteGoal}
                        onPause={handlePauseGoal}
                        onCancel={() => setShowCancelDialog(true)}
                    />
                )}

                {/* Histórico de Metas */}
                {pastGoals && pastGoals.length > 0 && (
                    <Card className="mt-6 shadow-md">
                        <CardHeader className="bg-[#fefae0]/30 border-b">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#5f6f52]" />
                                <div>
                                    <CardTitle>Histórico de Metas</CardTitle>
                                    <CardDescription className="text-sm">Metas anteriores do paciente</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="space-y-2">
                                {pastGoals.map(goal => (
                                    <GoalHistoryItem key={goal.id} goal={goal} />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Modal de Atualização de Progresso */}
                <Dialog open={showProgressModal} onOpenChange={setShowProgressModal}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader className="pb-3 border-b">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-lg bg-[#5f6f52] flex items-center justify-center">
                                    <Scale className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <DialogTitle>Atualizar Progresso</DialogTitle>
                                    <DialogDescription className="text-sm">
                                        Registre o peso atual do paciente
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {activeGoal && (
                                <div className="bg-[#fefae0]/40 p-3 rounded-lg border border-[#a9b388]/40">
                                    <div className="flex items-center justify-between text-sm mb-1.5">
                                        <span className="text-muted-foreground">Peso anterior:</span>
                                        <span className="font-bold text-[#5f6f52]">{activeGoal.current_weight?.toFixed(1)} kg</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Meta:</span>
                                        <span className="font-semibold text-[#c4661f]">{activeGoal.target_weight?.toFixed(1)} kg</span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="new_weight" className="text-sm font-medium flex items-center gap-1.5">
                                    <Scale className="w-3.5 h-3.5 text-[#5f6f52]" />
                                    Novo Peso (kg)
                                </Label>
                                <Input
                                    id="new_weight"
                                    type="number"
                                    step="0.1"
                                    value={newWeight}
                                    onChange={(e) => setNewWeight(e.target.value)}
                                    placeholder="Ex: 68.5"
                                    className="h-12 text-lg font-semibold text-center"
                                    autoFocus
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    Digite o peso medido hoje
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowProgressModal(false);
                                    setNewWeight('');
                                }}
                                disabled={submitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleUpdateProgress}
                                disabled={submitting || !newWeight}
                                className="bg-[#5f6f52] hover:bg-[#5f6f52]/90 text-white"
                            >
                                {submitting ? (
                                    <>
                                        <Activity className="w-4 h-4 mr-2 animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Salvar
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Modal de Cancelamento */}
                <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Cancelar meta?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja cancelar esta meta? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Não, manter meta</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleCancelGoal}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                Sim, cancelar meta
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};

// =============================================
// COMPONENTE: ActiveGoalCard
// =============================================



// =============================================
// COMPONENTE: GoalHistoryItem
// =============================================



// Funções auxiliares movidas para fora do componente


export default GoalsPage;
