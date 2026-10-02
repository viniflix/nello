import React from 'react';
import { Button } from '@/components/ui/button';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';
import { failurePresentation } from '@/lib/utils/failure';
import { isChunkLoadError, requestReleaseReload } from '@/lib/utils/lazyWithReload';

export default class ClientErrorBoundary extends React.Component {
  state={error:null,attempts:0,correlationId:null};
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error){this.setState({correlationId:captureOperationalError(error,{operation:'render_domain',module:'react_boundary',source:'react'})});}
  componentDidUpdate(previous){if(previous.resetKey!==this.props.resetKey&&this.state.error)this.setState({error:null,attempts:0,correlationId:null});}
  render(){
    const {error,attempts,correlationId}=this.state;
    if(!error)return <React.Fragment key={this.props.resetKey}>{this.props.children}</React.Fragment>;
    const chunk=isChunkLoadError(error),presentation=failurePresentation(error);
    return <section role="alert" className="flex min-h-[240px] items-center justify-center p-6 bg-background"><div className="max-w-md rounded-xl border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">{chunk?'Uma atualização está disponível':'Não foi possível abrir esta área'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{chunk?'Atualize quando estiver pronto. Alterações ainda não salvas podem ser descartadas; a página não será recarregada automaticamente.':presentation.message}</p>
      {correlationId&&<p className="mt-2 text-xs">Código para o suporte: {correlationId}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-3">{chunk?<Button onClick={()=>requestReleaseReload({onBlocked:()=>this.setState({attempts:2})})} disabled={attempts>=2}>Atualizar página</Button>:<Button disabled={attempts>=2} onClick={()=>this.setState({error:null,attempts:attempts+1,correlationId:null})}>Tentar novamente</Button>}<a href="/ajuda" className="underline">Ajuda</a></div>
      {attempts>=2&&<p className="mt-3 text-sm">Não foi possível recuperar esta área. Use a navegação para voltar ou contate o suporte.</p>}
    </div></section>;
  }
}
