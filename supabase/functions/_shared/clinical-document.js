import { roundClinicalFraction } from './clinical-arithmetic.js';
import { calculateEnergyPlan, ENERGY_ENGINE_VERSION } from './clinical-energy-plan.js';

const text = value => String(value ?? '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const describe = (value, depth = 0) => {
  if (depth > 12) throw new Error('document_too_deep');
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(item=>describe(item, depth+1)).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([key,item])=>`${key}: ${describe(item,depth+1)}`).join('\n');
  return text(value);
};
/** Bound saved text without splitting ordinary words at arbitrary character offsets. */
export function boundedClinicalLines(lines) {
  return lines.flatMap(value=>{
    const chunks=[];let current='';
    for(const word of String(value).trim().split(/\s+/)) {
      for(const part of word.match(/.{1,900}/g) || ['']) {
        if(current && current.length+part.length+1>900){chunks.push(current);current='';}
        current+=`${current ? ' ' : ''}${part}`;
      }
    }
    chunks.push(current);return chunks;
  });
}
export const energyInputsFromSnapshot = row => {
  const input = row.input_snapshot || {};
  return { weight:input.weight_kg, height:input.height_cm, age:input.age_years, gender:input.sex,
    leanMass:input.lean_mass_kg, protocol:row.tmb_protocol, activityFactor:input.activity_factor,
    injuryFactor:input.injury_factor, injuryFactorId:input.injury_factor_id, clinicalMobility:input.clinical_mobility,
    driActivity:input.dri_activity, lifeStage:input.life_stage,
    targetWeight:input.venta_target_weight,timeframeDays:input.venta_timeframe_days };
};
/** Stored evaluation, never recalculated with a newer engine when exporting history. */
export function energyDocument(row) {
  if (!row?.id) throw new Error('saved_calculation_required');
  let details = row.output_snapshot?.calculation_details;
  if (Number(row.source_snapshot?.engine_version) === ENERGY_ENGINE_VERSION) {
    const calculated = calculateEnergyPlan(energyInputsFromSnapshot(row));
    const matchesExact = details?.exactResults && ['tmb','get','adjustment','planned'].every(key => {
      const stored = details.exactResults[key], expected = calculated.exactResults[key];
      return expected === null ? stored === null : stored?.numerator === expected.numerator && stored?.denominator === expected.denominator;
    });
    const matchesNumeric = [[row.tmb_result,calculated.tmbResult], [row.get_result,calculated.getResult],
      [row.venta_adjustment_kcal,calculated.ventaAdjustmentKcal], [row.final_planned_kcal,calculated.finalPlannedKcal]]
      .every(([stored,expected])=>expected === null ? stored === null : Number.isFinite(Number(stored)) && stored != null && Math.abs(Number(stored)-expected)<=1e-8);
    if (!calculated.valid || !matchesExact || !matchesNumeric)
      throw new Error('saved_calculation_integrity_failed');
    details = calculated;
  }
  const exact = details?.exactResults;
  const display = (key,value) => exact?.[key] ? roundClinicalFraction(exact[key]) : value == null ? 'Não registrado' : String(value);
  return { title:'Memória de cálculo energético',fileName:`nello-energia-${row.id}.pdf`,lines:[
    `Registro: ${row.id}`, `Salvo em: ${row.created_at || 'Não registrado'}`,
    `Motor: ${row.source_snapshot?.engine_version ?? 'legado'}; protocolo: ${row.tmb_protocol || row.protocol}`,
    `Paciente (ID): ${row.patient_id}`, `Peso: ${row.weight} kg; altura: ${row.height} cm; idade: ${row.age} anos; sexo da equação: ${row.gender}`,
    `Origem dos valores: ${describe(row.input_snapshot?.biometry_sources || 'Não registrada no histórico')}`,
    `TMB: ${display('tmb',row.tmb_result ?? row.tmb)} kcal/dia`,
    `GET: ${display('get',row.get_result ?? row.get)} kcal/dia`,
    `Ajuste VENTA: ${display('adjustment',row.venta_adjustment_kcal ?? 0)} kcal/dia`,
    `VET: ${display('planned',row.final_planned_kcal ?? row.get_result ?? row.get)} kcal/dia`,
    details?.formula?.formulaName || 'Fórmula não registrada nesta versão',details?.formula?.equationStr,
    details?.formula?.appliedStr,details?.totalEquation,details?.appliedTotal,details?.finalEquation,
    `Referência: ${details?.formula?.sourceUrl || row.source_snapshot?.formula_reference?.url || 'Não registrada'}`,
    details?.activityReference ? `PAL: ${details.activityReference.title}; ${details.activityReference.url}` : '',
    row.source_snapshot?.clinical_factor_reference ? `Fatores: ${row.source_snapshot.clinical_factor_reference.title}; ${row.source_snapshot.clinical_factor_reference.url}` : '',
    'Valores do registro salvo, sem alterar ou recalcular o histórico. Arredondamento somente no resumo; a memória preserva os operandos.',
    'Estimativa energética sujeita à variabilidade individual. VENTA usa aproximação estática de 7.700 kcal/kg, não uma previsão garantida de peso.',
  ].filter(Boolean).flatMap(line=>String(line).split('\n')) };
}
const recordedNumber = value => value == null || value === '' || !Number.isFinite(Number(value))
  ? 'Não registrado' : Number(value).toLocaleString('pt-BR',{maximumFractionDigits:8});
const civilDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value).split('-').reverse().join('/') : text(value || 'Não registrada');
/** Project only frozen fields. Missing historical fields never consult today's plan. */
export function canonicalMealPlanLines(content) {
  describe(content); // Preserve the depth bound for all canonical document kinds.
  const diet=content.diet_characteristics || {}, totals=content.nutritional_targets || {};
  const days={monday:'Segunda-feira',tuesday:'Terça-feira',wednesday:'Quarta-feira',thursday:'Quinta-feira',friday:'Sexta-feira',saturday:'Sábado',sunday:'Domingo'};
  const macros=(row,energy='calories',protein='protein',carbs='carbs',fat='fat') =>
    `${recordedNumber(row[energy])} kcal; Proteínas: ${recordedNumber(row[protein])} g; Carboidratos: ${recordedNumber(row[carbs])} g; Gorduras: ${recordedNumber(row[fat])} g`;
  const lines=['Nello · Prescrição alimentar',text(content.plan_name || 'Plano alimentar'),`Emissão: ${civilDate(content.issued_on)}`,
    `Vigência: ${civilDate(diet.start_date)} até ${diet.end_date ? civilDate(diet.end_date) : 'prazo indeterminado'}`,
    Array.isArray(diet.active_days) && diet.active_days.length ? `Dias: ${diet.active_days.map(day=>days[day] || 'Dia não registrado').join(', ')}` : 'Dias: não registrados',
    text(diet.description || ''),'Totais diários registrados',macros(totals,'energy_kcal','protein_g','carbohydrate_g','fat_g')];
  for(const meal of content.meals || []) {
    lines.push(`${text(meal.time ? String(meal.time).slice(0,5) : 'Horário não registrado')} · ${text(meal.name || 'Refeição')}`,
      meal.include_in_totals===false ? 'Refeição alternativa — não contabilizada nos totais.' : '',text(meal.notes || ''));
    for(const food of meal.foods || []) {
      lines.push(`${text(food.patient_description || food.name || 'Alimento')}: ${prescriptionQuantity(food)}`,
        macros(food),text(food.notes || ''));
      const composition=food.food_snapshot;
      if(composition)lines.push(
        `Composição do catálogo por ${recordedNumber(composition.portion_size ?? 100)} ${text(composition.base_unit || 'g')}: Fibras: ${recordedNumber(composition.fiber)} g; Sódio: ${recordedNumber(composition.sodium)} mg. Valores de referência, não totais da porção prescrita.`);
      else lines.push('Composição de fibras e sódio não registrada neste documento.');
      for(const option of food.substitutes || [])lines.push(
        `Opção: ${text(option.name || option.food_snapshot?.name || 'Alimento alternativo')}${option.quantity != null ? ': '+prescriptionQuantity(option) : ' — porção não registrada'}`,
        text(option.notes || ''));
    }
    if(!meal.foods?.length)lines.push('Nenhum alimento registrado nesta refeição.');
  }
  if(!content.meals?.length)lines.push('Nenhuma refeição registrada neste documento.');
  lines.push('Prescrição do documento salvo. Composição ausente não equivale a zero; dados históricos não são recalculados.');
  return lines;
}
export function canonicalDocument(artifact) {
  if (!artifact?.id || !artifact.canonical_payload || !artifact.sha256) throw new Error('canonical_document_required');
  const payload = artifact.canonical_payload, content = payload.content || {};
  const professional = payload.professional || {}, patient = payload.patient || {};
  return {title:text(content.title || 'Documento clínico'), fileName:`nello-documento-${artifact.id}.pdf`,lines:[
    professional.clinic_name || '', `${professional.name || 'Profissional responsável'} ${professional.normalized_crn || ''}`,
    `Paciente: ${patient.name || 'Não informado'}`,patient.birth_date ? `Nascimento: ${patient.birth_date}` : '',
    ...(payload.layout?.code==='meal_plan' ? canonicalMealPlanLines(content) : Object.entries(content).filter(([key])=>!['title','source_canonical_hash'].includes(key)).map(([key,value])=>`${key}: ${describe(value)}`)),
    `Status: ${payload.layout?.code==='meal_plan' ? ({draft:'Rascunho',finalized:'Finalizado',signed:'Assinado',invalidated:'Invalidado',superseded:'Substituído'}[artifact.status] || 'Não registrado') : artifact.status}`,artifact.signed_at ? `Assinado em: ${artifact.signed_at}` : '',
    artifact.authenticity_code ? `Autenticidade: ${artifact.authenticity_code}` : '', `SHA-256 canônico: ${artifact.sha256}`,
  ].filter(Boolean).flatMap(line=>String(line).split('\n'))};
}
export function storedClinicalDocument(kind, records, identity={}) {
  const row=records[0];
  if (!row?.id) throw new Error('saved_document_required');
  if (kind==='anthropometryRecordId' && (records.length!==2 || records[1].patient_id!==row.patient_id)) throw new Error('comparison_scope_required');
  const labels={mealPlanId:'Plano alimentar',anamnesisRecordId:'Anamnese',anthropometryRecordId:'Comparativo antropométrico'};
  const lines=[`Paciente: ${identity.patientName || row.patient_id || 'Modelo sem paciente'}`,
    identity.professionalName ? `Profissional: ${identity.professionalName}` : '',
    'Exportação de registros salvos; valores históricos preservados.'];
  for(const record of records){
    lines.push(`Registro: ${record.id}; data: ${record.date || record.record_date || record.created_at || 'Não registrada'}`);
    if(kind==='mealPlanId') {
      lines.push(record.name || '',record.description || '');
      for(const meal of [...(record.meal_plan_meals || [])].sort((a,b)=>(a.order_index??0)-(b.order_index??0))) {
        lines.push(`${meal.name || meal.meal_type || 'Refeição'} ${meal.meal_time || ''}`,meal.notes || '');
        for(const food of [...(meal.meal_plan_foods || [])].sort((a,b)=>(a.order_index??0)-(b.order_index??0))) {
          lines.push(`${food.patient_description || food.food?.name || 'Alimento'}: ${prescriptionQuantity(food)}`,
            identity.includeNutrients!==false ? `Energia salva: ${food.calories} kcal; proteína: ${food.protein} g; carboidratos: ${food.carbs} g; gordura: ${food.fat} g` : '',
            food.notes || '',food.substitutes?.length ? `Substituições: ${food.substitutes.map(sub => `${sub.name || 'Alternativa'}${sub.quantity != null ? `: ${prescriptionQuantity(sub)}` : ''}`).join('; ')}` : '');
        }
      }
    } else if(kind==='anamnesisRecordId') lines.push(describe(record.content),record.notes || '');
    else lines.push(`Peso: ${record.weight} kg; altura: ${record.height} cm`,describe(record.results),describe(record.circumferences),describe(record.skinfolds),record.notes || '');
  }
  return {title:labels[kind],fileName:`nello-${kind}-${row.id}.pdf`,lines:lines.filter(Boolean).flatMap(line=>String(line).split('\n'))};
}

export function prescriptionQuantity(food) {
  const unit=String(food.unit || 'g');
  const snapshot=food.measure_snapshot || food.measure;
  const names={g:'g',gram:'g',grams:'g',ml:'ml',unit:'unidade',slice:'fatia',tablespoon:'colher de sopa',teaspoon:'colher de chá',portion:'porção',cup:'xícara'};
  const rawLabel=snapshot?.name || snapshot?.label || snapshot?.measure_label || names[unit] || unit;
  const technical=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(rawLabel) || /^\d+$/.test(rawLabel) || rawLabel.startsWith('custom_');
  const label=technical ? 'porção (medida não registrada)' : rawLabel;
  const quantity=Number(food.quantity);
  return `${Number.isFinite(quantity) ? quantity.toLocaleString('pt-BR',{maximumFractionDigits:3}) : '—'} ${label}`;
}

/** Layout consumes only the stored record fetched with the caller's JWT. */
export async function renderMealPlanPdf({PDFDocument,StandardFonts,rgb}, record, identity={}) {
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe=value=>text(value).replace(/[^\x20-\x7E\xA0-\xFF]/g,' ').replace(/\s+/g,' ').trim();
  const green=rgb(.25,.39,.2), ink=rgb(.16,.18,.16), muted=rgb(.4,.43,.4);
  let page, y;
  const width=499, left=48;
  const newPage=()=>{
    if(pdf.getPageCount()>=50)throw Error('pdf_too_large');
    page=pdf.addPage([595.28,841.89]); y=793;
    for(const line of wrap(record.name || 'Plano alimentar',width,17,bold).slice(0,3)) {
      page.drawText(line,{x:left,y,size:17,font:bold,color:green});y-=22;
    }
    for(const line of wrap(`Paciente: ${identity.patientName || 'Não informado'}`,width,10).slice(0,3)) {
      page.drawText(line,{x:left,y,size:10,font:regular,color:muted});y-=15;
    }
    y-=13;
  };
  const ensure=height=>{if(y-height<60)newPage();};
  const wrap=(value,maxWidth,size=10,font=regular)=>{
    const result=[];let line='';
    for(const word of safe(value).split(' ')) {
      const next=line ? `${line} ${word}` : word;
      if(font.widthOfTextAtSize(next,size)<=maxWidth)line=next;
      else {if(line)result.push(line);line='';for(const char of word){if(font.widthOfTextAtSize(line+char,size)>maxWidth){result.push(line);line='';}line+=char;}}
    }
    if(line)result.push(line);return result;
  };
  const paragraph=(value,{size=10,color=ink,font=regular,indent=0}={})=>{
    for(const line of wrap(value,width-indent,size,font)){ensure(size+5);page.drawText(line,{x:left+indent,y,size,font,color});y-=size+5;}
  };
  newPage();
  if(identity.professionalName)paragraph(`Nutricionista: ${identity.professionalName}`,{color:muted});
  if(record.description){paragraph(record.description);y-=8;}
  for(const meal of [...(record.meal_plan_meals || [])].sort((a,b)=>(a.order_index??0)-(b.order_index??0))) {
    const mealTitle=`${meal.meal_time ? String(meal.meal_time).slice(0,5)+' · ' : ''}${meal.name || 'Refeição'}`;
    const headings=wrap(mealTitle,width-20,12,bold);
    const headingHeight=Math.max(28,headings.length*16+12);
    ensure(Math.max(90,headingHeight+35));
    page.drawRectangle({x:left,y:y-headingHeight+12,width,height:headingHeight,color:rgb(.94,.96,.92)});
    for(const heading of headings){page.drawText(heading,{x:left+10,y,size:12,font:bold,color:green});y-=16;}y-=12;
    if(meal.include_in_totals===false)paragraph('Refeição alternativa - não contabilizada nos totais',{color:muted,size:9});
    for(const food of [...(meal.meal_plan_foods || [])].sort((a,b)=>(a.order_index??0)-(b.order_index??0))) {
      ensure(65);
      paragraph(food.patient_description || food.food_snapshot?.name || food.food?.name || 'Alimento',{font:bold});
      paragraph(prescriptionQuantity(food),{indent:10});
      if(identity.includeNutrients!==false)paragraph(`${Math.round(Number(food.calories || 0))} kcal  |  P ${Math.round(Number(food.protein || 0))} g  |  C ${Math.round(Number(food.carbs || 0))} g  |  G ${Math.round(Number(food.fat || 0))} g`,{indent:10,color:muted,size:9});
      if(food.notes)paragraph(food.notes,{indent:10,size:9});
      for(const sub of food.substitutes || [])paragraph(`ou ${sub.name || 'Alternativa'}${sub.quantity!=null ? ': '+prescriptionQuantity(sub) : ''}`,{indent:10,size:9});
      y-=7;
    }
    if(meal.notes)paragraph(`Observações: ${meal.notes}`,{size:9});
    y-=12;
  }
  if(identity.includeNutrients!==false){ensure(75);paragraph('Totais do plano',{font:bold,color:green});paragraph(`${Math.round(Number(record.daily_calories || 0))} kcal  |  Proteínas ${Math.round(Number(record.daily_protein || 0))} g  |  Carboidratos ${Math.round(Number(record.daily_carbs || 0))} g  |  Gorduras ${Math.round(Number(record.daily_fat || 0))} g`);}
  const pages=pdf.getPages();
  pages.forEach((page,index)=>{page.drawLine({start:{x:left,y:43},end:{x:547,y:43},thickness:.5,color:rgb(.8,.83,.8)});page.drawText(`Nello · Plano alimentar · ${index+1}/${pages.length}`,{x:left,y:29,size:8,font:regular,color:muted});});
  return pdf.save();
}
