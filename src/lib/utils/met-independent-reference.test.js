import { expect, it } from 'vitest';
import { PHYSICAL_ACTIVITIES } from '../constants/physical-activities';
import { calculateMetKcal, calculateActivityExpenditure } from './energy-calculations';
// Hand references: a 70 kg adult, 30 minutes. Published MET * 70 * 0.5.
// Specific codes refer to the primary 2024 Adult Compendium, not a competitor.
const reference=[['07030',35],['11580',52.5],['17170',105],['17200',168],['02056',105],['02054',122.5],['02050',210],['12030',297.5],['12050',325.5],['15610',245],['15605',332.5],['15040',280],['18292',203],['02175',80.5],['02000',255.5],['01015',150.5],['01016',245],['01017',315],['02105',98],['02101',80.5],['02048',175],['02071',175],['02068',385],['17080',210],['12080',413],['18310',210],['02120',185.5],['02210',245],['02035',175],['17131',238],['05040',87.5],['05020',122.5],['08245',133],['11600',63]];
it.each(reference)('activity code %s matches the independent hand reference %s kcal', (code,expected)=>{
 const activity=PHYSICAL_ACTIVITIES.find(row=>row.code===code);
 expect(activity).toBeDefined();expect(activity.reference).toMatch(/^https:\/\/pacompendium.com\//);
 expect(calculateMetKcal(activity.met,70,30)).toBe(expected);
});
it('matches hand frequency references and rejects nonfinite or partially parsed frequencies',()=>{
 expect(calculateActivityExpenditure(5,70,30,3,'weekly').averageDailyKcal).toBe(75);
 expect(calculateActivityExpenditure(5,70,30,6,'monthly').averageDailyKcal).toBe(35);
 expect(calculateActivityExpenditure(5,70,30,.1,'daily').averageDailyKcal).toBe(17.5);
 for(const invalid of [Infinity,'3abc',-1])expect(calculateActivityExpenditure(5,70,30,invalid,'weekly').averageDailyKcal).toBe(0);
});
