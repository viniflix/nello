import { describe, expect, it } from 'vitest';
import { asCivilDate, asUtcInstant, civilDateInZone, localDateTimeToInstant, civilDateToDate, civilAge } from './date';
import { decimalMoney, netAfterFee, toCents } from './money';
import { splitInstallmentAmounts } from './financial-math';

describe('calendar and instant boundaries', () => {
  it('keeps a civil date and rejects invalid calendar values', () => {
    expect(asCivilDate('2024-02-29')).toBe('2024-02-29');
    expect(() => asCivilDate('2023-02-29')).toThrow();
    expect(() => asCivilDate('2026-10-01T00:00:00Z')).toThrow();
    expect(() => asUtcInstant('2026-10-01T08:00:00')).toThrow();
  });
  it('uses the correct local day at UTC rollover and historical daylight saving', () => {
    expect(civilDateInZone('2026-10-02T01:00:00Z')).toBe('2026-10-01');
    expect(civilDateInZone('2018-12-01T02:30:00Z','America/Sao_Paulo')).toBe('2018-12-01');
    expect(civilDateInZone('2018-12-01T02:30:00Z','America/Fortaleza')).toBe('2018-11-30');
    expect(localDateTimeToInstant('2026-10-01T08:00')).toBe('2026-10-01T11:00:00.000Z');
  });
  it('rejects a nonexistent or ambiguous wall clock during historical DST', () => {
    expect(() => localDateTimeToInstant('2018-11-04T00:30','America/Sao_Paulo')).toThrow();
    expect(() => localDateTimeToInstant('2019-02-16T23:30','America/Sao_Paulo')).toThrow();
  });
  it('displays civil dates and counts completed birthdays without UTC conversion', () => {
    const display=civilDateToDate('1990-01-01');
    expect([display.getFullYear(),display.getMonth(),display.getDate()]).toEqual([1990,0,1]);
    expect(civilAge('1990-10-02','2026-10-01')).toBe(35);
    expect(civilAge('1990-10-02','2026-10-02')).toBe(36);
    expect(civilAge('invalid')).toBeNull();expect(civilAge('2030-01-01','2026-10-01')).toBeNull();
  });
});
describe('exact financial arithmetic', () => {
  it('rounds half up symmetrically without binary floating point errors', () => {
    expect(toCents('1.005')).toBe(101);
    expect(toCents('-1.005')).toBe(-101);
    expect(decimalMoney(0.1+0.2)).toBe('0.30');
    expect(decimalMoney('12,345')).toBe('12.35');
    expect(() => toCents('NaN')).toThrow();
    expect(() => toCents('9007199254740992')).toThrow();
    expect(toCents('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => toCents('90071992547409.915')).toThrow();
  });
  it('matches SQL rounding for net amounts and preserves every installment cent', () => {
    expect(netAfterFee('0.10','5')).toBe(0.10);
    expect(netAfterFee('10.01','2.75')).toBe(9.73);
    expect(splitInstallmentAmounts('100.00',3).reduce((sum,amount)=>sum+toCents(amount),0)).toBe(10000);
    expect(() => netAfterFee('10','101')).toThrow();
  });
});
