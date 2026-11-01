import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Droplet, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCoordinatedSources } from '@/hooks/useCoordinatedSources';
import { useResourceSnapshot } from '@/hooks/useResourceSnapshot';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import { observeResources } from '@/lib/utils/resourceReads';
import { classifyFailure } from '@/lib/utils/failure';
import { format, parseISO } from 'date-fns';
import { patientWeightHistory, patientGlycemiaHistory } from '@/features/patient-progress/model/patientIndicators';
import { getLatestClinicalWeights, getLatestSelfWeights, getLatestGlycemia } from '@/features/patient-progress/api/indicator-queries';

const formatCivilDate = value => format(parseISO(value), 'dd/MM/yyyy');

export default function PatientMetricsWidget() {
  const { user } = useAuth();
  return user?.id ? <PatientMetricsWidgetContent key={user.id} /> : null;
}

function PatientMetricsWidgetContent() {
  const { user } = useAuth();
  const userId = user.id;
  const scope = JSON.stringify([userId, 'patient.metrics', user.profile?.nutritionist_id, user.profile?.is_active]);
  const readSource = useCoordinatedSources(scope);
  const clinical = useResourceSnapshot(JSON.stringify([userId, scope, 'clinical']), []);
  const self = useResourceSnapshot(JSON.stringify([userId, scope, 'self']), []);
  const glycemia = useResourceSnapshot(JSON.stringify([userId, scope, 'glycemia']), []);
  const { begin: beginClinical, succeed: succeedClinical, fail: failClinical, current: currentClinical, cancel: cancelClinical } = clinical;
  const { begin: beginSelf, succeed: succeedSelf, fail: failSelf, current: currentSelf, cancel: cancelSelf } = self;
  const { begin: beginGlycemia, succeed: succeedGlycemia, fail: failGlycemia, current: currentGlycemia, cancel: cancelGlycemia } = glycemia;
  const reads = useMemo(() => ({
    clinical: { begin: beginClinical, succeed: succeedClinical, fail: failClinical, current: currentClinical, cancel: cancelClinical },
    self: { begin: beginSelf, succeed: succeedSelf, fail: failSelf, current: currentSelf, cancel: cancelSelf },
    glycemia: { begin: beginGlycemia, succeed: succeedGlycemia, fail: failGlycemia, current: currentGlycemia, cancel: cancelGlycemia },
  }), [beginClinical, succeedClinical, failClinical, currentClinical, cancelClinical, beginSelf, succeedSelf, failSelf, currentSelf, cancelSelf, beginGlycemia, succeedGlycemia, failGlycemia, currentGlycemia, cancelGlycemia]);
  const [revision, setRevision] = useState(0);
  const titleId = useId();

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const subscriptions = ['clinical', 'access'].map(domain => subscribeDomain(userId, domain, refresh));
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    let denied = false;
    const tickets = Object.fromEntries(Object.entries(reads).map(([key, read]) => [key, read.begin()]));
    void observeResources({
      clinical: () => readSource('clinical', () => getLatestClinicalWeights(userId)),
      self: () => readSource('self', () => getLatestSelfWeights(userId)),
      glycemia: () => readSource('glycemia', () => getLatestGlycemia(userId)),
    }, (key, result) => {
      const read = reads[key], ticket = tickets[key];
      if (cancelled || denied || !read.current(ticket)) return;
      if (result.error && ['forbidden', 'unauthenticated'].includes(classifyFailure(result.error))) {
        denied = true;
        // A denied context cannot retain another source's snapshot or late response.
        Object.values(reads).forEach(resource => resource.fail(resource.begin(), result.error));
        return;
      }
      if (result.error) read.fail(ticket, result.error);
      else read.succeed(ticket, result.data || []);
    });
    return () => {
      cancelled = true;
      Object.entries(reads).forEach(([key, read]) => read.cancel(tickets[key]));
    };
  }, [scope, userId, revision, reads, readSource]);

  const weights = patientWeightHistory([
    ...(clinical.hasSnapshot ? clinical.data.map(row => ({ ...row, source: 'clinical' })) : []),
    ...(self.hasSnapshot ? self.data.map(row => ({ ...row, source: 'patient' })) : []),
  ]);
  const weight = weights[0], previousWeight = weights[1];
  const glucose = patientGlycemiaHistory(glycemia.hasSnapshot ? glycemia.data : [])[0];
  const weightError = clinical.error || self.error;
  const error = weightError || glycemia.error;
  const pending = clinical.pending || self.pending || glycemia.pending;
  const weightEmpty = weightError ? 'Indisponível' : clinical.hasSnapshot && self.hasSnapshot ? 'Sem registro' : 'Aguardando confirmação';
  const glucoseEmpty = glycemia.error ? 'Indisponível' : glycemia.hasSnapshot ? 'Sem registro' : 'Aguardando confirmação';
  const difference = previousWeight ? weight.weight - previousWeight.weight : null;
  const displayedDifference = difference === null ? null : Number(Math.abs(difference).toFixed(2));
  const direction = difference > 0 ? 'Aumento' : difference < 0 ? 'Redução' : 'Sem variação';
  const glucoseContext = { fasting: 'Em jejum', pre_prandial: 'Antes da refeição', post_prandial: 'Após a refeição', random: 'Medição casual' };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow border-primary/20">
      <Link to="/patient/progresso" aria-labelledby={titleId} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <CardHeader className="pb-3">
          <CardTitle id={titleId} className="text-lg text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5" aria-hidden="true" />Meus Indicadores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3" aria-live="polite">
            <div className="min-w-0 flex flex-col items-center p-3 bg-primary/5 rounded-lg text-center">
              <Scale className="w-6 h-6 text-primary mb-2" aria-hidden="true" />
              {weight ? <>
                <p className="text-2xl font-bold text-foreground"><span>{weight.weight}</span><span className="text-sm font-normal ml-1">kg</span></p>
                <p className="text-xs text-muted-foreground mt-1">{weight.source === 'patient' ? 'Autorregistro' : 'Registro profissional'}</p>
                <p className="text-xs text-muted-foreground">{formatCivilDate(weight.record_date)}</p>
              </> : <p className="text-sm text-muted-foreground">{weightEmpty}</p>}
              {weight && weightError && <p className="text-xs text-muted-foreground mt-1">Histórico parcial</p>}
            </div>
            <div className="min-w-0 flex flex-col items-center p-3 bg-secondary/5 rounded-lg text-center">
              <Droplet className="w-6 h-6 text-secondary mb-2" aria-hidden="true" />
              {glucose ? <>
                <p className="text-2xl font-bold text-foreground"><span>{glucose.value}</span><span className="text-sm font-normal ml-1">mg/dL</span></p>
                <p className="text-xs text-muted-foreground mt-1">{formatCivilDate(glucose.date)}</p>
                <p className="text-xs text-muted-foreground">{glucoseContext[glucose.condition] || 'Contexto não informado'}</p>
              </> : <p className="text-sm text-muted-foreground">{glucoseEmpty}</p>}
            </div>
          </div>
          {previousWeight && <p className="mt-3 text-xs text-muted-foreground">
            {direction}{difference !== 0 ? displayedDifference > 0 ? ' de ' + displayedDifference.toLocaleString('pt-BR') + ' kg' : ' inferior a 0,01 kg' : ''} entre {formatCivilDate(previousWeight.record_date)} e {formatCivilDate(weight.record_date)}.
            {weightError ? ' Comparação parcial.' : ''}
          </p>}
          <p className="mt-4 text-center text-xs text-foreground font-medium">Ver todos os gráficos →</p>
        </CardContent>
      </Link>
      {pending && <p role="status" className="px-6 pb-3 text-xs text-muted-foreground">Atualizando indicadores…</p>}
      {error && <div role="alert" className="px-6 pb-4 space-y-2 text-sm">
        <p>Parte dos indicadores está indisponível. {error.message}</p>
        {error.retryable && <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button>}
      </div>}
    </Card>
  );
}
