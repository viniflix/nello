import {describe,expect,it} from 'vitest';
import {notificationCursorFilter} from './notification-cursor';
describe('notification keyset boundaries',()=>{
 it('preserves six timestamp decimals and large integer IDs without JS precision loss',()=>{
  expect(notificationCursorFilter({time:'2026-10-02T10:11:12.123456+00:00',id:'9223372036854775806'})).toBe('created_at.lt.2026-10-02T10:11:12.123456+00:00,and(created_at.eq.2026-10-02T10:11:12.123456+00:00,id.lt.9223372036854775806)');
 });
 it.each([{time:'not a date',id:'1'},{time:'2026-10-02T10:11:12Z',id:'1),user_id.neq.x'},{time:'2026-10-02T10:11:12Z,or',id:'1'}])('rejects malformed or injected boundary: %j',cursor=>expect(()=>notificationCursorFilter(cursor)).toThrow('INVALID_NOTIFICATION_CURSOR'));
});
