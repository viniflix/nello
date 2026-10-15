import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createRoutesFromElements,matchRoutes} from 'react-router-dom';
import {nutritionistRoutes} from '@/app/router/nutritionistRoutes';
import TabContentClinical from './TabContentClinical';

const state=vi.hoisted(()=>({navigate:vi.fn(),latest:null}));
vi.mock('react-router-dom',async()=>({...await vi.importActual('react-router-dom'),useNavigate:()=>state.navigate}));
vi.mock('@/lib/utils/lazyWithReload',()=>({lazyWithReload:()=>()=>null}));
vi.mock('@/app/router/routeGuards',()=>({ProtectedRoute:({children})=>children}));
vi.mock('@/portals/admin/components/AdminAccessGate.jsx',()=>({default:({children})=>children}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-professional'}})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/supabase/anamnesis-queries',()=>({getLatestAnamnesis:async()=>({data:state.latest})}));
vi.mock('@/lib/supabase/lab-results-queries',()=>({getRecentLabResults:async()=>({data:[]})}));
vi.mock('@/components/patient-hub/GlycemiaSummaryCard',()=>({default:()=>null}));
vi.mock('@/features/clinical-records/components/ClinicalAttachmentsPanel',()=>({default:()=>null}));
vi.mock('@/features/clinical-records/components/EvolutionEditor',()=>({default:()=>null}));
vi.mock('@/features/clinical-records/components/EvolutionTemplateSelector',()=>({default:()=>null}));
vi.mock('@/features/clinical-records/api/evolution-queries',()=>({createClinicalEvolutionDraft:vi.fn(),listClinicalRecordsByEpisode:async()=>({data:[]})}));

describe('Clinical hub canonical anamnesis navigation',()=>{
 beforeEach(()=>{state.navigate.mockClear();state.latest=null;});
 for(const context of [{id:'synthetic-patient',slug:'qa-patient',writable:'episode-current'},{id:'synthetic-patient',writable:null}]){
  for(const action of ['Iniciar','Anamnese']){
   it(`routes ${action} with ${context.slug?'slug/current':'id/ended'} context to an actually registered patient route`,async()=>{
    render(<TabContentClinical patientId={context.id} patientData={context} viewedEpisodeId="episode-current" writableEpisodeId={context.writable} currentUserId="synthetic-professional"/>);
    const button=await screen.findByRole('button',{name:action});
    fireEvent.click(button);
    const expected=`/nutritionist/patients/${context.slug||context.id}/anamnese`;
    expect(state.navigate).toHaveBeenCalledWith(expected);
    const matches=matchRoutes(createRoutesFromElements(nutritionistRoutes),expected);
    expect(matches?.at(-1)?.route.path).toBe('/nutritionist/patients/:patientId/anamnese');
    expect(matches?.at(-1)?.params.patientId).toBe(context.slug||context.id);
    if(!context.writable)expect(screen.queryByRole('button',{name:/nova evolu/i})).toBeNull();
   });
  }
 }
 it('routes an existing anamnesis through the same canonical listing without creating a draft',async()=>{
  state.latest={id:'synthetic-existing',date:'2026-10-14',status:'draft'};
  render(<TabContentClinical patientId="synthetic-patient" patientData={{id:'synthetic-patient',slug:'qa-patient'}} viewedEpisodeId="episode-current" writableEpisodeId="episode-current"/>);
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Iniciar'})).toBeNull());
  fireEvent.click(screen.getByRole('button',{name:'Abrir'}));
  expect(state.navigate).toHaveBeenCalledWith('/nutritionist/patients/qa-patient/anamnese');
 });
});
