import React from 'react';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/react';

const FallbackComponent = ({ error, resetError }) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-background">
    <div className="max-w-md w-full rounded-xl border bg-card p-6 shadow-xl text-center">
      <h2 className="text-lg font-semibold text-foreground">Algo deu errado 😓</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Nossa equipe de engenharia foi notificada automaticamente com os detalhes técnicos e uma gravação de tela blindada (sem dados sensíveis) para corrigir este problema rapidamente.
      </p>
      
      <div className="bg-destructive/10 text-destructive text-xs p-3 rounded mt-4 overflow-auto text-left max-h-32">
        {error?.toString() || "Erro inesperado"}
      </div>

      <div className="mt-6">
        <Button
          variant="default"
          onClick={() => {
             resetError();
             window.location.reload();
          }}
          className="w-full"
        >
          Recarregar a página
        </Button>
      </div>
    </div>
  </div>
);

export default function ClientErrorBoundary({ children }) {
  return (
    <Sentry.ErrorBoundary fallback={FallbackComponent} showDialog={false}>
      {children}
    </Sentry.ErrorBoundary>
  );
}

