const CSV_COLUMNS = ['categoria', 'identificador', 'data', 'estado', 'tipo'];

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function buildPortabilityIndex(snapshot) {
  return Object.entries(snapshot?.categories || {}).flatMap(([category, rows]) => (
    Array.isArray(rows) ? rows.map((row) => ({
      categoria: category,
      identificador: row.id || '',
      data: row.encounter_at || row.test_date || row.photo_date || row.meal_date || row.created_at || '',
      estado: row.status || '',
      tipo: row.record_type || row.goal_type || row.test_name || row.category_code || '',
    })) : []
  ));
}

export function portabilityIndexToCsv(snapshot) {
  const rows = buildPortabilityIndex(snapshot);
  return `\uFEFF${[
    CSV_COLUMNS.map(csvCell).join(';'),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(';')),
  ].join('\r\n')}`;
}

export function summarizePortabilitySnapshot(snapshot) {
  const categories = Object.entries(snapshot?.categories || {}).map(([name, rows]) => ({
    name,
    count: Array.isArray(rows) ? rows.length : 0,
  }));
  return {
    categories,
    recordCount: categories.reduce((total, item) => total + item.count, 0),
    attachmentCount: Array.isArray(snapshot?.attachment_manifest) ? snapshot.attachment_manifest.length : 0,
  };
}

export const safeFilename = (value, fallback = 'arquivo') => {
  const normalized = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return normalized || fallback;
};

const addWrappedText = (doc, text, x, y, width, lineHeight = 5) => {
  const lines = doc.splitTextToSize(String(text || '-'), width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
};

export async function createPortabilityPdf(snapshot) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const summary = summarizePortabilitySnapshot(snapshot);
  const subject = snapshot?.subject || {};
  let y = 20;

  doc.setTextColor(64, 103, 51);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('NELLO — CÓPIA DOS MEUS DADOS', 20, y);
  y += 10;
  doc.setTextColor(45, 45, 45);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  y = addWrappedText(doc, `Titular: ${subject.name || 'Não informado'}`, 20, y, 170);
  y = addWrappedText(doc, `Gerado em: ${new Date(snapshot.generated_at).toLocaleString('pt-BR')}`, 20, y, 170);
  y = addWrappedText(doc, `Versão do formato: ${snapshot.schema_version}`, 20, y, 170);
  y += 5;
  doc.setFont(undefined, 'bold');
  doc.text('RESUMO DO PACOTE', 20, y);
  y += 7;
  doc.setFont(undefined, 'normal');
  y = addWrappedText(doc, `${summary.recordCount} registros estruturados e ${summary.attachmentCount} anexos catalogados.`, 20, y, 170);

  for (const category of summary.categories.filter((item) => item.count > 0)) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(`• ${category.name}: ${category.count}`, 24, y);
    y += 5;
  }

  if (y > 245) { doc.addPage(); y = 20; }
  y += 8;
  doc.setFont(undefined, 'bold');
  doc.text('INFORMAÇÕES IMPORTANTES', 20, y);
  y += 7;
  doc.setFont(undefined, 'normal');
  y = addWrappedText(doc, snapshot.scope_notice, 20, y, 170);
  y += 4;
  addWrappedText(doc, 'O arquivo JSON contém os dados estruturados completos. O CSV facilita a leitura tabular e a pasta de anexos contém os arquivos que puderam ser recuperados com autorização temporária.', 20, y, 170);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Gerado com Nello • Página ${page} de ${pages}`, 105, 290, { align: 'center' });
  }
  return doc.output('blob');
}

export async function buildPortabilityZip(snapshot, resolveAttachmentUrl) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('dados-estruturados.json', JSON.stringify(snapshot, null, 2));
  zip.file('indice-registros.csv', portabilityIndexToCsv(snapshot));
  zip.file('leia-me.pdf', await createPortabilityPdf(snapshot));

  const failures = [];
  for (const attachment of snapshot?.attachment_manifest || []) {
    try {
      const url = await resolveAttachmentUrl(attachment.id);
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const extension = safeFilename(attachment.original_filename || '').split('.').pop();
      const base = safeFilename(attachment.original_filename || attachment.id);
      const filename = base.includes('.') ? base : `${base}.${extension || 'bin'}`;
      zip.file(`anexos/${attachment.id}-${filename}`, await response.blob());
    } catch (error) {
      failures.push({ attachment_id: attachment.id, error: error?.message || 'download_failed' });
    }
  }
  if (failures.length) zip.file('anexos/falhas-de-recuperacao.json', JSON.stringify(failures, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
