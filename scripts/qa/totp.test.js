import { it, expect } from 'vitest';import {totp} from './totp.mjs';
it('matches the published RFC 6238 SHA-1 vector at 59 seconds',()=>expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59000)).toBe('287082'));
