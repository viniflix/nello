import {describe,it,expect} from 'vitest';import * as e from './energy-calculations';
const adult={weight:60,height:165,age:30,gender:'female',leanMass:45,driActivity:'inactive'};
describe('energy calculation cascade: displayed formulas, units and activity arithmetic',()=>{
 it.each([['male',20,1597],['male',30,1575],['male',60,1297],['female',20,1378],['female',30,1351],['female',60,1226]])('keeps FAO age bands and displayed results coherent for %s/%s',(gender,age,expected)=>{
  expect(e.calculateFaoOms1985(60,165,age,gender)).toBeCloseTo(expected);const breakdown=e.getFormulaBreakdown('fao_1985',{...adult,gender,age});expect(breakdown.steps[0].value).toBe(`${expected.toFixed(2)} kcal/dia`);
 });
 it('uses centimeters for Mifflin and meters only in EER',()=>{expect(e.calculateMifflinStJeor(60,165,30,'female')).toBe(1320.25);expect(e.calculateMifflinStJeor(60,165,30,'male')).toBe(1486.25);expect(e.calculateEerIom(60,165,30,1,'female')).toBeCloseTo(1906.2);expect(e.calculateEerIom(60,165,30,1,'male')).toBeCloseTo(2221.04);});
 it('keeps every explanatory formula populated and reports missing inputs explicitly',()=>{
  for(const gender of ['male','female'])for(const method of ['harris','mifflin','cunningham','tinsley','fao','fao_1985','fao_2001','eer_iom']){const breakdown=e.getFormulaBreakdown(method,{...adult,gender});expect(breakdown).not.toBeNull();expect(breakdown.steps.at(-1).value).toMatch(/kcal/);expect(breakdown.appliedStr).not.toMatch(/NaN|undefined/);}
  for(const method of ['harris','mifflin','cunningham','tinsley','fao','fao_1985','fao_2001','eer_iom','unknown'])expect(e.getFormulaBreakdown(method,{})).toBeNull();
 });
 it('normalizes activity frequency and never trusts precomputed MET totals',()=>{
  expect(e.calculateMetKcal(4,60,30)).toBe(120);expect(e.calculateMetKcal(4,60,0)).toBe(0);
  for(const [frequency,expected] of [['daily',240],['weekly',240/7],['monthly',8],['unknown',240/7]])expect(e.calculateActivityExpenditure(4,60,30,2,frequency)).toEqual({kcalPerSession:120,averageDailyKcal:expected});
  expect(e.sumMetsActivitiesKcal([{met:4,duration_min:30,kcal:999}],60).totalKcal).toBe(120);expect(e.sumMetsActivitiesKcal(null,60)).toEqual({totalKcal:0,items:[]});
  expect(e.sumMetsActivitiesAverageDaily([{met:4,duration_min:30,average_daily_kcal:999}],60).totalAverageDailyKcal).toBe(120);expect(e.sumMetsActivitiesAverageDaily(null,60)).toEqual({totalAverageDailyKcal:0,items:[]});
 });
 it('applies activity once and exposes that multiplication for validation',()=>{expect(e.calculateGET(1500,1.2)).toBe(1800);expect(e.getGETBreakdown(1500,1.2).appliedStr).toBe('1500 × 1.2 = 1800');expect(e.getGETBreakdown(0,1.2)).toBeNull();expect(e.getGETBreakdown(1500,1.4,'Personalizado')).not.toBeNull();expect(e.calculateETA(1500)).toBe(150);expect(e.calculateETA(null)).toBe(0);});
 it('preserves legacy protocol dispatch and missing protocol handling',()=>{for(const protocol of ['harris','mifflin','fao_1985'])expect(e.calculateBMRByProtocol(protocol,adult)).toBeGreaterThan(0);expect(e.calculateBMRByProtocol('eer_iom',adult)).toBeNull();expect(e.calculateBMRByProtocol('unknown',adult)).toBeNull();expect(e.getProtocolInfo('unknown')).toBeNull();expect(e.getProtocolInfo('harris').description).toMatch(/acamado/);expect(e.calculateFaoWho(60,165,30,'female')).toBe(1378);expect(e.calculateFaoWho(null)).toBeNull();});
 it('maps the retained legacy activity bands without double multiplication',()=>{for(const [factor,male,female] of [[1.2,1,1],[1.375,1.11,1.12],[1.55,1.25,1.27],[1.9,1.48,1.45]]){expect(e.activityFactorToEerPa(factor,'male')).toBe(male);expect(e.activityFactorToEerPa(factor,'female')).toBe(female);}});
});
