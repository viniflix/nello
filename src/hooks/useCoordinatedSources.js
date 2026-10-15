import {useCallback,useEffect,useRef} from 'react';
import {createReadCoordinator} from '@/infrastructure/realtime/readCoordinator';
import {currentReadSignal} from '@/infrastructure/realtime/readSignalState';
import {getAccessEpoch} from '@/infrastructure/realtime/accessEpochState';
import {getPrivateSessionEpoch} from '@/lib/utils/privateSessionState';
import {useAccessEpoch,resourceActor} from './useAccessEpoch';

// Independent sources must not wait behind another section's slow query.
// Existing effect/ticket guards own publication; this layer holds no snapshots.
export function useCoordinatedSources(scope) {
  const actor=resourceActor(scope),accessEpoch=useAccessEpoch(actor);
  const entries=useRef(new Map()),current=useRef(scope),active=useRef(true);current.current=scope;
  const read=useCallback(async(name,loader)=>{
    if(!active.current||current.current!==scope)return {data:null,error:{name:'AbortError'}};
    const access=getAccessEpoch(actor),session=getPrivateSessionEpoch(),key=JSON.stringify([scope,name,access,session]);
    let owner=entries.current.get(key);
    if(!owner){owner=createReadCoordinator(()=>active.current&&current.current===scope&&access===getAccessEpoch(actor)&&session===getPrivateSessionEpoch(),100,currentReadSignal);entries.current.set(key,owner);}
    return await owner.request(loader) || {data:null,error:{name:'AbortError'}};
  },[scope,actor,accessEpoch]);
  useEffect(()=>{active.current=true;const owned=entries.current;return()=>{active.current=false;owned.forEach(entry=>entry.dispose());owned.clear();};},[scope,accessEpoch]);
  return read;
}
