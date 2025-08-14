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