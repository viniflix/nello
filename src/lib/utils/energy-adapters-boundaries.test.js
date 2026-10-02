import { expect, it } from 'vitest';
import * as e from './energy-calculations';
import * as dri from './dri-energy';
import { energyCalculationNeedsVentaReview, restoreEnergyInputs } from './energy-planning';
it('retains numeric legacy readers across all published age-band dispatches',()=>{
 for(const gender of ['male','female'])for(const age of [20,40,70]){
  const w=60,h=165,m=gender==='male';
  const expected=m?(age<30?15.4*w-27*h/100+717:age<60?11.3*w+16*h/100+901:8.8*w+1128*h/100-1071):(age<30?13.3*w+334*h/100+35:age<60?8.7*w-25*h/100+865:9.2*w+637*h/100-302);
  expect(e.calculateFaoOms2001(w,h,age,gender)).toBeCloseTo(expected,10);
  expect(e.getFormulaBreakdown('fao_2001',{weight:w,height:h,age,gender}).steps[0].value).toBe(`${expected.toFixed(0)} kcal`);
 }
});
it('rejects invalid EER coefficients and displays actual age-specific DRI arithmetic',()=>{
 expect(e.calculateEerIom(60,165,30,1.1,'F')).toBeNull();
 expect(e.calculateEerIom(60,165,18,1,'F')).toBeNull();
 expect(dri.dri2023Breakdown({weight:60,height:165,age:30,gender:'F'},'inactive').resultKcal).toBe(584.9-7.01*30+5.72*165+11.71*60);
 expect(dri.driActivityOptionLabel('unknown','eer_iom','F')).toBe('');
 expect(dri.driActivityOptionLabel('inactive','eer_iom','F')).toContain('PA 1');
 expect(dri.driActivityOptionLabel('active','dri_2023','F')).toBe('Ativo');
});
it('requires auditable confirmation before reusing historical weight targets',()=>{
 for(const saved of [null,{}, {weight:70,venta_target_weight:70,venta_timeframe_days:30},{weight:70,venta_target_weight:69,venta_timeframe_days:30,input_snapshot:{venta_review:{confirmed:true}}}])expect(energyCalculationNeedsVentaReview(saved)).toBe(false);
 for(const weight of [null,'invalid',70])expect(energyCalculationNeedsVentaReview({weight,venta_target_weight:69,venta_timeframe_days:30})).toBe(true);
 expect(restoreEnergyInputs(null).requiresReview).toBe(false);
});
it('does not accept nonfinite or out-of-bounds METs or GET inputs',()=>{
 for(const args of [[0,70,30],[101,70,30],[4,301,30],[4,70,1441],['bad',70,30]])expect(e.calculateMetKcal(...args)).toBe(0);
 for(const args of [[0,1.4],[1500,0],[1500,1.4,0],[Infinity,1.4]])expect(e.calculateGET(...args)).toBeNull();
 expect(e.getGETBreakdown(1000,'bad')).toBeNull();
 expect(e.calculateActivityExpenditure(4,70,30,0,'weekly').averageDailyKcal).toBe(0);
 expect(e.calculateActivityExpenditure(4,70,30,0,'monthly').averageDailyKcal).toBe(0);
 expect(e.sumMetsActivitiesKcal([{met:4}],70).totalKcal).toBe(0);
 expect(e.sumMetsActivitiesAverageDaily([{met:4,frequency_type:'weekly'}],70).totalAverageDailyKcal).toBe(0);
});
