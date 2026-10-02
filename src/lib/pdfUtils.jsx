import { downloadSavedClinicalPdf } from './pdf/savedClinicalPdf';
import { getTodayIsoDate } from '@/lib/utils/date';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { loadLogo } from './pdf/pdfAssets';
import { generatePdfViaEdge } from './pdf/edgePdfFallback';
import { formatFinancialDecimal } from './utils/financial-math';
const loadPdfTools = async () => {
  const [{default: jsPDF}, {default: autoTable}] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return {jsPDF, autoTable};
};

const withEdgePdfFallback = async (options, generateClientPdf) => {
  try {
    await generateClientPdf();
  } catch (error) {
    logDiagnostic('error', 'lib/pdfUtils.jsx:16', "Erro ao gerar PDF no cliente:", error);
    await generatePdfViaEdge(options);
  }
};

export const exportToPdf = async (elementId, fileName, title) => {
  const input = document.getElementById(elementId);
  if (!input) {
    logDiagnostic('error', 'lib/pdfUtils.jsx:24', `Element with id ${elementId} not found.`);
    return;
  }

  const {jsPDF} = await loadPdfTools();
  const {default: html2canvas} = await import('html2canvas');
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

export const exportFinancialsToPdf = async (transactions, summary, period) => {
    await withEdgePdfFallback({
        title: `Relatório Financeiro - ${period}`,
        fileName: `relatorio_financeiro_${period}.pdf`,
        lines: [
            `Período: ${period}`,
            `Caixa recebido liquido: R$ ${formatFinancialDecimal(summary?.income)}`,
            `Despesas pagas: R$ ${formatFinancialDecimal(summary?.expenses)}`,
            `Saldo de caixa: R$ ${formatFinancialDecimal(summary?.netResult)}`,
            `Receitas lancadas (inclui pendentes): R$ ${formatFinancialDecimal(summary?.expectedIncome)}`,
            `A receber: R$ ${formatFinancialDecimal(summary?.pendingIncome)}`,
            `Vencido: R$ ${formatFinancialDecimal(summary?.overdue)}`,
            ...transactions.map((t) => `${t.transaction_date || ''} | ${t.paid_at || '-'} | ${t.refunded_at || '-'} | ${t.status || ''} | ${t.type || ''} | ${t.description || ''} | R$ ${formatFinancialDecimal(t.amount)}`),
        ],
    }, async () => {
    const {jsPDF,autoTable} = await loadPdfTools();
    const doc = new jsPDF();
    const user = "Nutricionista"; // Placeholder
    
    doc.setFontSize(18);
    doc.text(`Relatório Financeiro - ${period}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Gerado por: ${user}`, 14, 30);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 36);

    // Calculate values safely
    const income = summary?.income || 0;
    const expenses = summary?.expenses || 0;
    const netResult = summary?.netResult ?? (income - expenses);

    autoTable(doc, {
        startY: 45,
        head: [['Resumo', 'Valor']],
        body: [
            ['Caixa recebido líquido', `R$ ${formatFinancialDecimal(income)}`],
            ['Despesas pagas', `R$ ${formatFinancialDecimal(expenses)}`],
            ['Saldo de caixa', `R$ ${formatFinancialDecimal(netResult)}`],
            ['Receitas lançadas (com pendentes)', `R$ ${formatFinancialDecimal(summary?.expectedIncome)}`],
            ['A receber', `R$ ${formatFinancialDecimal(summary?.pendingIncome)}`],
            ['Vencido', `R$ ${formatFinancialDecimal(summary?.overdue)}`],
        ],
        theme: 'striped'
    });

    const tableColumn = ["Competência", "Pagamento", "Estorno", "Tipo", "Status", "Descrição", "Valor (R$)"];
    const tableRows = [];

    transactions.forEach(t => {
        const amount = Number(t.amount || 0);
        const transactionData = [
            new Date(t.transaction_date + 'T00:00:00').toLocaleDateString('pt-BR'),
            t.paid_at ? new Date(t.paid_at + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            t.refunded_at ? new Date(t.refunded_at + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            t.type === 'income' ? 'Receita' : 'Despesa',
            t.status === 'paid' ? 'Pago' : t.status === 'refunded' ? 'Estornado' : t.status === 'overdue' ? 'Vencido' : 'Pendente',
            t.description || '',
            formatFinancialDecimal(amount)
        ];
        tableRows.push(transactionData);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: doc.lastAutoTable.finalY + 10
    });
    doc.save(`relatorio_financeiro_${period}.pdf`);
    });
};

/**
 * Exportar anamnese para PDF
 * @param {Array} anamneseData - Array de objetos {pergunta: string, resposta: string}
 * @param {string} patientName - Nome do paciente
 * @param {string} nutritionistName - Nome do nutricionista
 */
export const exportAnamneseToPdf = async (anamneseData, patientName, nutritionistName) => {
    const {jsPDF,autoTable} = await loadPdfTools();
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
    autoTable(doc, {
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
    const fileName = `anamnese_${patientName.replace(/\s+/g, '_')}_${getTodayIsoDate()}.pdf`;
    doc.save(fileName);
};

/**
 * Exportar agenda de consultas para PDF
 * @param {Array} appointments - Array de agendamentos
 * @param {string} periodType - Tipo do período: 'week' ou 'month'
 * @param {string} periodLabel - Label descritivo do período (ex: "Semana de 18/11 a 24/11")
 * @param {string} nutritionistName - Nome do nutricionista
 */
export const exportAgendaToPdf = async (appointments, periodType, periodLabel, nutritionistName) => {
    await withEdgePdfFallback({
        title: 'Agenda de Consultas',
        fileName: `agenda_${periodType}_${getTodayIsoDate()}.pdf`,
        lines: [
            `Período: ${periodLabel}`,
            `Nutricionista: ${nutritionistName || 'Não informado'}`,
            `Total de consultas: ${appointments.length}`,
            ...appointments.map((appt) => {
                const date = new Date(appt.appointment_time);
                const dateStr = date.toLocaleDateString('pt-BR');
                const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const patientName = appt.patient?.name || appt.unregistered_patient_name || appt.patient_name || 'Não identificado';
                return `${dateStr} ${timeStr} | ${patientName} | ${appt.status || 'scheduled'}`;
            }),
        ],
    }, async () => {
    const {jsPDF,autoTable} = await loadPdfTools();
    const doc = new jsPDF();

    // Cores do projeto Nello (convertidas de HSL para RGB)
    const PRIMARY_COLOR = [70, 125, 70];      // Verde: hsl(100, 31%, 38%)
    const SECONDARY_COLOR = [238, 103, 6];    // Laranja: hsl(26, 95%, 48%)
    const TEXT_COLOR = [68, 64, 60];          // Stone-800: hsl(24, 5.7%, 23.9%)
    const MUTED_COLOR = [120, 113, 108];      // Stone-500: hsl(24, 3.8%, 46.1%)

    // Carregar logo
    const logoData = await loadLogo();
    if (logoData) {
        // Adicionar logo (40x10mm)
        try {
            doc.addImage(logoData, 'PNG', 14, 10, 40, 10);
        } catch (err) {
            logDiagnostic('warn', 'lib/pdfUtils.jsx:248', 'Falha ao adicionar logo ao PDF:', err);
        }
    }

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...PRIMARY_COLOR); // Verde primário
    doc.text('AGENDA DE CONSULTAS', 105, 20, { align: 'center' });

    // Informações do cabeçalho
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_COLOR);
    doc.text(`Período: ${periodLabel}`, 14, 30);

    // Corrigir exibição do nome do nutricionista
    const capitalizeName = (name) => {
        if (!name) return 'Não informado';
        return name
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const nutricionistaNome = nutritionistName && nutritionistName !== 'Nutricionista'
        ? capitalizeName(nutritionistName)
        : 'Não informado';
    doc.text(`Nutricionista: ${nutricionistaNome}`, 14, 35);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, 40);

    // Resumo
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(`Total de consultas: ${appointments.length}`, 14, 46);

    // Linha separadora
    doc.setLineWidth(0.5);
    doc.setDrawColor(...PRIMARY_COLOR); // Verde
    doc.line(14, 50, 196, 50);

    // Preparar dados para a tabela
    const tableRows = [];

    // Mapear status para labels em português
    const statusMap = {
        'scheduled': 'Agendada',
        'confirmed': 'Confirmada',
        'awaiting_confirmation': 'Aguardando',
        'completed': 'Realizada',
        'cancelled': 'Cancelada',
        'no_show': 'Faltou'
    };

    // Mapear tipos para labels em português
    const typeMap = {
        'first_appointment': 'Primeira Consulta',
        'return': 'Retorno',
        'evaluation': 'Avaliação',
        'online': 'Online',
        'in_person': 'Presencial'
    };

    appointments.forEach(appt => {
        const date = new Date(appt.appointment_time);
        const dateStr = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const startTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const duration = appt.duration || 60;
        const endTime = new Date(date.getTime() + duration * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const timeStr = `${startTime} - ${endTime}`;

        tableRows.push([
            dateStr,
            timeStr,
            appt.patient?.name || appt.unregistered_patient_name || appt.patient_name || 'Não identificado',
            typeMap[appt.appointment_type] || 'Não especificado',
            statusMap[appt.status] || 'Agendada'
        ]);
    });

    // Criar tabela com autoTable
    autoTable(doc, {
        startY: 54,
        head: [['Data', 'Horário', 'Paciente', 'Tipo', 'Status']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
            fillColor: PRIMARY_COLOR,       // Verde primário
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center',
            font: 'helvetica'
        },
        bodyStyles: {
            fontSize: 8,
            textColor: TEXT_COLOR,
            font: 'helvetica'
        },
        columnStyles: {
            0: { cellWidth: 28, halign: 'center' },
            1: { cellWidth: 32, halign: 'center' },
            2: { cellWidth: 55, halign: 'left', fontStyle: 'bold' },
            3: { cellWidth: 40, halign: 'center' },
            4: { cellWidth: 27, halign: 'center' }
        },
        margin: { top: 54, left: 14, right: 14 },
        alternateRowStyles: {
            fillColor: [237, 236, 237]  // Stone-100 (do projeto)
        }
    });

    // Rodapé com número de páginas
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED_COLOR);
        doc.text(
            `Página ${i} de ${pageCount} • Nello © ${new Date().getFullYear()}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // Salvar o arquivo
    const fileName = `agenda_${periodType}_${getTodayIsoDate()}.pdf`;
    doc.save(fileName);
    });
};

/**
 * Exportar plano alimentar para PDF (versão nutricionista)
 * @param {Object} mealPlan - Dados completos do plano alimentar
 * @param {string} patientName - Nome do paciente
 * @param {string} nutritionistName - Nome do nutricionista
 * @param {boolean} includeNutrients - Se deve incluir tabela de micronutrientes
 * @param {Function} translateMealType - Função para traduzir tipo de refeição
 * @param {Function} formatQuantityWithUnit - Função para formatar quantidade
 */
export const exportMealPlanToPdf = async (mealPlan, _patientName, _nutritionistName, includeNutrients=true) => {
    await downloadSavedClinicalPdf('mealPlanId',mealPlan?.id,{includeNutrients});
};
