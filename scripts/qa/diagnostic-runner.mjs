import {spawn}from'node:child_process';import{relevantDiagnostic}from'./diagnostic-policy.mjs';
export function runDiagnosticCommand(args,{stdout=chunk=>process.stdout.write(chunk),stderr=chunk=>process.stderr.write(chunk)}={}){
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['inherit','pipe','pipe']});let output='';for(const [stream,target]of[[child.stdout,stdout],[child.stderr,stderr]])stream.on('data',chunk=>{output+=chunk;target(chunk);});child.on('error',reject);child.on('close',(code,signal)=>{const diagnostics=output.replace(/\u001b\[[0-9;]*m/g,'').split('\n').filter(relevantDiagnostic);resolve({code:signal?1:(code|| (diagnostics.length?1:0)),diagnostics});});});
}
