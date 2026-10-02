import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchAllNutritionistPatients} from '@/lib/supabase/patient-queries';
import {failurePresentation,classifyFailure} from '@/lib/utils/failure';
const empty={patients:[],pendingRequests:[],loading:false,error:null};
export function usePatientListData(accountId){
 const [state,setState]=useState(empty),owner=useRef(accountId),sequence=useRef(0),pending=useRef(null);
 owner.current=accountId;
 const fetchPatients=useCallback(async()=>{
   if(!accountId)return;
   const ticket=++sequence.current;
   pending.current?.abort();const controller=new AbortController();pending.current=controller;
   const timeout=setTimeout(()=>controller.abort(new DOMException('request_timeout','TimeoutError')),15000);
   const current=()=>owner.current===accountId&&ticket===sequence.current;
   setState(previous=>({...previous,accountId,loading:true,error:null}));
   try{
     const result=await fetchAllNutritionistPatients(accountId,{signal:controller.signal});
     if(!current())return;
     if(result.error)throw result.error;
     setState({accountId,patients:[...(result.active||[]),...(result.archived||[])],pendingRequests:result.pending||[],loading:false,error:null});
   }catch(error){const failure=controller.signal.aborted?controller.signal.reason:error;if(current())setState(previous=>({...previous,loading:false,error:classifyFailure(failure)==='aborted'?null:failurePresentation(failure)}));}
   finally{clearTimeout(timeout);}
 },[accountId]);
 useEffect(()=>{owner.current=accountId;setState({...empty,accountId});fetchPatients();return()=>{owner.current=null;pending.current?.abort();};},[accountId,fetchPatients]);
 // Never render another account's records even before effect cleanup runs.
 return {...(state.accountId===accountId?state:empty),fetchPatients};
}
