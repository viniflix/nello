const stripHtml = (value) => String(value ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+\n/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .trim();

const LABELS = {
  title: 'Título', record_type: 'Tipo de registro', encounter_at: 'Data clínica',
  context: 'Contexto', subjective: 'Relato subjetivo', objective: 'Dados objetivos',
  assessment: 'Avaliação', evolution: 'Evolução', adherence: 'Adesão e dificuldades',
  conduct: 'Conduta', goals: 'Metas', follow_up: 'Plano de acompanhamento',
  pending: 'Pendências', alerts: 'Alertas', notes: 'Observações', content: 'Conteúdo',
};

const formatValue = (value) => {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join('\n• ');
  if (typeof value === 'object') return Object.entries(value)
    .map(([key, item]) => `${LABELS[key] || key}: ${formatValue(item)}`)
    .filter((item) => !item.endsWith(': '))
    .join('\n');
  return stripHtml(value);
};

const addPageIfNeeded = (doc, y, required = 18) => {
  if (y + required <= 276) return y;
  doc.addPage();
  return 20;
};

export async function renderCanonicalDocumentPdf(artifact) {
  if (!artifact?.canonical_payload || !artifact?.sha256) throw new Error('canonical_document_required');
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const payload = artifact.canonical_payload;
  const professional = payload.professional || {};
  const patient = payload.patient || {};
  const content = payload.content || {};
  const primary = /^#[0-9a-f]{6}$/i.test(professional.primary_color || '') ? professional.primary_color : '#406733';
  let y = 18;

  doc.setFillColor(primary);
  doc.rect(0, 0, 210, 7, 'F');
  doc.setTextColor(35, 35, 35);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(17);
  doc.text(String(content.title || 'DOCUMENTO CLÍNICO').toUpperCase(), 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  if (professional.clinic_name) { doc.text(professional.clinic_name, 20, y); y += 5; }
  doc.text(`${professional.name || 'Profissional responsável'}${professional.normalized_crn ? ` • ${professional.normalized_crn}` : ''}`, 20, y);
  y += 9;
  doc.setDrawColor(210, 210, 210);
  doc.line(20, y, 190, y);
  y += 8;
  doc.setFont(undefined, 'bold');
  doc.text('PACIENTE', 20, y);
  doc.setFont(undefined, 'normal');
  doc.text(patient.name || 'Não informado', 55, y);
  y += 6;
  if (patient.birth_date) { doc.text(`Data de nascimento: ${new Date(`${patient.birth_date}T00:00:00`).toLocaleDateString('pt-BR')}`, 20, y); y += 6; }
  y += 3;

  for (const [key, rawValue] of Object.entries(content)) {
    if (['title', 'source_canonical_hash'].includes(key)) continue;
    const value = formatValue(rawValue);
    if (!value) continue;
    y = addPageIfNeeded(doc, y, 20);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text(String(LABELS[key] || key).toUpperCase(), 20, y);
    y += 5;
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(value, 170);
    for (const line of lines) {
      y = addPageIfNeeded(doc, y, 6);
      doc.text(line, 20, y);
      y += 5;
    }
    y += 3;
  }

  y = addPageIfNeeded(doc, y, 35);
  doc.line(20, y, 190, y);
  y += 7;
  doc.setFontSize(8);
  doc.text(`Status: ${artifact.status === 'signed' ? 'ASSINADO NO NELLO' : String(artifact.status).toUpperCase()}`, 20, y);
  y += 4;
  if (artifact.signed_at) { doc.text(`Assinado em: ${new Date(artifact.signed_at).toLocaleString('pt-BR')}`, 20, y); y += 4; }
  if (artifact.authenticity_code) { doc.text(`Autenticidade: ${artifact.authenticity_code}`, 20, y); y += 4; }
  doc.setFontSize(6.5);
  doc.text(`SHA-256: ${artifact.sha256}`, 20, y, { maxWidth: 170 });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Gerado com Nello • Página ${page} de ${pageCount}`, 105, 290, { align: 'center' });
  }
  return doc.output('blob');
}

export async function downloadCanonicalDocumentPdf(artifact) {
  const blob = await renderCanonicalDocumentPdf(artifact);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nello-documento-${artifact.id}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
