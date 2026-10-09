export {renderCanonicalDocumentPdf} from '../src/features/documents/pdf/render-canonical-document.js';
export {uploadVerifiedFile} from '../src/lib/storage/verifiedUpload';
import React from 'react';
import ImageModal from '../src/components/ImageModal';
import { createRoot } from 'react-dom/client';
import { Toaster } from '../src/components/ui/toaster';
import { toast } from '../src/components/ui/use-toast';
import { ToastAction } from '../src/components/ui/toast';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../src/components/ui/dialog';
export function mountSyntheticToast() {
  function Probe() {
    const [actions, setActions] = React.useState(0);
    const notify = duration => toast({title:'Aviso de teste', description:'Orientação sintética para continuar.', duration,
      action:React.createElement(ToastAction,{altText:'Continuar tarefa sintética',onClick:()=>setActions(value=>value+1)},'Continuar')});
    return React.createElement(React.Fragment,null,
      React.createElement('main',null,React.createElement('h1',null,'Avisos sintéticos'),
        React.createElement('button',{onClick:()=>notify(Infinity)},'Mostrar aviso'),
        React.createElement('button',{onClick:()=>notify(800)},'Aviso temporário'),
        React.createElement('p',{'aria-label':'Ações realizadas'},String(actions)),
        React.createElement(Dialog,null,React.createElement(DialogTrigger,{asChild:true},React.createElement('button',null,'Abrir diálogo')),
          React.createElement(DialogContent,null,React.createElement(DialogTitle,null,'Diálogo sintético'),
            React.createElement(DialogDescription,null,'Nenhum dado enviado.'),
            React.createElement('button',{onClick:()=>notify(Infinity)},'Avisar no diálogo')))),
      React.createElement(Toaster));
  }
  createRoot(document.getElementById('root')).render(React.createElement(Probe));
}
export function mountSyntheticMediaModal() {
  function Probe() {
    const [open, setOpen] = React.useState(false);
    return React.createElement('main', null, React.createElement('h1', null, 'Mídia sintética'),
      React.createElement('button', {type:'button', onClick:()=>setOpen(true)}, 'Ampliar imagem'),
      React.createElement(ImageModal, { mediaPath: open ? '/nello-logo.png' : null, mediaType:'image', onClose:()=>setOpen(false) }));
  }
  createRoot(document.getElementById('root')).render(React.createElement(Probe));
}
import AudioPlayer from '../src/features/chat/components/AudioPlayer';
// Disposable browser fixture: real production controls, synthetic local media.
export function mountSyntheticAudio(src) {
  const root = createRoot(document.getElementById('root'));
  root.render(React.createElement('main', { 'aria-label': 'Áudio de teste' },
    React.createElement('h1', null, 'Player de áudio'), React.createElement(AudioPlayer, { src })));
  return () => root.unmount();
}
import posthog, { identifyUser, resetUser, track } from '../src/infrastructure/analytics/posthog';
import { createPosthogOptions } from '../src/app/config/posthog';
import { bindConsentOwner, storeAnalyticsChoice } from '../src/features/privacy/consent';
import { initializeObservability } from '../src/app/bootstrap/observability';
import { captureOperationalError, setObservabilityUser } from '../src/infrastructure/observability/telemetry';
export function syntheticSentryTransport() {
  initializeObservability({ VITE_SENTRY_DSN: `http://synthetic@localhost:4173/1`, MODE: 'production', VITE_APP_RELEASE: 'a'.repeat(40) });
  setObservabilityUser({ id: '1ba45c9b-d0d4-490d-96a0-6addd7826833', profile: { user_type: 'nutritionist' } });
  return captureOperationalError({ name: 'TypeError', code: 'NETWORK_FAILURE', status: 503, message: 'PRIVATE_SYNTHETIC_SENTINEL', cause: { status: 503, message: 'Failed to fetch PRIVATE_SYNTHETIC_SENTINEL' } }, { operation: 'qa.transport_failure', module: 'qa', source: 'controlled_probe' });
}
export async function syntheticAnalyticsTransport() {
  const first = '9ba45c9b-d0d4-490d-96a0-6addd7826833';
  const second = '1ba45c9b-d0d4-490d-96a0-6addd7826833';
  bindConsentOwner(first); storeAnalyticsChoice(true);
  await posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    ...createPosthogOptions(import.meta.env), api_host: window.location.origin,
    request_batching: false, persistence: 'memory', capture_pageview: false, capture_pageleave: false,
    // Only this disposable fixture bypasses the SDK's automation filter.
    opt_out_useragent_filter: true,
  });
  posthog.opt_in_capturing({ captureEventName: false, enable_persistence: false });
  identifyUser({ id: first, profile: { user_type: 'patient' } });
  track('operation_failed', { correlation_id: first, operation: 'qa.transport', payload: 'PRIVATE_SYNTHETIC_SENTINEL' });
  for (const operation of ['anthropometry_save', 'energy_save', 'meal_plan_apply']) {
    for (const outcome of ['started', 'failed', 'succeeded']) track('ui_action_outcome', { operation, outcome });
  }
  resetUser();
  bindConsentOwner(second); storeAnalyticsChoice(true);
  posthog.opt_in_capturing({ captureEventName: false, enable_persistence: false });
  identifyUser({ id: second, profile: { user_type: 'nutritionist' } });
  track('operation_failed', { correlation_id: second, operation: 'qa.transport', payload: 'PRIVATE_SYNTHETIC_SENTINEL' });
  return { loaded: posthog.__loaded };
}

export async function syntheticAnalyticsPrivacyBoundary() {
  bindConsentOwner('wave04-privacy-probe'); storeAnalyticsChoice(false);
  posthog.capture('ui_action_outcome',{operation:'qa_default_denied',outcome:'succeeded'});
  storeAnalyticsChoice(true);
  await posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    ...createPosthogOptions(import.meta.env), api_host: window.location.origin,
    request_batching: false, persistence: 'memory', capture_pageview: false, capture_pageleave: false,
    opt_out_useragent_filter: true,
  });
  posthog.opt_in_capturing({ captureEventName: false, enable_persistence: false });
  posthog.capture('ui_action_outcome', { operation:'qa_explicit_grant',outcome:'succeeded',payload: 'PRIVATE_SYNTHETIC_SENTINEL' });
  posthog.capture('qa_unknown_event',{payload:'PRIVATE_SYNTHETIC_SENTINEL'});
  storeAnalyticsChoice(false); posthog.opt_out_capturing();
  posthog.capture('ui_action_outcome',{operation:'qa_revoked_denied',outcome:'succeeded'});
  return { optedOut: posthog.has_opted_out_capturing() };
}

import AuthCaptcha from '../src/features/auth/AuthCaptcha';
export function mountSyntheticCaptcha() {
  function Probe() {
    const [token,setToken]=React.useState('');
    return React.createElement('main',{className:'min-h-dvh flex items-center justify-center p-4'},React.createElement('div',{className:'w-full max-w-md'},React.createElement('div',{className:'rounded-lg border p-6'},React.createElement('h1',null,'Verificação sintética'),React.createElement(AuthCaptcha,{sitekey:'synthetic',attempt:0,onToken:setToken}),React.createElement('p',null,token?'Verificado':'Aguardando'))));
  }
  createRoot(document.getElementById('root')).render(React.createElement(Probe));
}
