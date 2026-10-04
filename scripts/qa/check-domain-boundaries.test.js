import { describe, expect, it } from 'vitest';
import { checkDomainBoundaries } from './check-domain-boundaries.mjs';
describe('architecture ratchet', () => {
  const check = (path, content, baseline = {}) => checkDomainBoundaries([{path, content}], baseline);
  it('blocks newly introduced database imports including aliases', () => {
    expect(check('src/components/New.jsx', "import { nutritionClient as db } from '@/infrastructure/supabase/domainClients'; db.from('foods');")).toHaveLength(1);
  });
  it('blocks growth in a grandfathered component', () => {
    expect(check('src/components/Old.jsx', "db.rpc('a');db.from('b');", {'src/components/Old.jsx':{imports:[],calls:1}})).toHaveLength(1);
  });
  it('blocks dynamic imports and platform-specific domain code', () => {
    expect(check('src/domain/clinical/bad.ts', "import('../other'); const db = import('@/infrastructure/supabase/client'); window.localStorage.setItem('clinical', 'payload');")).not.toHaveLength(0);
    expect(check('src/domain/clinical/bad.ts', "import { x } from '@/components/x';")).not.toHaveLength(0);
    expect(check('src/domain/clinical/bad.ts', "import { x } from '../../infrastructure/x';")).not.toHaveLength(0);
  });
  it('accepts vendor-free domain code and domain API adapters', () => {
    expect(check('src/domain/nutrition/model.ts', "import { z } from 'zod'; export const schema=z.number();")).toEqual([]);
    expect(check('src/features/nutrition/api/foo.js', "import { nutritionClient as db } from '@/infrastructure/supabase/domainClients';db.rpc('authorized');")).toEqual([]);
    expect(check('src/components/New.jsx', "const rows = Array.from([]);")).toEqual([]);
    expect(check('src/main.jsx', "navigator.serviceWorker.register('/cache.js');")).not.toHaveLength(0);
  });
});
