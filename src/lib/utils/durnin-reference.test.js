import { describe, expect, it } from 'vitest';
import { calculateBodyDensity, calculateBodyDensityDurnin, calculateBodyFatPercent } from './anthropometry-calculations';

// Independent transcription of original Table 5 (1974), all four sites, log10.
const rows = [
  [true,17,19,1.1620,.0630], [true,20,29,1.1631,.0632], [true,30,39,1.1422,.0544],
  [true,40,49,1.1620,.0700], [true,50,72,1.1715,.0779],
  [false,16,19,1.1549,.0678], [false,20,29,1.1599,.0717], [false,30,39,1.1423,.0632],
  [false,40,49,1.1333,.0612], [false,50,68,1.1339,.0645],
];
describe('Durnin & Womersley original age-specific four-fold equations', () => {
  it.each(rows.flatMap(([sex,start,end,c,m]) => [start,end].map(age => [sex,age,c,m])))
    ('matches hand calculation at sex=%s age=%s', (sex,age,c,m) => {
      // 25 mm at each site: log10(100)=2, so no logarithm approximation in oracle.
      const density = calculateBodyDensityDurnin(25,25,25,25,sex,age);
      expect(density).toBeCloseTo(c-m*2,14);
      expect(calculateBodyFatPercent(density)).toBeCloseTo(495/(c-m*2)-450,11);
      expect(calculateBodyDensity({triceps:25,biceps:25,subescapular:25,suprailiaca:25},age,sex,'durnin')).toBe(density);
    });
  it.each([[true,16],[true,73],[false,15],[false,69],[null,30],[true,30.5],[true,null]])
    ('rejects unavailable or out-of-population sex=%s age=%s', (sex,age) => {
      expect(calculateBodyDensityDurnin(25,25,25,25,sex,age)).toBeNull();
    });
  it.each([0,-1,null,'12mm','',Infinity,101])('rejects invalid folds %s', fold => {
    expect(calculateBodyDensityDurnin(fold,25,25,25,true,30)).toBeNull();
  });
});
