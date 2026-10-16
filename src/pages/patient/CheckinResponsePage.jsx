import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCheckins } from '@/hooks/useCheckins';
import { supabase } from '@/infrastructure/supabase/client';
import { Button } from '@/components/ui/button';
import { PrivateImage } from '@/components/ui/private-image';
import { ArrowLeft, CheckCircle2, ChevronRight, ChevronLeft, Loader2, Upload, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { FormSkeleton } from '@/components/ui/custom-skeletons';
import { isUuid } from '@/lib/utils/patientRoutes';
import { findMissingRequiredField, isFormValuePresent } from '@/lib/validations/formContracts';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useShadowDraft } from '@/hooks/useShadowDraft';
import { ShadowRecovery, ShadowSaveStatus } from '@/components/ui/shadow-save-status';
import { checkinState } from '@/domain/clinical/checkins';
import { failurePresentation } from '@/lib/utils/failure';

const CHECKIN_NOT_FOUND_MESSAGE = 'Check-in não encontrado.';
const CHECKIN_LOAD_ERROR_MESSAGE = 'Não foi possível carregar este check-in.';
const CHECKIN_EXPIRED_MESSAGE = 'Este check-in expirou. Solicite um novo envio ao seu nutricionista.';

const CheckinResponsePage = () => {
  const {sessionId} = useParams();
  const {user} = useAuth();
  return <CheckinResponseContent key={`${user?.id || 'signed-out'}:${sessionId}`} />;
};

const CheckinResponseContent = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { submitCheckin } = useCheckins();
  const shadow = useShadowDraft({ ownerId: user?.id, draftKey: `checkin-response:${sessionId}`, enabled: Boolean(user?.id && isUuid(sessionId)) });
  const touchedRef = useRef(false);
  const submittingRef = useRef(false);

  const [session, setSession] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const restoreShadow = () => {
    const candidate = shadow.recovery?.payload;
    if (!candidate?.responses || !session || checkinState(session) !== 'pending' || candidate.expiresAt !== session.expires_at) {
      void shadow.discardRecovery();
      return;
    }
    const saved = shadow.restore();
    if (!saved?.responses) return;
    const allowed = new Set(fields.filter(field=>saved.responseVersion === 2 || field.field_type !== 'scale_1_10').map(field=>field.id));
    setResponses((current) => ({ ...current, ...Object.fromEntries(Object.entries(saved.responses).filter(([id]) => allowed.has(id))) }));
    if (saved.responseVersion !== 2 && fields.some(field=>field.field_type==='scale_1_10')) toast({title:'Confira as escalas',description:'Confirme novamente os valores das escalas deste rascunho anterior.'});
    touchedRef.current = true;
  };

  useEffect(() => {
    let cancelled = false;
    const fetchSessionData = async () => {
      setLoading(true);
      setError(null);
      setIsCompleted(false);

      if (!isUuid(sessionId) || !user?.id) {
        setError(CHECKIN_NOT_FOUND_MESSAGE);
        setLoading(false);
        return;
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('checkin_sessions')
          .select("id,schedule_id,patient_id,nutritionist_id,template_id,token,responses,score_total,score_max,adherence_percentage,score_version,status,sent_at,completed_at,expires_at,created_at,care_episode_id,scheduled_for,fields_snapshot,\n            checkin_templates (\n              name,\n              description\n            )\n          ")
          .eq('id', sessionId)
          .single();

        if (cancelled) return;
        if (sessionError) throw sessionError;
        if (!sessionData) throw new Error('Check-in não encontrado.');

        setSession(sessionData);
        const state = checkinState(sessionData);
        if (state === 'completed') {
          setIsCompleted(true);
          setLoading(false);
          return;
        }

        if (state === 'expired') {
          setError(CHECKIN_EXPIRED_MESSAGE);
          return;
        }
        if (state !== 'pending') throw new Error('CHECKIN_UNAVAILABLE');

        let fieldsData = Array.isArray(sessionData.fields_snapshot) ? sessionData.fields_snapshot : [];
        if (!fieldsData.length) {
          const { data, error: fieldsError } = await supabase
            .from('checkin_fields')
            .select("id,template_id,label,field_type,options,score_weight,scoring_rule,unit,is_required,order_index,created_at")
            .eq('template_id', sessionData.template_id)
            .order('order_index', { ascending: true });
          if (fieldsError) throw fieldsError;
          if (cancelled) return;
          fieldsData = data || [];
        }

        if (!fieldsData?.length) {
          setError('Este check-in ainda não possui perguntas disponíveis.');
          return;
        }

        setSession(sessionData);
        setFields((fieldsData || []).map(field=>({...field,is_required:field.is_required!==false})));

        const initialResp = {};
        fieldsData?.forEach(f => {
           initialResp[f.id] = '';
        });
        setResponses(initialResp);

      } catch (err) {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          logDiagnostic('error', 'pages/patient/CheckinResponsePage.jsx:117', 'Falha ao carregar check-in:', err?.code || err?.name || 'unknown');
        }
        setError(CHECKIN_LOAD_ERROR_MESSAGE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSessionData();
    return () => {cancelled = true;};
  }, [sessionId, user?.id, loadAttempt]);

  useEffect(() => {
    if (!session || isCompleted || checkinState(session) !== 'pending' || !session.expires_at) return;
    let timer;
    const verifyDeadline = () => {
      if (checkinState(session) === 'expired') {setError(CHECKIN_EXPIRED_MESSAGE);return;}
      timer = setTimeout(verifyDeadline, Math.min(2147483647, Math.max(1, new Date(session.expires_at).getTime()-Date.now())));
    };
    const onFocus = () => {clearTimeout(timer);verifyDeadline();};
    verifyDeadline();window.addEventListener('focus', onFocus);
    return () => {clearTimeout(timer);window.removeEventListener('focus', onFocus);};
  }, [session, isCompleted]);

  useEffect(() => {
    if (shadow.ready && (isCompleted || error?.includes('expirou'))) {
      void shadow.discard();
    }
  }, [shadow.ready, shadow.discard, isCompleted, error]);

  const handleNext = () => {
    if (checkinState(session) !== 'pending') {setError(CHECKIN_EXPIRED_MESSAGE);return;}
    const field = fields[currentStep];
    if (field?.is_required && !isFormValuePresent(responses[field.id])) {
      toast({ title: 'Resposta obrigatória', description: `Responda “${field.label}” para continuar.`, variant: 'destructive' });
      return;
    }
    if (currentStep < fields.length - 1) setCurrentStep(s => s + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  const handleResponseChange = (fieldId, value) => {
    touchedRef.current = true;
    const next = { ...responses, [fieldId]: value };
    setResponses(next);
    if (session) shadow.queue({ responses: next, expiresAt: session.expires_at, responseVersion: 2 });
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (checkinState(session) !== 'pending') {setError(CHECKIN_EXPIRED_MESSAGE);return;}
    const missing = findMissingRequiredField(fields, responses);
    if (missing) {
      const missingIndex = fields.findIndex((field) => field.id === missing.id);
      setCurrentStep(Math.max(0, missingIndex));
      toast({ title: 'Resposta obrigatória', description: `Responda “${missing.label}” antes de concluir.`, variant: 'destructive' });
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitCheckin.mutateAsync({
        sessionId,
        responses
      });
      setError(null);
      setSession(current=>({...current,status:'completed'}));
      setIsCompleted(true);
      await shadow.discard();
    } catch (caught) {
      if (String(caught?.message).includes('CHECKIN_EXPIRED')) setError(CHECKIN_EXPIRED_MESSAGE);
      else if (String(caught?.message).includes('CHECKIN_ALREADY_COMPLETED')) setLoadAttempt(value=>value+1);
      else if (['unauthenticated','forbidden'].includes(failurePresentation(caught).kind)) {
        setSession(null);setResponses({});setFields([]);setError('Este check-in não está disponível para esta conta.');
      }
      // Unconfirmed sends retain the answers and draft for a manual retry.
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto p-6"><FormSkeleton /></div>;
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-background p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">{error === CHECKIN_EXPIRED_MESSAGE ? 'Check-in expirado' : 'Não foi possível abrir o check-in'}</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">{error}</p>
        {error === CHECKIN_LOAD_ERROR_MESSAGE && <Button variant="outline" className="mb-3" onClick={()=>setLoadAttempt(value=>value+1)}>Tentar novamente</Button>}
        <Button onClick={() => navigate('/patient')}>Voltar ao início</Button>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-500">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h1 className="patient-page-title mb-3">Check-in Concluído! 🎉</h1>
        <p className="text-muted-foreground max-w-md mb-8 text-lg">
          Suas respostas foram enviadas para seu nutricionista com sucesso. O acompanhamento contínuo é chave para os resultados!
        </p>
        <Button size="lg" onClick={() => navigate('/patient')} className="w-full sm:w-auto px-8 font-semibold shadow-md">
          Voltar para o Painel
        </Button>
      </div>
    );
  }

  const currentField = fields[currentStep];
  const progress = ((currentStep + 1) / fields.length) * 100;
  const branding = session?.checkin_templates?.nutritionist_branding?.[0];
  const brandColor = branding?.primary_color || 'hsl(var(--primary))';
  let brandingLogo = branding?.logo_url;
  try {
    const legacyLogo = new URL(brandingLogo);
    if (legacyLogo.origin === new URL(supabase.supabaseUrl).origin
      && legacyLogo.pathname.startsWith('/storage/v1/object/public/IDV/')) brandingLogo = '/nello-logo.png';
  } catch { /* Relative static assets and private references resolve in PrivateImage. */ }

  const currentVal = responses[currentField?.id];
  const isScale = currentField?.field_type === 'scale_1_10';
  const scaleVal = isScale ? (Array.isArray(currentVal) ? currentVal[0] : parseInt(currentVal) || 5) : 0;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background lg:p-8">
      <div className="flex min-h-dvh w-full flex-col overflow-hidden border-border bg-card lg:min-h-[600px] lg:max-w-2xl lg:rounded-2xl lg:border lg:shadow-card">
        {/* Header */}
        <div
          className="p-6 text-primary-foreground relative overflow-hidden"
          style={{ backgroundColor: brandColor }}
        >
          <div className="absolute inset-0 bg-black/10 mix-blend-multiply" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" size="icon" aria-label="Voltar ao início" className="text-white hover:bg-white/20" onClick={() => navigate('/patient')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {branding?.logo_url ? (
                <PrivateImage src={brandingLogo} alt="Logo" className="h-10 object-contain drop-shadow-md bg-white rounded-md p-1" />
              ) : (
                <span className="font-bold text-lg">{session?.checkin_templates?.name}</span>
              )}
              <div className="w-10" />
            </div>

            <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-white transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm font-semibold text-center mt-3 opacity-90">
              Pergunta {currentStep + 1} de {fields.length}
            </p>
          </div>
        </div>

        {/* Question Area */}
        <div className="px-6 pt-4 sm:px-10 space-y-2">
          <ShadowRecovery recovery={shadow.recovery} onRestore={restoreShadow} onDiscard={() => { void shadow.discardRecovery(); }} />
          {(touchedRef.current || shadow.recovery) && <ShadowSaveStatus status={shadow.status} onRetry={shadow.flush} />}
        </div>
        <div className="flex-1 p-6 sm:p-10 flex flex-col justify-center animate-in slide-in-from-right-8 duration-300 relative">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-foreground mb-10 leading-snug">
            {currentField?.label}
          </h2>

          <div className="w-full max-w-md mx-auto">
            {isScale && (
              <div className="space-y-10">
                <p className="text-center font-black text-6xl" style={{ color: brandColor }}>
                  {scaleVal}
                </p>
                <Slider
                  key={currentField.id}
                  min={1}
                  max={10}
                  aria-label={currentField.label}
                  step={1}
                  value={[scaleVal]}
                  onValueChange={(val) => handleResponseChange(currentField.id, val)}
                  className="py-4 cursor-pointer"
                />
                {!isFormValuePresent(currentVal) && <div className="space-y-2 text-center"><p className="text-sm text-muted-foreground">Mova a escala ou confirme o valor para responder.</p><Button variant="outline" onClick={()=>handleResponseChange(currentField.id,[scaleVal])}>Confirmar valor {scaleVal}</Button></div>}
                <div className="flex justify-between text-xs sm:text-sm font-bold text-muted-foreground uppercase px-2 tracking-wider">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>
            )}

            {currentField?.field_type === 'yes_no' && (
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={currentVal === 'yes' ? 'default' : 'outline'}
                  className={`h-20 text-xl font-bold rounded-xl transition-all ${currentVal === 'yes' ? 'ring-2 ring-offset-2' : ''}`}
                  onClick={() => handleResponseChange(currentField.id, 'yes')}
                  style={currentVal === 'yes' ? { backgroundColor: brandColor } : {}}
                >
                  Sim
                </Button>
                <Button
                  type="button"
                  variant={currentVal === 'no' ? 'default' : 'outline'}
                  className={`h-20 text-xl font-bold rounded-xl transition-all ${currentVal === 'no' ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                  onClick={() => handleResponseChange(currentField.id, 'no')}
                >
                  Não
                </Button>
              </div>
            )}

            {currentField?.field_type === 'multiple_choice' && (
              <div className="flex flex-col gap-3">
                {currentField.options?.map(opt => (
                  <Button
                    key={opt}
                    type="button"
                    variant={currentVal === opt ? 'default' : 'outline'}
                    className={`min-h-[60px] h-auto py-3 justify-start px-6 text-base font-medium whitespace-normal text-left rounded-xl transition-all shadow-sm ${currentVal === opt ? 'ring-2 ring-offset-2 text-white' : ''}`}
                    onClick={() => handleResponseChange(currentField.id, opt)}
                    style={currentVal === opt ? { backgroundColor: brandColor, borderColor: brandColor } : {}}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            )}

            {currentField?.field_type === 'text' && (
              <Textarea
                value={currentVal || ''}
                onChange={(e) => handleResponseChange(currentField.id, e.target.value)}
                placeholder="Escreva sua resposta (opcional)..."
                className="min-h-[160px] text-base p-4 rounded-xl border-2 focus-visible:ring-1"
                style={{ '--tw-ring-color': brandColor }}
              />
            )}

            {currentField?.field_type === 'number' && (
              <div className="relative max-w-xs mx-auto">
                <Input
                  type="number"
                  value={currentVal ?? ''}
                  onChange={(e) => handleResponseChange(currentField.id, e.target.value)}
                  className="h-20 text-3xl text-center font-bold pr-16 rounded-xl border-2 shadow-inner"
                  style={{ '--tw-ring-color': brandColor }}
                />
                {currentField.unit && (
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-lg">
                    {currentField.unit}
                  </span>
                )}
              </div>
            )}

            {currentField?.field_type === 'photo' && (
              <div className="border-3 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors bg-muted/20">
                <div className="p-4 bg-background rounded-full mb-4 shadow-sm" style={{ color: brandColor }}>
                  <Upload className="w-8 h-8" />
                </div>
                <p className="font-bold text-foreground">Enviar nova foto</p>
                <p className="text-sm text-muted-foreground mt-2">Permita o acesso à câmera (Em breve)</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="p-4 sm:p-6 border-t bg-card flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-10">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0 || isSubmitting}
            className="font-medium"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          {currentStep < fields.length - 1 ? (
            <Button onClick={handleNext} className="h-12 rounded-xl px-6 font-bold shadow-md" style={{ backgroundColor: brandColor }}>
              Próxima Parte
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || (currentField?.is_required && !isFormValuePresent(responses[currentField.id]))}
              className="h-12 rounded-xl px-8 text-base font-bold text-white shadow-md transition-all active:scale-95"
              style={{ backgroundColor: brandColor }}
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 text-white animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2 text-white" />}
              {isSubmitting ? 'Processando...' : 'Finalizar Check-in'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckinResponsePage;
