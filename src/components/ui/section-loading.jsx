import {useEffect,useState} from 'react';
export function SectionLoading({fullPage=false,label='Carregando esta área…'}={}){
 const[visible,setVisible]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setVisible(true),400);return()=>clearTimeout(timer)},[]);
 return <div aria-busy="true" className={fullPage?'flex min-h-dvh items-center justify-center bg-background p-6':'min-h-[120px] p-6'}>{visible&&<p role="status" className="text-sm text-muted-foreground">{label}</p>}</div>;
}
