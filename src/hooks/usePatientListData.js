import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchAllNutritionistPatients} from '@/lib/supabase/patient-queries';
import {failurePresentation,classifyFailure} from '@/lib/utils/failure';
import {useAccessEpoch} from './useAccessEpoch';
import {getAccessEpoch} from '@/infrastructure/realtime/accessEpochState';
import {getPrivateSessionEpoch} from '@/lib/utils/privateSessionState';
const empty={patients:[],pendingRequests:[],loading:false,error:null,confirmed:false,refreshing:false};
export function usePatientListData(accountId){
 const accessEpoch=useAccessEpoch(accountId);
 const [state,setState]=useState(empty),owner=useRef(accountId),sequence=useRef(0),pending=useRef(null);
 owner.current=accountId;
 const fetchPatients=useCoordinatedLoader(useCallback(async()=>{
   if(!accountId)return;
   const ticket=++sequence.current;
   const sessionEpoch=getPrivateSessionEpoch();
   pending.current?.abort();const controller=new AbortController();pending.current=controller;
   const timeout=setTimeout(()=>controller.abort(new DOMException('request_timeout','TimeoutError')),15000);
   const current=()=>owner.current===accountId&&ticket===sequence.current&&accessEpoch===getAccessEpoch(accountId)&&sessionEpoch===getPrivateSessionEpoch();
   setState(previous=>{const preserve=previous.accountId===accountId&&previous.accessEpoch===accessEpoch&&previous.sessionEpoch===sessionEpoch;return {...(preserve?previous:empty),accountId,accessEpoch,sessionEpoch,loading:!(preserve&&previous.confirmed),refreshing:Boolean(preserve&&previous.confirmed),error:null};});
   try{
     const result=await fetchAllNutritionistPatients(accountId,{signal:controller.signal});
     if(!current())return;
     if(result.error)throw result.error;
     setState({accountId,accessEpoch,sessionEpoch,patients:[...(result.active||[]),...(result.archived||[])],pendingRequests:result.pending||[],loading:false,error:null,confirmed:true,refreshing:false,confirmedAt:Date.now()});
   }catch(error){const failure=controller.signal.aborted?controller.signal.reason:error;if(current()){const denied=['forbidden','unauthenticated'].includes(classifyFailure(failure));setState(previous=>({...previous,...(denied?{patients:[],pendingRequests:[],confirmed:false,confirmedAt:null}:{}),loading:false,refreshing:false,error:classifyFailure(failure)==='aborted'?null:failurePresentation(failure)}));}}
   finally{clearTimeout(timeout);}
 },[accountId,accessEpoch]), JSON.stringify([accountId, 'patients.list']), ['clinical']);
 useEffect(()=>{owner.current=accountId;setState({...empty,accountId});fetchPatients();return()=>{owner.current=null;pending.current?.abort();};},[accountId,fetchPatients]);
 // Never render another account's records even before effect cleanup runs.
 const visible=state.accountId===accountId&&state.accessEpoch===accessEpoch&&state.sessionEpoch===getPrivateSessionEpoch()?state:{...empty,loading:Boolean(accountId)};
 return {...visible,hasSnapshot:visible.confirmed,resource:{hasSnapshot:visible.confirmed,pending:visible.loading||visible.refreshing,refreshing:visible.refreshing,error:visible.error,stale:visible.confirmed&&Boolean(visible.error)},fetchPatients};
}
