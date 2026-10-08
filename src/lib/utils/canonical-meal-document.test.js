import {describe,expect,it} from 'vitest';
import {canonicalDocument,boundedClinicalLines} from '../../../supabase/functions/_shared/clinical-document.js';

const artifact=()=>({id:'synthetic-artifact',status:'signed',sha256:'a'.repeat(64),signed_at:'2026-10-08',authenticity_code:'synthetic-verification',
  canonical_payload:{layout:{code:'meal_plan',version:1},professional:{name:'Profissional fictício',normalized_crn:'QA'},patient:{name:'Paciente fictício'},content:{
    title:'PLANO ALIMENTAR',plan_name:'Orientação congelada',issued_on:'2026-10-08',
    diet_characteristics:{mode:'hybrid',description:'Orientação salva',active_days:['monday','friday'],start_date:'2026-10-08'},
    nutritional_targets:{energy_kcal:120,protein_g:10,carbohydrate_g:20,fat_g:0},
    meals:[{name:'Café',time:'08:00:00',notes:'Nota da refeição',include_in_totals:true,foods:[{name:'Nome do catálogo',patient_description:'Descrição para o paciente',quantity:2,unit:'10000000-0000-4000-8000-000000000001',measure_snapshot:{label:'Colher de sopa',weight_in_grams:15},calories:120,protein:10,carbs:20,fat:0,notes:'Nota do alimento',substitutes:[{name:'Alternativa salva',quantity:1,unit:'slice',notes:'Nota da opção'}]}]},
      {name:'Opção para jantar',time:'20:00:00',include_in_totals:false,foods:[{name:'Alimento alternativo',quantity:100,unit:'gram',calories:300}]}],
    professional_confirmation:{responsible_id:'internal-owner',prepared_by:'internal-preparer'},source_snapshot:{internal_field:'private-source'}
  }}});

describe('official frozen meal-plan document presentation',()=>{
  it('bounds long saved paragraphs without cutting ordinary words or dropping long-token content',()=>{
    const paragraph='Orientação clínica congelada. '.repeat(100).trim();
    const lines=boundedClinicalLines([paragraph,'', 'W'.repeat(2100)]);
    expect(lines.every(line=>line.length<=900)).toBe(true);
    expect(boundedClinicalLines([paragraph]).join(' ')).toBe(paragraph);
    expect(lines.join('').split('W').length-1).toBe(2100);
  });
  it('renders saved prescription with readable days, portions, notes and alternatives, without exposing internal JSON fields',()=>{
    const output=canonicalDocument(artifact()).lines.join('\n');
    for(const value of ['Orientação congelada','Descrição para o paciente','2 Colher de sopa','Nota do alimento','Nota da opção','Alternativa salva','Segunda-feira','Sexta-feira','não contabilizada','120 kcal','0 g','synthetic-verification','Status: Assinado','Nello'])expect(output).toContain(value);
    for(const value of ['internal-owner','internal-preparer','private-source','professional_confirmation','source_snapshot','active_days','nutritional_targets','10000000-0000-4000-8000-000000000001'])expect(output).not.toContain(value);
  });
  it('does not replace absent historical composition or measures with current data or fabricated zero',()=>{
    const sample=artifact();sample.canonical_payload.content.meals=[{name:'Histórica',foods:[{name:'Alimento salvo',quantity:3,unit:'10000000-0000-4000-8000-000000000001',calories:null,protein:0}]}];
    const before=JSON.stringify(sample),output=canonicalDocument(sample).lines.join('\n');
    expect(output).toContain('medida não registrada');expect(output).toContain('Não registrado');expect(output).toContain('0 g');expect(output).not.toContain('null');expect(JSON.stringify(sample)).toBe(before);
  });
  it('preserves stored totals rather than recomputing signed history from a later engine',()=>{
    const sample=artifact();sample.canonical_payload.content.nutritional_targets.energy_kcal=121.25;
    expect(canonicalDocument(sample).lines.join('\n')).toContain('121,25 kcal');
  });
  it('labels reference composition separately from prescribed portion, retaining known zero and unknown sodium',()=>{
    const sample=artifact();sample.canonical_payload.content.meals[0].foods[0].food_snapshot={fiber:0,portion_size:100,base_unit:'g'};
    const output=canonicalDocument(sample).lines.join('\n');
    expect(output).toContain('por 100 g: Fibras: 0 g; Sódio: Não registrado mg');expect(output).toContain('não totais da porção prescrita');
  });
  it('makes an empty historical prescription explicit without fabricating meals or dates',()=>{
    const sample=artifact();sample.canonical_payload.content={title:'Plano antigo'};
    const output=canonicalDocument(sample).lines.join('\n');
    expect(output).toContain('Nenhuma refeição registrada');expect(output).toContain('Dias: não registrados');expect(output).toContain('Vigência: Não registrada');
  });
  it('preserves empty meals, unnamed alternatives and unknown days as missing data',()=>{
    const sample=artifact();sample.canonical_payload.content.diet_characteristics={active_days:['unknown'],start_date:'2026-10-08',end_date:'2026-10-09'};
    sample.canonical_payload.content.meals=[{}, {foods:[{quantity:0,unit:'gram',calories:'invalid',protein:'',substitutes:[{}]}]}];
    const output=canonicalDocument(sample).lines.join('\n');
    for(const value of ['Dia não registrado','09/10/2026','Nenhum alimento registrado','Horário não registrado','porção não registrada','Não registrado kcal'])expect(output).toContain(value);
  });
  it('keeps canonical depth limits for meal documents and never renders unsafe HTML',()=>{
    const sample=artifact();let deep={};for(let i=0;i<14;i++)deep={nested:deep};sample.canonical_payload.content.source_snapshot=deep;
    expect(()=>canonicalDocument(sample)).toThrow('deep');
    sample.canonical_payload.content.source_snapshot={};sample.canonical_payload.content.diet_characteristics.description='<p>Texto &amp; orientação</p>';
    expect(canonicalDocument(sample).lines.join('\n')).toContain('Texto & orientação');expect(canonicalDocument(sample).lines.join('\n')).not.toContain('<p>');
  });
});
