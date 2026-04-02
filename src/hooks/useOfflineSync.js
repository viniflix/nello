import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const OFFLINE_QUEUE_KEY = 'nello_offline_queue';

/**
 * Hook para gerenciar ações pendentes que falharam por falta de conexão.
 * Utiliza o localStorage para persistência e processa a fila ao voltar a ficar online.
 */
export function useOfflineSync() {
  const [queue, setQueue] = useState(() => {
    const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const saveQueue = useCallback((newQueue) => {
    setQueue(newQueue);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(newQueue));
  }, []);

  const addToQueue = useCallback((type, payload) => {
    const newAction = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0
    };
    saveQueue([...queue, newAction]);
  }, [queue, saveQueue]);

  const processAction = useCallback(async (action) => {
    try {
      if (action.type === 'REDEEM_INVITE') {
        const { data, error } = await supabase.rpc('redeem_invite_code', {
          input_code: action.payload.code
        });
        if (error) throw error;
        return { success: true, data };
      }
      
      // Adicionar outros tipos de ações conforme o sistema crescer
      return { success: false, error: 'UNKNOWN_ACTION_TYPE' };
    } catch (err) {
      // Se for erro de rede, mantemos para tentar depois
      const isNetworkError = !window.navigator.onLine || err.message?.includes('fetch');
      return { success: false, isNetworkError, error: err.message };
    }
  }, []);

  const syncAll = useCallback(async () => {
    if (!window.navigator.onLine || queue.length === 0) return;

    const remainingActions = [];
    const results = [];

    for (const action of queue) {
      const result = await processAction(action);
      
      if (result.success) {
        results.push({ id: action.id, status: 'synced' });
      } else if (result.isNetworkError) {
        remainingActions.push({ ...action, retryCount: action.retryCount + 1 });
      } else {
        // Erro lógico (ex: código inválido) - removemos da fila para não travar
        console.warn(`[OfflineSync] Action ${action.id} failed with logic error:`, result.error);
        results.push({ id: action.id, status: 'failed', error: result.error });
      }
    }

    saveQueue(remainingActions);
    return results;
  }, [queue, processAction, saveQueue]);

  useEffect(() => {
    const handleOnline = () => {
      if (import.meta.env.DEV) console.log('[OfflineSync] Internet recuperada, iniciando sincronização...');
      syncAll();
    };

    window.addEventListener('online', handleOnline);
    
    // Tenta sincronizar ao montar o hook se estiver online
    if (window.navigator.onLine && queue.length > 0) {
      syncAll();
    }

    return () => window.removeEventListener('online', handleOnline);
  }, [syncAll, queue.length]);

  return {
    queue,
    addToQueue,
    syncAll,
    isQueuePending: queue.length > 0
  };
}
