import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
export function ConnectivityNotice() {
  const { isOffline, user } = useAuth();
  if (!user || !isOffline) return null;
  return <div role="status" className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-xl rounded-xl border border-secondary bg-background p-3 text-sm shadow-sm">
    Sem conexão. Você pode consultar o que já está aberto e editar rascunhos nesta aba. Os dados ainda não foram salvos no servidor; não há envio automático de ações clínicas. Recarregar ou fechar a aba perde as alterações sem confirmação.
  </div>;
}
