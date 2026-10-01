import { afterEach, expect, it } from 'vitest';
import { clearPasswordReminders, dismissPasswordReminder, hasDismissedPasswordReminder } from './passwordReminder';
afterEach(clearPasswordReminders);
it('keeps the optional choice scoped to the current account and clears on session exit', () => {
  expect(hasDismissedPasswordReminder('a')).toBe(false);
  dismissPasswordReminder('a'); expect(hasDismissedPasswordReminder('a')).toBe(true);
  expect(hasDismissedPasswordReminder('b')).toBe(false);
  clearPasswordReminders(); expect(hasDismissedPasswordReminder('a')).toBe(false);
});
