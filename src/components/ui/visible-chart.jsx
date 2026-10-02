import { useLayoutEffect, useRef, useState } from 'react';
import {ResponsiveContainer} from 'recharts';
export function VisibleChart({height=300,children,...props}){
 const ref=useRef(null),[size,setSize]=useState({width:0,height:0});
 useLayoutEffect(()=>{
   const element=ref.current;
   const measure=()=>{const rect=element.getBoundingClientRect();const width=Math.floor(rect.width),height=Math.floor(rect.height);setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height});};
   measure();
   if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);}
   const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[]);
 return <div ref={ref} style={{height,minWidth:0,width:'100%'}}>{size.width>0&&size.height>0?<ResponsiveContainer {...props} width={size.width} height={size.height}>{children}</ResponsiveContainer>:null}</div>;
}
