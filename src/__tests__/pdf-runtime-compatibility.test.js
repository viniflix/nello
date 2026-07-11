import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import jspdfPackage from 'jspdf/package.json';

function versionParts(version) {
  return version.split('.').map(Number);
}

function isAtLeast(version, minimum) {
  const current = versionParts(version);
  const required = versionParts(minimum);
  for (let index = 0; index < required.length; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}

describe('PDF runtime compatibility', () => {
  it('uses the minimum secure jsPDF release', () => {
    expect(isAtLeast(jspdfPackage.version, '4.2.1')).toBe(true);
  });

  it('generates text, tables and multiple pages with Brazilian content', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.text('Nello - Avaliação Nutricional', 14, 20);
    autoTable(doc, {
      startY: 28,
      head: [['Campo', 'Resposta']],
      body: [['Paciente', 'João da Silva'], ['Observação', 'Açúcar e hidratação']],
    });
    doc.addPage();
    doc.text('Página 2 de 2', 14, 20);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const signature = new TextDecoder().decode(bytes.slice(0, 5));

    expect(signature).toBe('%PDF-');
    expect(doc.internal.getNumberOfPages()).toBe(2);
    expect(doc.lastAutoTable.finalY).toBeGreaterThan(28);
  });
});
