import { describe, expect, it } from 'vitest';
import { patientWeightHistory, patientGlycemiaHistory } from './patientIndicators';

describe('canonical patient indicator history', () => {
  it('never converts missing, invalid or zero weight into a current measurement', () => {
    const invalid = [null, '', 'bad', false, 0, Infinity, NaN].map((weight, id) => ({ id, weight, record_date: '2026-10-22' }));
    const rows = [...invalid, { id: 'valid', weight: '71.5', record_date: '2026-10-20' }];
    expect(patientWeightHistory(rows)).toEqual([{ id: 'valid', weight: 71.5, record_date: '2026-10-20' }]);
    expect(rows.at(-1).weight).toBe('71.5');
  });

  it('orders both origins by measurement date, creation, origin and stable identity', () => {
    const rows = [
      { id: 'self', source: 'patient', weight: 71, record_date: '2026-10-21' },
      { id: 'clinical', source: 'clinical', weight: 70, record_date: '2026-10-21' },
      { id: 'newer', source: 'patient', weight: 72, record_date: '2026-10-22' },
    ];
    expect(patientWeightHistory(rows).map(r => r.id)).toEqual(['newer', 'clinical', 'self']);
    expect(patientWeightHistory([...rows].reverse()).map(r => r.id)).toEqual(['newer', 'clinical', 'self']);
  });

  it('ignores superseded clinical revisions and invalid measurement dates', () => {
    const base = { source: 'clinical', weight: 70, record_date: '2026-10-22' };
    expect(patientWeightHistory([
      { ...base, status: 'invalidated' }, { ...base, is_latest_revision: false },
      { ...base, record_date: 'invalid' }, { ...base, id: 'current', status: 'active', is_latest_revision: true },
    ]).map(r => r.id)).toEqual(['current']);
  });

  it('uses the existing mg/dL validation for glucose instead of accepting invalid values', () => {
    expect(patientGlycemiaHistory([
      { id: 'invalid', value: null, date: '2026-10-23' },
      { id: 'out-of-range', value: 1000, date: '2026-10-22' },
      { id: 'valid', value: '99', date: '2026-10-21' },
    ])).toEqual([{ id: 'valid', value: 99, date: '2026-10-21' }]);
  });
});

it('rejects impossible civil dates and non-numeric coercions without mutating rows',()=>{
 const rows=[{id:'bad-date',weight:80,record_date:'2026-02-30'},{id:'bool',weight:true,record_date:'2026-10-23'},{id:'negative',weight:-1,record_date:'2026-10-23'},{id:'array',weight:[70],record_date:'2026-10-23'},{id:'valid',weight:70,record_date:'2026-02-28'}];
 expect(patientWeightHistory(rows).map(row=>row.id)).toEqual(['valid']);
 expect(rows[0].record_date).toBe('2026-02-30');
});
it('uses creation time before origin and stable ids when dates match',()=>{
 const common={weight:70,record_date:'2026-10-22'};
 const rows=[{...common,id:'z',source:'clinical',created_at:'2026-10-22T10:00:00Z'},{...common,id:'a',source:'clinical',created_at:'2026-10-22T10:00:00Z'},{...common,id:'patient',source:'patient',created_at:'2026-10-22T11:00:00Z'}];
 expect(patientWeightHistory(rows).map(row=>row.id)).toEqual(['patient','a','z']);
 expect(patientWeightHistory([...rows].reverse()).map(row=>row.id)).toEqual(['patient','a','z']);
});

it('keeps numeric database identity order consistent with bounded latest-row queries',()=>{
 const rows=['10','3','2'].map(id=>({id,source:'clinical',weight:70,record_date:'2026-10-22'}));
 expect(patientWeightHistory(rows).map(row=>row.id)).toEqual(['2','3','10']);
});

it('keeps UUID identity order lexical for glucose, matching its database query',()=>{
 const rows=['0a000000-0000-4000-8000-000000000001','01000000-0000-4000-8000-000000000001'].map(id=>({id,value:99,date:'2026-10-22'}));
 expect(patientGlycemiaHistory(rows).map(row=>row.id)).toEqual(['01000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-000000000001']);
});
