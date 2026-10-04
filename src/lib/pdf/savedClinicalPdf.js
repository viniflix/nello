/* global BigInt */
import { supabase } from '@/infrastructure/supabase/client';
import { isUuid } from '@/lib/utils/patientRoutes';
import { track, Events } from '@/infrastructure/analytics/posthog';

export async function renderSavedClinicalPdf(kind, id, options={}) {
  const validId = ['energyCalculationId','mealPlanId','anthropometryRecordId'].includes(kind)
    ? ((typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
      (typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n))
    : ['documentArtifactId','anamnesisRecordId'].includes(kind) && isUuid(id);
  if (!validId) throw new Error('saved_document_required');
  if(kind==='anthropometryRecordId'&&!(Number.isSafeInteger(options.compareRecordId)&&options.compareRecordId>0))throw new Error('saved_comparison_required');
  const {data,error} = await supabase.functions.invoke('generate-pdf',{body:{[kind]:id,format:'binary',...(kind==='anthropometryRecordId'?{compareRecordId:options.compareRecordId}:{}),...(kind==='mealPlanId'?{includeNutrients:options.includeNutrients!==false}:{})}});
  if(error) throw new Error('Não foi possível gerar o documento salvo. Confira sua conexão e o acesso ao registro.');
  if(!(data instanceof Blob) || data.size === 0 || data.size > 2*1024*1024) throw new Error('invalid_pdf_response');
  const signature = new Uint8Array(await data.slice(0,5).arrayBuffer());
  if(String.fromCharCode(...signature) !== '%PDF-') throw new Error('invalid_pdf_response');
  track(Events.DOCUMENT_GENERATED,{operation:'clinical_pdf_generate',outcome:'succeeded'});
  return new Blob([data],{type:'application/pdf'});
}
export async function downloadSavedClinicalPdf(kind,id,options) {
  const blob = await renderSavedClinicalPdf(kind,id,options), url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href=url;anchor.download=`nello-${kind === 'energyCalculationId' ? 'energia' : 'documento'}-${id}.pdf`;
  document.body.appendChild(anchor);
  try {anchor.click();} finally {anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
