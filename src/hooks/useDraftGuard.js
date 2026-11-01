import { createContext, useContext, useEffect } from 'react';

export const DraftGuardContext = createContext(null);

export function useDraftGuard(dirty) {
  const register = useContext(DraftGuardContext);
  useEffect(() => {
    if (!dirty) return;
    const unregister = register?.();
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { unregister?.(); window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty, register]);
}
