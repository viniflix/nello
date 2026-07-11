import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const outputDirectory = path.resolve('tmp/pdfs');
await mkdir(outputDirectory, { recursive: true });

async function saveFixture(name, build) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await build(doc);
  const filePath = path.join(outputDirectory, name);
  await writeFile(filePath, Buffer.from(doc.output('arraybuffer')));
  console.log(filePath);
}

await saveFixture('recibo-ficticio.pdf', async (doc) => {
  doc.setFillColor(41, 128, 185);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('RECIBO', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Gerado por Nello', 105, 28, { align: 'center' });
  doc.setTextColor(51, 51, 51);
  doc.text('Prestador: Nutricionista de Teste - CRN 00000', 20, 55);
  doc.text('Paciente: Paciente Fictício', 20, 65);
  doc.text('Valor: R$ 250,00 - Serviço de nutrição', 20, 75);
  doc.text('São Luís, avaliação, açúcar, hidratação e atenção.', 20, 85);
});

await saveFixture('lista-compras-ficticia.pdf', async (doc) => {
  doc.setFontSize(18);
  doc.text('Lista de Compras - Paciente Fictício', 14, 20);
  autoTable(doc, {
    startY: 28,
    head: [['Categoria', 'Item', 'Quantidade']],
    body: [
      ['Frutas', 'Maçã', '7 unidades'],
      ['Laticínios', 'Iogurte natural', '1,4 kg'],
      ['Óleos e Gorduras', 'Azeite de oliva', '120 ml'],
    ],
    theme: 'grid',
  });
});

await saveFixture('anamnese-ficticia.pdf', async (doc) => {
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Anamnese Clínica Fictícia', 14, 13);
  doc.setTextColor(30, 41, 59);
  autoTable(doc, {
    startY: 30,
    head: [['Campo', 'Resposta']],
    body: [
      ['Objetivo', 'Melhorar hábitos alimentares'],
      ['Observações', 'Conteúdo fictício para validação de caracteres: ç, ã, á, ê, ó.'],
      ['Consentimento', 'Confirmado pelo responsável legal fictício'],
    ],
    theme: 'grid',
  });
});

await saveFixture('relatorio-multipagina-ficticio.pdf', async (doc) => {
  doc.text('Relatório Multipágina', 14, 18);
  autoTable(doc, {
    startY: 24,
    head: [['Data', 'Registro', 'Status']],
    body: Array.from({ length: 120 }, (_, index) => [
      `${String((index % 28) + 1).padStart(2, '0')}/07/2026`,
      `Registro fictício número ${index + 1}`,
      index % 2 ? 'Validado' : 'Pendente',
    ]),
    theme: 'striped',
    didDrawPage: ({ pageNumber }) => {
      doc.setFontSize(8);
      doc.text(`Página ${pageNumber}`, 196, 290, { align: 'right' });
    },
  });
});
