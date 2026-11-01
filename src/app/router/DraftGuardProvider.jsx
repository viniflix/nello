import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { DraftGuardContext } from '@/hooks/useDraftGuard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function DraftGuardProvider({ children }) {
  const [dirtyCount, setDirtyCount] = useState(0);
  const returnFocus = useRef(null);
  const register = useCallback(() => {
    setDirtyCount(count => count + 1);
    return () => setDirtyCount(count => count - 1);
  }, []);
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => {
    const leaving = dirtyCount > 0 && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search || currentLocation.state !== nextLocation.state);
    if (leaving) returnFocus.current = document.activeElement;
    return leaving;
  }, [dirtyCount]));
  useEffect(() => {
    if (blocker.state === 'blocked' && dirtyCount === 0) blocker.proceed();
  }, [blocker, dirtyCount]);
  return <DraftGuardContext.Provider value={register}>
    {children}
    <AlertDialog open={blocker.state === 'blocked' && dirtyCount > 0} onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}>
      <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair com alterações pendentes?</AlertDialogTitle>
          <AlertDialogDescription>Há alterações sem confirmação do servidor. O rascunho fica somente nesta aba e não sobrevive ao recarregamento.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={event => { event.preventDefault(); if (blocker.state === 'blocked') blocker.proceed(); }}>Sair sem confirmação</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </DraftGuardContext.Provider>;
}
