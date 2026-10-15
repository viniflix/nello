import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { getMyCareRelationship } from '@/lib/supabase/patient-queries';
import { getActiveMealPlan } from '@/lib/supabase/meal-plan-queries';
import { getPatientHomeLink, getPatientHomeAppointment, getPatientHomeMeals } from '@/lib/supabase/patient-home-queries';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import { failurePresentation } from '@/lib/utils/failure';

// Guards even helpers whose nested transports do not yet accept AbortSignal.
// Cancellation stops this owner waiting; it cannot undo a server request.
function waitForRead(read, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(read).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

const empty = { snapshot: null, fetching: true, error: null };
export function usePatientHomeData(user) {
  const userId = user?.id;
  const nutritionistId = user?.profile?.nutritionist_id || null;
  const active = user?.profile?.is_active;
  const scope = JSON.stringify([userId, nutritionistId, active]);
  const owner = useRef(scope); owner.current = scope;
  const request = useRef({ generation: 0, controller: null });
  const [state, setState] = useState(empty);
  const latest=useRef(state);latest.current=state;
  const load = useCoordinatedLoader(useCallback(async ({ discard = false } = {}) => {
    if (!userId) return;
    const snapshotBefore=!discard&&latest.current.scope===scope?latest.current.snapshot:null;
    const generation = ++request.current.generation;
    request.current.controller?.abort();
    const controller = new AbortController(); request.current.controller = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException('request_timeout', 'TimeoutError')), 15000);
    const current = () => owner.current === scope && request.current.generation === generation;
    const read = async promise => {
      const result = await waitForRead(promise, controller.signal);
      if (result?.error) throw result.error;
      controller.signal.throwIfAborted();
      return result;
    };
    setState(previous => ({ scope, snapshot: !discard && previous.scope === scope ? previous.snapshot : null, fetching: true, error: null }));
    try {
      const today = new Date(), todayStr = format(today, 'yyyy-MM-dd');
      const care = await read(getMyCareRelationship({ signal: controller.signal }));
      let linkStatus = care.data?.status || 'unlinked';
      if (nutritionistId) {
        const link = await read(getPatientHomeLink(userId, nutritionistId, controller.signal));
        if (link.data?.status === 'pending') linkStatus = 'pending';
      }
      if (linkStatus !== 'active') {
        if (current()) setState({ scope, snapshot: { linkStatus, isArchived: linkStatus === 'ended' }, fetching: false, error: null });
        return;
      }
      const publish = patch => {
        if (current() && !controller.signal.aborted) setState(previous => ({scope, fetching:true, error:null, snapshot:{
          ...(previous.scope === scope ? previous.snapshot : null), linkStatus, isArchived:false, ...patch,
        }}));
      };
      if(current())setState(previous=>({...previous,snapshot:{...(previous.scope===scope?previous.snapshot:null),linkStatus,isArchived:false,
        prescriptionReady:previous.snapshot?.prescriptionReady||false,mealsReady:previous.snapshot?.mealsReady||false,appointmentReady:previous.snapshot?.appointmentReady||false,
        todayMealsCount:previous.snapshot?.todayMealsCount??null}}));
      // Authorization stays serial. These three sources have no data dependency.
      await Promise.all([
        read(getActiveMealPlan(userId, {signal:controller.signal})).then(plan => {
          const prescription=plan.data;
          const prescriptionGoal=prescription && prescription.daily_calories > 0 ? {
            calories:prescription.daily_calories||0,protein:prescription.daily_protein||0,
            carbs:prescription.daily_carbs||0,fat:prescription.daily_fat||0,
          } : {calories:2000,protein:0,carbs:0,fat:0};
          publish({prescription,prescriptionGoal,prescriptionReady:true});
        }),
        read(getPatientHomeAppointment(userId,today.toISOString(),controller.signal)).then(appointment =>
          publish({nextAppointment:appointment.data,appointmentReady:true})),
        read(getPatientHomeMeals(userId,todayStr,controller.signal)).then(meals => {
          const registeredMeals=meals.data||[];
          const currentProgress=registeredMeals.reduce((sum,meal)=>({
            calories:sum.calories+(meal.total_calories||0),protein:sum.protein+(meal.total_protein||0),
            carbs:sum.carbs+(meal.total_carbs||0),fat:sum.fat+(meal.total_fat||0),
          }),{calories:0,protein:0,carbs:0,fat:0});
          publish({registeredMeals,currentProgress,todayMealsCount:meals.count??registeredMeals.length,mealsReady:true});
        }),
      ]);
      if(current())setState(previous=>({...previous,fetching:false}));
    } catch (error) {
      if (!current()) return;
      const failure = failurePresentation(controller.signal.aborted ? controller.signal.reason : error);
      controller.abort();
      if (failure.kind === 'aborted') return;
      const denied = ['unauthenticated', 'forbidden'].includes(failure.kind);
      setState(previous => ({ scope, snapshot: !denied ? snapshotBefore : null, fetching: false, error: failure }));
    } finally { clearTimeout(timeout); }
  }, [userId, nutritionistId, scope]), scope, ['clinical','profile']);

  useEffect(() => {
    if (!userId) return;
    void load();
    const requests = request.current;
    // Domain signals are already coalesced by actor/kind. This local turn also
    // merges profile+clinical; access immediately hides the previous snapshot.
    const refresh = () => { void load.invalidate(); };
    const off = [];
    off.push(subscribeDomain(userId, 'access', () => {
      void load({ discard: true });
    }));
    window.addEventListener('online', refresh);
    return () => {
      off.forEach(unsubscribe => unsubscribe()); window.removeEventListener('online', refresh);
      requests.generation += 1; requests.controller?.abort();
    };
  }, [userId, load]);
  const result = state.scope === scope ? state : empty;
  return { ...result.snapshot, fetching: result.fetching, error: result.error,
    loading: !result.snapshot && result.fetching, hasSnapshot: Boolean(result.snapshot), loadData: load };
}
