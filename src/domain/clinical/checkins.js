export function checkinState(session, now = Date.now()) {
  if (session?.status === 'completed') return 'completed';
  if (session?.status === 'expired') return 'expired';
  if (session?.status !== 'pending') return 'unavailable';
  if (session.expires_at) {
    const deadline = new Date(session.expires_at).getTime();
    if (!Number.isFinite(deadline)) return 'unavailable';
    if (deadline <= now) return 'expired';
  }
  return 'pending';
}

export function normalizeCheckinScore(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

// Version 2 measures only the professional's explicit criteria, never symptoms
// or descriptive completion by inference. Issued v1 results are not recalculated.
export function calculateExplicitCheckinScore(fields, responses) {
  let total=0,maximum=0;
  for(const field of fields){
    const answer=responses[field.id],rule=field.scoring_rule;
    if(!rule || rule.version!==2 || rule.mode==='none' || answer==null || answer==='' || (Array.isArray(answer)&&!answer.length))continue;
    const weight=Number(field.score_weight??0);if(!Number.isFinite(weight)||weight<=0||weight>100)continue;
    let value;
    if(field.field_type==='yes_no'&&['yes','no'].includes(rule.mode)&&['yes','no'].includes(answer))value=answer===rule.mode?10:0;
    else if(field.field_type==='scale_1_10'&&['higher_better','lower_better'].includes(rule.mode)){
      const raw=Array.isArray(answer)&&answer.length===1?answer[0]:answer;
      if(typeof raw!=='number'||!Number.isInteger(raw)||raw<1||raw>10)continue;
      value=(rule.mode==='higher_better'?raw-1:10-raw)*10/9;
    }else continue;
    total+=weight*value;maximum+=weight*10;
  }
  return {total,maximum,percentage:maximum>0?total/maximum*100:null};
}
