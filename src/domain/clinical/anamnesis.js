const operators=new Set(['equals','not_equals','contains','greater_than','less_than']);

// Inspect graph metadata only; errors contain no answers or clinical text.
export function anamnesisGraphError(sections) {
  if(!Array.isArray(sections))return 'invalid_shape';
  if(sections.some(section=>!Array.isArray(section?.fields)))return 'invalid_shape';
  const fields=sections.flatMap(section=>Array.isArray(section?.fields)?section.fields:[]),byId=new Map();
  if(fields.length>2000)return 'graph_limit';
  for(const field of fields){
    if(typeof field?.id!=='string'||!field.id.trim()||byId.has(field.id))return 'invalid_identity';
    byId.set(field.id,field);
  }
  for(const field of fields){
    const rule=field.conditional_logic;if(rule==null)continue;
    if(typeof rule!=='object'||Array.isArray(rule)||!byId.has(rule.field_id)||rule.field_id===field.id||!operators.has(rule.operator))return 'invalid_condition';
  }
  const done=new Set();
  for(const field of fields){
    const path=new Set();let current=field;
    while(current&&!done.has(current.id)){
      if(path.has(current.id))return 'cycle';
      path.add(current.id);current=byId.get(current.conditional_logic?.field_id);
    }
    for(const id of path)done.add(id);
  }
  return null;
}

export function anamnesisGraphMessage(sections){
  const error=anamnesisGraphError(sections);
  return error==='cycle'?'As condições formam um ciclo. Remova uma dependência para que as perguntas possam ser respondidas.'
    :error?'Revise as condições do formulário: cada pergunta deve depender de outra pergunta existente, com uma regra válida.':null;
}
