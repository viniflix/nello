import { useEffect } from 'react';
const approvedNavigationEvents = new WeakSet();
export function useDraftGuard(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const beforeLink = event => {
      const link = event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || approvedNavigationEvents.has(event) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href,window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (!window.confirm('Há alterações sem confirmação do servidor. Sair agora? O rascunho fica somente nesta aba e não sobrevive ao recarregamento.')) { event.preventDefault(); event.stopPropagation(); }
      else approvedNavigationEvents.add(event);
    };
    window.addEventListener('beforeunload',beforeUnload);
    document.addEventListener('click',beforeLink,true);
    return () => { window.removeEventListener('beforeunload',beforeUnload); document.removeEventListener('click',beforeLink,true); };
  },[dirty]);
}
