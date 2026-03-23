import { useEffect } from 'react';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';

/**
 * PresenceGlobal
 * Componente invisível que garante que o tracking de presença
 * esteja ativo em toda a plataforma enquanto o usuário estiver logado.
 */
const PresenceGlobal = () => {
    // Basta chamar o hook. O useEffect interno dele cuida da inscrição/untrack.
    useOnlinePresence();
    
    return null;
};

export default PresenceGlobal;
