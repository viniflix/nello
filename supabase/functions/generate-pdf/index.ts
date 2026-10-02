import { edgeBoundary, RequestError, timedFetch } from '../_shared/http.ts';
import { energyDocument, canonicalDocument, storedClinicalDocument } from '../_shared/clinical-document.js';
import { activeActor } from '../_shared/actor.ts';
import { consumeQuota } from '../_shared/quota.ts';
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {};

const sanitize = (value: unknown) =>
  String(value ?? "").replace(/−/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/→/g,'->').replace(/[^\x20-\x7E\xA0-\xFF]/g,' ').replace(/\s+/g, " ").trim();

const wrapText = (text: string, maxChars = 90) => {
  const words = text.split(" ").flatMap(word=>word.match(new RegExp(`.{1,${maxChars}}`,'g')) || ['']);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
};
const wrapWidth = (text:string,font:{widthOfTextAtSize:(value:string,size:number)=>number},size:number) => {
  const result:string[]=[];let line='';
  for(const char of text){if(font.widthOfTextAtSize(line+char,size)>499){result.push(line);line='';}line+=char;}
  if(line)result.push(line);return result.length?result:[''];
};

serve(edgeBoundary(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const actor = await activeActor(req, ['nutritionist', 'patient', 'admin']);
  await consumeQuota(actor.id, 'pdf');
  try {
    let body = await req.json();
    const clinicalKind=['mealPlanId','anamnesisRecordId','anthropometryRecordId'].find(kind=>body?.[kind]!=null);
    if(clinicalKind) {
      const id=body[clinicalKind], numeric=clinicalKind!=='anamnesisRecordId';
      const valid=numeric ? ((typeof id==='number' && Number.isSafeInteger(id) && id>0) || (typeof id==='string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id)<=9223372036854775807n)) : typeof id==='string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
      const compare=body.compareRecordId;
      if(!valid || body.format!=='binary' || (body.includeNutrients!=null && typeof body.includeNutrients!=='boolean') || Object.keys(body).some(key=>![clinicalKind,'format',...(clinicalKind==='mealPlanId'?['includeNutrients']:[]),...(clinicalKind==='anthropometryRecordId'?['compareRecordId']:[])].includes(key))
        || (clinicalKind==='anthropometryRecordId' && !(typeof compare==='number'&&Number.isSafeInteger(compare)&&compare>0))) throw new RequestError(400,'invalid_pdf_request');
      const table=clinicalKind==='mealPlanId'?'meal_plans':clinicalKind==='anamnesisRecordId'?'anamnesis_records':'growth_records';
      const select=clinicalKind==='mealPlanId'?'id,patient_id,created_at,name,description,meal_plan_meals(*,meal_plan_foods(*,meal_plan_food_substitutions(*)))':clinicalKind==='anamnesisRecordId'?'id,patient_id,date,content,notes':'id,patient_id,record_date,weight,height,results,circumferences,skinfolds,notes';
      const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');
      if(!url||!key)throw new RequestError(503,'service_unavailable');
      const filter=clinicalKind==='anthropometryRecordId'?`id=in.(${id},${compare})`:`id=eq.${id}`;
      const response=await timedFetch(`${url}/rest/v1/${table}?${filter}&select=${encodeURIComponent(select)}&limit=2`,{headers:{authorization:req.headers.get('authorization')!,apikey:key}});
      if(!response.ok)throw new RequestError(404,'document_unavailable');
      const raw=await response.text();if(raw.length>512000)throw new RequestError(413,'pdf_too_large');
      const records=JSON.parse(raw);if(records.length!==(clinicalKind==='anthropometryRecordId'?2:1))throw new RequestError(404,'document_unavailable');
      if(clinicalKind==='mealPlanId') {
        const foods=records[0].meal_plan_meals.flatMap((meal:{meal_plan_foods:unknown[]})=>meal.meal_plan_foods);
        const ids=[...new Set(foods.flatMap((food:{food_id:string;meal_plan_food_substitutions:{substitute_food_id:string}[]})=>[food.food_id,...(food.meal_plan_food_substitutions||[]).map(item=>item.substitute_food_id)]))].filter((id)=>typeof id==='string'&&/^[a-z0-9_:-]{1,100}$/i.test(id));
        const names:Record<string,string>={};
        for(let index=0;index<ids.length;index+=400) {
          const response=await timedFetch(`${url}/rest/v1/foods?id=in.(${ids.slice(index,index+400).map(encodeURIComponent).join(',')})&select=id,name&limit=400`,{headers:{authorization:req.headers.get('authorization')!,apikey:key}});
          if(!response.ok)throw new RequestError(422,'document_unavailable');
          for(const food of await response.json())names[food.id]=food.name;
        }
        for(const food of foods){food.food={name:food.food_snapshot?.name || names[food.food_id] || `Alimento (${food.food_id})`};food.substitutes=(food.meal_plan_food_substitutions||[]).map((item:{food_snapshot?:{name:string};substitute_food_id:string;quantity:number;unit:string})=>({name:item.food_snapshot?.name||names[item.substitute_food_id]||item.substitute_food_id,quantity:item.quantity,unit:item.unit}));}
      }
      if(clinicalKind==='anthropometryRecordId')records.sort((a:{id:number},b:{id:number})=>a.id===id?-1:b.id===id?1:0);
      const patientId=records[0].patient_id;
      let patientName='';
      if(typeof patientId==='string'&&/^[0-9a-f-]{36}$/i.test(patientId)) {
        const profile=await timedFetch(`${url}/rest/v1/user_profiles?id=eq.${patientId}&select=name&limit=1`,{headers:{authorization:req.headers.get('authorization')!,apikey:key}});
        if(profile.ok)patientName=(await profile.json())?.[0]?.name || '';
      }
      body={...storedClinicalDocument(clinicalKind,records,{patientName,includeNutrients:body.includeNutrients}),format:'binary'};
      body.lines=body.lines.flatMap((line:string)=>line.match(/.{1,900}/g)||['']);
    }
    if (body?.energyCalculationId != null || body?.documentArtifactId != null) {
      const energy = body.energyCalculationId != null;
      const id = energy ? body.energyCalculationId : body.documentArtifactId;
      const validId = energy
        ? ((typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
          (typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n))
        : typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
      if (!validId
        || Object.keys(body).some(key=>![energy ? 'energyCalculationId' : 'documentArtifactId','format'].includes(key))
        || body.format !== 'binary') throw new RequestError(400,'invalid_pdf_request');
      const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY');
      if (!url || !key) throw new RequestError(503,'service_unavailable');
      const headers = {authorization:req.headers.get('authorization')!,apikey:key,'content-type':'application/json'};
      // Forward the caller JWT. RLS/RPC authorization applies; no service-role read.
      const response = await timedFetch(energy
        ? `${url}/rest/v1/energy_expenditure_calculations?id=eq.${id}&select=*&limit=1`
        : `${url}/rest/v1/rpc/get_document_artifact`, energy ? {headers} : {method:'POST',headers,body:JSON.stringify({p_artifact_id:id})});
      if (!response.ok) throw new RequestError(response.status === 403 || response.status === 404 ? 404 : 422,'document_unavailable');
      const raw = await response.text();
      if (raw.length > 512000) throw new RequestError(413,'pdf_too_large');
      const saved = JSON.parse(raw), record = energy ? saved?.[0] : saved;
      if (!record) throw new RequestError(404,'document_unavailable');
      body = {...(energy ? energyDocument(record) : canonicalDocument(record)),format:'binary'};
      body.lines = body.lines.flatMap((line:string)=>line.match(/.{1,900}/g)||['']);
      if(body.lines.length>1200)throw new RequestError(413,'pdf_too_large');
    }
    if (!body || !Array.isArray(body.lines) || body.lines.length > 1200
      || body.lines.some((line: unknown) => typeof line !== 'string' || line.length > 1000)
      || (body.title != null && (typeof body.title !== 'string' || body.title.length > 160))
      || (body.fileName != null && (typeof body.fileName !== 'string' || body.fileName.length > 160))) {
      return new Response(JSON.stringify({ error: 'invalid_pdf_request' }), { status: 400 });
    }
    const title = sanitize(body?.title || "Documento");
    const inputLines = Array.isArray(body?.lines) ? body.lines : [];
    if (inputLines.reduce((total:number,line:string)=>total+line.length,0)>120000) throw new RequestError(413,'pdf_too_large');
    const lines = inputLines.map(sanitize).filter(Boolean).slice(0, 1200);
    const fileName = sanitize(body?.fileName || `documento-${Date.now()}.pdf`);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595.28, 841.89]);
    const { height } = page.getSize();
    const margin = 48;
    let y = height - margin;

    const newPage = () => {
      if (pdfDoc.getPageCount() >= 50) throw new RequestError(413, 'pdf_too_large');
      page = pdfDoc.addPage([595.28, 841.89]);
      y = height - margin;
    };

    for (const titleLine of wrapWidth(title,boldFont,18)) {
    page.drawText(titleLine, {
      x: margin,
      y,
      size: 18,
      font: boldFont,
      color: rgb(0.2, 0.35, 0.2),
    });
    y -= 22;
    }
    y -= 4;

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    page.drawText(`Gerado em: ${now}`, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    y -= 20;

    for (const rawLine of lines) {
      // Width is measured in points; character count alone fails for wide glyphs.
      const wrapped = wrapText(rawLine, 70).flatMap(line=>wrapWidth(line,font,11));
      for (const line of wrapped) {
        if (y < margin + 20) newPage();
        page.drawText(line, {
          x: margin,
          y,
          size: 11,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 14;
      }
      y -= 2;
    }

    const bytes = await pdfDoc.save();
    if (bytes.length > 2 * 1024 * 1024) throw new RequestError(413,'pdf_too_large');
    // New clients request bytes; old open sessions retain the bounded JSON contract.
    if (body.format === 'binary') {
      return new Response(bytes, { status: 200, headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      } });
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    const base64Pdf = btoa(binary);

    return new Response(JSON.stringify({ fileName, base64Pdf }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    if (error instanceof RequestError) throw error;
    return new Response(
      JSON.stringify({ error: error instanceof SyntaxError ? 'invalid_request' : 'pdf_generation_failed' }),
      {
        status: error instanceof SyntaxError ? 400 : 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}));
