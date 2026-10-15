import {Suspense,useCallback,useEffect,useLayoutEffect,useRef} from 'react';
import {SectionLoading} from './section-loading';

function Waiting({onFinish,onStart}) {
 useLayoutEffect(()=>{onStart();return onFinish},[onStart,onFinish]);
 return <SectionLoading/>;
}
export function OutletLoadingBoundary({children,className=''}) {
 const root=useRef(null),last=useRef(null),saved=useRef(null),frame=useRef(null),alive=useRef(true);
 const waiting=useRef(false),scroll=useRef({x:0,y:0,ancestors:new Map()});
 const remember=event=>{
  const element=event.target;
  last.current={element,start:element.selectionStart,end:element.selectionEnd,direction:element.selectionDirection};
 };
 const onStart=useCallback(()=>{
  cancelAnimationFrame(frame.current);
  waiting.current=true;
  saved.current=last.current ? {...last.current,scroll:{...scroll.current,ancestors:new Map(scroll.current.ancestors)}} : null;
 },[]);
 const onFinish=useCallback(()=>{
  // A single frame runs after React has made the suspended DOM visible again.
  // Navigation or user focus elsewhere wins; never focus an obsolete route.
  frame.current=requestAnimationFrame(()=>{
   const snapshot=saved.current,active=document.activeElement;
   waiting.current=false;
   scroll.current.x=window.scrollX;scroll.current.y=window.scrollY;
   if(!alive.current||!snapshot?.element?.isConnected||!root.current?.contains(snapshot.element)
    ||(active!==document.body&&active!==snapshot.element))return;
   snapshot.element.focus({preventScroll:true});
   if(typeof snapshot.start==='number')try{snapshot.element.setSelectionRange(snapshot.start,snapshot.end,snapshot.direction)}catch{/* Some inputs do not support selection. */}
   window.scrollTo(snapshot.scroll.x,snapshot.scroll.y);
   for(const [element,position]of snapshot.scroll.ancestors)if(element.isConnected)element.scrollTo(position.x,position.y);
  });
 },[]);
 useEffect(()=>{
  alive.current=true;scroll.current={x:window.scrollX,y:window.scrollY,ancestors:new Map()};
  const record=event=>{
   if(waiting.current)return;
   const element=event.target;
   if(element===document||element===window){scroll.current.x=window.scrollX;scroll.current.y=window.scrollY;}
   else if(element instanceof Element&&element.contains(root.current))scroll.current.ancestors.set(element,{x:element.scrollLeft,y:element.scrollTop});
  };
  document.addEventListener('scroll',record,{capture:true,passive:true});
  return()=>{alive.current=false;cancelAnimationFrame(frame.current);document.removeEventListener('scroll',record,true)};
 },[]);
 return <div ref={root} className={`min-w-0 ${className}`} onFocusCapture={remember} onSelectCapture={remember}>
  <Suspense fallback={<Waiting onStart={onStart}onFinish={onFinish}/>}>{children}</Suspense>
 </div>;
}
