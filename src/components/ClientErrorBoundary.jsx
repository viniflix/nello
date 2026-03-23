import React from 'react';
import { Button } from '@/components/ui/button';

class ClientErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      const capture = window.__hipozeroClientErrorCapture;
      const route = (() => {
        try {
          return `${window.location.pathname}${window.location.search}${window.location.hash}`;
        } catch {
          return null;
        }
      })();

      const errorType = error?.name || 'ReactError';
      const message = error?.message || null;
      const stack = error?.stack || null;

      if (capture?.logNow) {
        void capture.logNow({
          errorType,
          message,
          stack,
          route,
          extra: {
            kind: 'react_error_boundary',
            componentStack: info?.componentStack || null,
          },
        });
      }
    } catch {
      // Intencionalmente silencioso: falha no logger não deve quebrar o app.
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full rounded-xl border bg-card p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground mt-2">
            O erro foi registrado. Tente recarregar a página.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="default"
              onClick={() => window.location.reload()}
              className="w-full"
            >
              Recarregar
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ClientErrorBoundary;

