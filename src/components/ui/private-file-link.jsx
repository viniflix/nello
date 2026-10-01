import { useState } from 'react';
import { signPrivateFile } from '@/lib/storage/privateFiles';

export function PrivateFileLink({ value, bucket, children, className }) {
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState(false);
  const open = async () => {
    // Reserve the tab in the user gesture, before the authorization request.
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setError(true); return; }
    tab.opener = null;
    setOpening(true);
    setError(false);
    try { tab.location.replace(await signPrivateFile(value, bucket)); }
    catch { tab.close(); setError(true); }
    finally { setOpening(false); }
  };
  return <span className={className}>
    <button type="button" onClick={open} disabled={opening} className="text-primary hover:underline">
      {opening ? 'Autorizando acesso…' : children}
    </button>
    {error && <span role="alert" className="block text-destructive text-xs">Não foi possível abrir o arquivo. Tente novamente.</span>}
  </span>;
}
