import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

export const exportToPdf = async (elementId, fileName, title) => {
  const input = document.getElementById(elementId);
  if (!input) {
    console.error(`Element with id ${elementId} not found.`);
    return;
  }

  const pdf = new jsPDF('p', 'mm', 'a4');
  
  pdf.setFontSize(18);
  pdf.text(title, 14, 22);
  
  const canvas = await html2canvas(input, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
  });

  const imgData = canvas.toDataURL('image/png');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth() - 28; // with margin
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  
  let heightLeft = pdfHeight;
  let position = 30;

  pdf.addImage(imgData, 'PNG', 14, position, pdfWidth, pdfHeight);
  heightLeft -= (pdf.internal.pageSize.getHeight() - 30);

  while (heightLeft > 0) {
    position = heightLeft - pdfHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 14, position, pdfWidth, pdfHeight);
    heightLeft -= pdf.internal.pageSize.getHeight();
  }

  pdf.save(`${fileName}.pdf`);
};

export const exportFinancialsToPdf = (transactions, summary, period) => {
    const doc = new jsPDF();
    const user = "Nutricionista"; // Placeholder
    
    doc.setFontSize(18);
    doc.text(`Relatório Financeiro - ${period}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Gerado por: ${user}`, 14, 30);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 36);

    doc.autoTable({
        startY: 45,
        head: [['Resumo', 'Valor']],
        body: [
            ['Receitas', `R$ ${summary.income.toFixed(2)}`],
            ['Despesas', `R$ ${summary.expense.toFixed(2)}`],
            ['Saldo', `R$ ${summary.balance.toFixed(2)}`],
        ],
        theme: 'striped'
    });

    const tableColumn = ["Data", "Tipo", "Descrição", "Categoria", "Valor (R$)"];
    const tableRows = [];

    transactions.forEach(t => {
        const transactionData = [
            new Date(t.transaction_date + 'T00:00:00').toLocaleDateString('pt-BR'),
            t.type === 'income' ? 'Receita' : 'Despesa',
            t.description,
            t.category || (t.income_source === 'patient_payment' ? 'Pag. Paciente' : 'Outra'),
            t.amount.toFixed(2)
        ];
        tableRows.push(transactionData);
    });

    doc.autoTable(tableColumn, tableRows, { startY: doc.lastAutoTable.finalY + 10 });
    doc.save(`relatorio_financeiro_${period}.pdf`);
};

/**
 * Exportar anamnese para PDF
 * @param {Array} anamneseData - Array de objetos {pergunta: string, resposta: string}
 * @param {string} patientName - Nome do paciente
 * @param {string} nutritionistName - Nome do nutricionista
 */
export const exportAnamneseToPdf = (anamneseData, patientName, nutritionistName) => {
    const doc = new jsPDF();

    // Título
    doc.setFontSize(18);
    doc.text('Anamnese Nutricional', 14, 22);

    // Informações do cabeçalho
    doc.setFontSize(11);
    doc.text(`Paciente: ${patientName}`, 14, 32);
    doc.text(`Nutricionista: ${nutritionistName}`, 14, 38);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 44);

    // Linha separadora
    doc.setLineWidth(0.5);
    doc.line(14, 48, 196, 48);

    // Preparar dados para a tabela
    const tableRows = [];

    anamneseData.forEach(item => {
        // Formatar a resposta (pode ser array para seleção múltipla)
        let respostaFormatada = item.resposta;
        if (Array.isArray(respostaFormatada)) {
            respostaFormatada = respostaFormatada.join(', ');
        }
        if (!respostaFormatada || respostaFormatada.trim() === '') {
            respostaFormatada = '(não respondido)';
        }

        tableRows.push([item.pergunta, respostaFormatada]);
    });

    // Criar tabela com autoTable
    doc.autoTable({
        startY: 52,
        head: [['Pergunta', 'Resposta']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
            fillColor: [99, 102, 241], // Cor primária (indigo)
            textColor: 255,
            fontSize: 11,
            fontStyle: 'bold'
        },
        bodyStyles: {
            fontSize: 10
        },
        columnStyles: {
            0: { cellWidth: 70, fontStyle: 'bold' },
            1: { cellWidth: 110 }
        },
        margin: { top: 52, left: 14, right: 14 }
    });

    // Rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(
            `Página ${i} de ${pageCount}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // Salvar o arquivo
    const fileName = `anamnese_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};