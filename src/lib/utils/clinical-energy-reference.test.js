/* global BigInt */
import { describe, expect, it } from 'vitest';
import reference from './__fixtures__/energy-independent-reference.json';
import { energyFormulaTrace } from '../../../supabase/functions/_shared/clinical-energy.js';
import { decimalFraction, exactOperation, roundClinicalFraction } from '../../../supabase/functions/_shared/clinical-arithmetic.js';
import { calculateEnergyPlan } from './energy-planning';
import { INJURY_FACTORS } from '../constants/injury-factors';
import { CLINICAL_MOBILITY_FACTORS } from '../../../supabase/functions/_shared/clinical-factors.js';

describe('published equations versus independent 50-digit Decimal reference', () => {
  it.each(reference.cases)('$method $inputs.gender/$inputs.age/$inputs.driActivity matches independent exact arithmetic', ({ method, inputs, expected }) => {
    const trace = energyFormulaTrace(method, inputs);
    expect(trace).not.toBeNull();
    // This parser is independent of the application decimal parser and evaluator.
    const [whole, decimals = ''] = expected.split('.');
    const numerator = BigInt(whole + decimals), denominator = 10n ** BigInt(decimals.length);
    expect(BigInt(trace.calculationTree.exact.numerator) * denominator)
      .toBe(numerator * BigInt(trace.calculationTree.exact.denominator));
    expect(trace.resultKcal).toBe(Number(expected));
    expect(trace.arithmeticPolicy.intermediateRounding).toBe('none');
    expect(trace.sourceUrl).toMatch(/^https:\/\//);
    expect(JSON.parse(JSON.stringify(trace)).calculationTree.exact).toEqual(trace.calculationTree.exact);
  });
  it.each(['', '70kg', '70..5', true, null, undefined, Infinity, NaN])('refuses invalid biometry %s rather than fabricating a result', weight => {
    for (const method of ['harris','mifflin','fao_1985','cunningham','tinsley','eer_iom','dri_2023'])
      expect(energyFormulaTrace(method, { weight,height:175,age:30,gender:'M',leanMass:50,driActivity:'active' })).toBeNull();
  });
  it('retains fractions for repeating daily adjustments and multiplies without intermediate rounding', () => {
    const result = calculateEnergyPlan({ weight:70,height:175,age:30,gender:'M',protocol:'harris',clinicalMobility:'ambulatory',injuryFactor:1.4,targetWeight:69,timeframeDays:21 });
    // Hand calculation: 1702.0125 × 1.3 × 1.4 − 7700/21 = 3097.66275 − 1100/3.
    expect(result.exactResults.get).toEqual({ numerator:'12390651',denominator:'4000' });
    expect(result.exactResults.adjustment).toEqual({ numerator:'1100',denominator:'3' });
    expect(result.exactResults.planned).toEqual({ numerator:'32771953',denominator:'12000' });
    expect(roundClinicalFraction(result.exactResults.planned)).toBe('2731.00');
  });
});

describe('independent transcription of HUAC-UFCG v1 page 22 tables 16–17', () => {
  // Literal source transcription: expected values never come from the runtime catalog.
  const mobility = [['bedridden', '1.2'], ['ambulatory', '1.3'], ['bedridden_ventilated', '1.1'], ['bedridden_mobile', '1.25']];
  const injuries = [['none','1'],['postoperative_cancer','1.1'],['fractures','1.33'],['trauma_infection','1.79'],['peritonitis','1.4'],['multitrauma_rehabilitation','1.5'],['multitrauma_sepsis','1.6'],['burn_30_50','1.7'],['burn_50_70','1.8'],['burn_70_90','2']];
  const integerDecimal = text => { const [whole, part = ''] = text.split('.'); return [BigInt(whole + part), 10n ** BigInt(part.length)]; };
  it('matches every published factor without retaining undocumented broad diagnoses', () => {
    expect(CLINICAL_MOBILITY_FACTORS).toEqual(Object.fromEntries(mobility.map(([id,value])=>[id,Number(value)])));
    expect(INJURY_FACTORS.map(({id,value})=>[id,String(value)])).toEqual(injuries);
  });
  it.each(['M','F'].flatMap(gender=>mobility.flatMap(([clinicalMobility,m])=>injuries.map(([injuryFactorId,i])=>({gender,clinicalMobility,injuryFactorId,m,i})))))('$gender $clinicalMobility $injuryFactorId reproduces the hand-calculated product', ({gender,clinicalMobility,injuryFactorId,m,i}) => {
    // 70 kg / 175 cm / 30 years: independently computed Harris constants.
    const [basal, basalScale] = integerDecimal(gender === 'M' ? '1702.0125' : '1507.9455');
    const [mn,md] = integerDecimal(m), [inj,id] = integerDecimal(i);
    const plan = calculateEnergyPlan({weight:70,height:175,age:30,gender,protocol:'harris',clinicalMobility,injuryFactorId,injuryFactor:Number(i)});
    expect(plan.valid).toBe(true);
    expect(BigInt(plan.exactResults.get.numerator) * basalScale * md * id)
      .toBe(basal * mn * inj * BigInt(plan.exactResults.get.denominator));
  });
  it.each(['diabetes','cancer','aids','malnutrition','fasting','fever','sepsis','surgery'])('requires explicit reassessment of legacy diagnosis %s', injuryFactorId => {
    expect(calculateEnergyPlan({weight:70,height:175,age:30,gender:'M',protocol:'harris',clinicalMobility:'bedridden',injuryFactorId,injuryFactor:1.4}).valid).toBe(false);
  });
});

describe('exact decimal and explicitly versioned rounding', () => {
  it.each([['1.005','1.01'],['-1.005','-1.01'],['2.675','2.68'],['0.0049','0.00'],['-0.0001','0.00']])('rounds %s as the written decimal', (input, expected) => {
    expect(roundClinicalFraction(decimalFraction(input))).toBe(expected);
  });
  it('adds decimal tenths exactly and supports finite numeric exponents', () => {
    expect(exactOperation('add',[decimalFraction('0.1'),decimalFraction('0.2')])).toEqual({numerator:'3',denominator:'10'});
    expect(decimalFraction(1e-7)).toEqual({numerator:'1',denominator:'10000000'});
    expect(decimalFraction('72,35')).toEqual({numerator:'1447',denominator:'20'});
  });
  it('rejects invalid expressions and abusive precision', () => {
    for (const input of [null,true,'','NaN','1kg','1e999','1'.repeat(65)]) expect(()=>decimalFraction(input)).toThrow();
    expect(()=>exactOperation('divide',[decimalFraction(1),decimalFraction(0)])).toThrow();
    expect(()=>exactOperation('unknown',[decimalFraction(1),decimalFraction(2)])).toThrow();
    expect(()=>exactOperation('add',[])).toThrow();
    expect(()=>roundClinicalFraction(decimalFraction(1),99)).toThrow();
  });
});
