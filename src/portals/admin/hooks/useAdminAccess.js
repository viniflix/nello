import { createContext, useContext } from 'react';

// Standalone consumers retain their server-authorization contract. Routed
// workspaces always receive the gate's synchronous guard, including portals.
export const AdminAccessContext = createContext({ phase: 'authorized', canAct: () => true, getGeneration: () => 0 });
export const useAdminAccess = () => useContext(AdminAccessContext);
