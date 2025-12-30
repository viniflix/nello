import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

    // Calculate values safely
    const income = summary?.income || 0;
    const expenses = summary?.expenses || 0;
    const netResult = summary?.netResult || (income - expenses);

    autoTable(doc, {
        startY: 45,
        head: [['Resumo', 'Valor']],
        body: [
            ['Receitas', `R$ ${income.toFixed(2)}`],
            ['Despesas', `R$ ${expenses.toFixed(2)}`],
            ['Saldo', `R$ ${netResult.toFixed(2)}`],
        ],
        theme: 'striped'
    });

    const tableColumn = ["Data", "Tipo", "Descrição", "Categoria", "Valor (R$)"];
    const tableRows = [];

    transactions.forEach(t => {
        const amount = t.amount || 0;
        const transactionData = [
            new Date(t.transaction_date + 'T00:00:00').toLocaleDateString('pt-BR'),
            t.type === 'income' ? 'Receita' : 'Despesa',
            t.description || '',
            t.category || (t.income_source === 'patient_payment' ? 'Pag. Paciente' : 'Outra'),
            amount.toFixed(2)
        ];
        tableRows.push(transactionData);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: doc.lastAutoTable.finalY + 10
    });
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
    const fileName = `anamnese_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
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
    const doc = new jsPDF();

    // Cores do projeto HipoZero (convertidas de HSL para RGB)
    const PRIMARY_COLOR = [70, 125, 70];      // Verde: hsl(100, 31%, 38%)
    const SECONDARY_COLOR = [238, 103, 6];    // Laranja: hsl(26, 95%, 48%)
    const TEXT_COLOR = [68, 64, 60];          // Stone-800: hsl(24, 5.7%, 23.9%)
    const MUTED_COLOR = [120, 113, 108];      // Stone-500: hsl(24, 3.8%, 46.1%)

    // Carregar logo
    const logoUrl = 'https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png';
    let logoData = null;

    try {
        // Converter imagem para base64
        const response = await fetch(logoUrl);
        const blob = await response.blob();
        logoData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });

        // Adicionar logo (40x10mm)
        doc.addImage(logoData, 'PNG', 14, 10, 40, 10);
    } catch (error) {
        console.error('Erro ao carregar logo:', error);
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
            appt.patient?.name || 'Não identificado',
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
            `Página ${i} de ${pageCount} • HipoZero © ${new Date().getFullYear()}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // Salvar o arquivo
    const fileName = `agenda_${periodType}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
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
export const exportMealPlanToPdf = async (mealPlan, patientName, nutritionistName, includeNutrients, translateMealType, formatQuantityWithUnit) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Cores do projeto HipoZero
    const PRIMARY_COLOR = [70, 125, 70];      // Verde
    const SECONDARY_COLOR = [238, 103, 6];    // Laranja
    const TEXT_COLOR = [68, 64, 60];          // Stone-800
    const MUTED_COLOR = [120, 113, 108];      // Stone-500
    const LIGHT_BG = [245, 245, 244];         // Stone-100

    let yPosition = 20;

    // Configurar fonte
    doc.setFont('helvetica');

    // Logo do HipoZero
    try {
        const logoUrl = 'https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png';
        const response = await fetch(logoUrl);
        const blob = await response.blob();

        // Carregar a imagem para obter dimensões reais
        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Calcular largura como 20% da largura da página
                const logoWidth = pageWidth * 0.20;
                // Calcular altura proporcionalmente baseado na proporção da imagem
                const logoHeight = (img.height / img.width) * logoWidth;

                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result;
                    doc.addImage(base64data, 'PNG', 14, 10, logoWidth, logoHeight);
                    resolve();
                };
                reader.readAsDataURL(blob);
            };
            img.src = URL.createObjectURL(blob);
        });
    } catch (error) {
        console.error('Erro ao carregar logo:', error);
    }

    // Título
    doc.setFontSize(20);
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFont('helvetica', 'bold');
    doc.text('Plano Alimentar', pageWidth / 2, 20, { align: 'center' });

    // Linha decorativa
    doc.setDrawColor(...PRIMARY_COLOR);
    doc.setLineWidth(0.5);
    doc.line(14, 24, pageWidth - 14, 24);

    yPosition = 32;

    // Informações do cabeçalho
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_COLOR);

    if (patientName) {
        doc.text(`Paciente: ${patientName}`, 14, yPosition);
        yPosition += 5;
    }

    if (nutritionistName) {
        const capitalizeName = (name) => {
            if (!name) return 'Não informado';
            return name
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        };
        doc.text(`Nutricionista: ${capitalizeName(nutritionistName)}`, 14, yPosition);
        yPosition += 5;
    }

    // Período do plano
    if (mealPlan.start_date) {
        const startDate = new Date(mealPlan.start_date).toLocaleDateString('pt-BR');
        const endDate = mealPlan.end_date
            ? new Date(mealPlan.end_date).toLocaleDateString('pt-BR')
            : 'Indeterminado';
        doc.text(`Período: ${startDate} até ${endDate}`, 14, yPosition);
        yPosition += 5;
    }

    // Data de geração
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, yPosition);
    yPosition += 10;

    // Calcular totais do plano (macros e micros)
    const planTotals = (mealPlan.meals || []).reduce((acc, meal) => {
        const mealFoods = meal.foods || [];
        const mealTotals = mealFoods.reduce((mealAcc, food) => ({
            calories: mealAcc.calories + (food.calories || 0),
            protein: mealAcc.protein + (food.protein || 0),
            carbs: mealAcc.carbs + (food.carbs || 0),
            fat: mealAcc.fat + (food.fat || 0),
            // Micronutrientes
            fiber: mealAcc.fiber + (food.food?.fiber ? (food.food.fiber * (food.quantity || 0) / 100) : 0),
            sodium: mealAcc.sodium + (food.food?.sodium ? (food.food.sodium * (food.quantity || 0) / 100) : 0),
            calcium: mealAcc.calcium + (food.food?.calcium ? (food.food.calcium * (food.quantity || 0) / 100) : 0),
            iron: mealAcc.iron + (food.food?.iron ? (food.food.iron * (food.quantity || 0) / 100) : 0),
            magnesium: mealAcc.magnesium + (food.food?.magnesium ? (food.food.magnesium * (food.quantity || 0) / 100) : 0),
            potassium: mealAcc.potassium + (food.food?.potassium ? (food.food.potassium * (food.quantity || 0) / 100) : 0),
            zinc: mealAcc.zinc + (food.food?.zinc ? (food.food.zinc * (food.quantity || 0) / 100) : 0),
            vitamin_a: mealAcc.vitamin_a + (food.food?.vitamin_a ? (food.food.vitamin_a * (food.quantity || 0) / 100) : 0),
            vitamin_c: mealAcc.vitamin_c + (food.food?.vitamin_c ? (food.food.vitamin_c * (food.quantity || 0) / 100) : 0),
            vitamin_d: mealAcc.vitamin_d + (food.food?.vitamin_d ? (food.food.vitamin_d * (food.quantity || 0) / 100) : 0)
        }), {
            calories: 0, protein: 0, carbs: 0, fat: 0,
            fiber: 0, sodium: 0, calcium: 0, iron: 0,
            magnesium: 0, potassium: 0, zinc: 0,
            vitamin_a: 0, vitamin_c: 0, vitamin_d: 0
        });

        return {
            calories: acc.calories + mealTotals.calories,
            protein: acc.protein + mealTotals.protein,
            carbs: acc.carbs + mealTotals.carbs,
            fat: acc.fat + mealTotals.fat,
            fiber: acc.fiber + mealTotals.fiber,
            sodium: acc.sodium + mealTotals.sodium,
            calcium: acc.calcium + mealTotals.calcium,
            iron: acc.iron + mealTotals.iron,
            magnesium: acc.magnesium + mealTotals.magnesium,
            potassium: acc.potassium + mealTotals.potassium,
            zinc: acc.zinc + mealTotals.zinc,
            vitamin_a: acc.vitamin_a + mealTotals.vitamin_a,
            vitamin_c: acc.vitamin_c + mealTotals.vitamin_c,
            vitamin_d: acc.vitamin_d + mealTotals.vitamin_d
        };
    }, {
        calories: 0, protein: 0, carbs: 0, fat: 0,
        fiber: 0, sodium: 0, calcium: 0, iron: 0,
        magnesium: 0, potassium: 0, zinc: 0,
        vitamin_a: 0, vitamin_c: 0, vitamin_d: 0
    });

    // Resumo de Macros
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(14, yPosition, pageWidth - 28, 20, 2, 2, 'F');

    doc.setFontSize(9);
    doc.setTextColor(...TEXT_COLOR);
    doc.setFont('helvetica', 'bold');
    doc.text('Meta Diária Total:', 18, yPosition + 6);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_COLOR);
    const macroText = `${Math.round(planTotals.calories)} kcal  •  Proteínas: ${Math.round(planTotals.protein)}g  •  Carboidratos: ${Math.round(planTotals.carbs)}g  •  Gorduras: ${Math.round(planTotals.fat)}g`;
    doc.text(macroText, 18, yPosition + 13);

    yPosition += 28;

    // Ordenar refeições
    const mealOrder = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'];
    const sortedMeals = [...(mealPlan.meals || [])].sort(
        (a, b) => mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type)
    );

    // Refeições
    for (let index = 0; index < sortedMeals.length; index++) {
        const meal = sortedMeals[index];
        const foods = meal.foods || []; // Corrigido: era meal.meal_plan_foods

        // Estimar altura necessária para esta refeição
        const estimatedHeight = 15 + (foods.length + 1) * 7 + (meal.notes ? 10 : 0);

        // Se não couber na página, adicionar nova página
        if (yPosition + estimatedHeight > pageHeight - 30) {
            doc.addPage();
            yPosition = 20;
        }

        // Nome da refeição e horário
        doc.setFontSize(12);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.setFont('helvetica', 'bold');
        const mealName = translateMealType ? translateMealType(meal.meal_type) : meal.name;
        const mealTime = meal.meal_time || '';
        doc.text(`${mealName}${mealTime ? ` • ${mealTime}` : ''}`, 14, yPosition);
        yPosition += 7;

        // Tabela de alimentos (sempre apenas com macros)
        if (foods.length > 0) {
            const tableData = foods.map(food => [
                food.food?.name || 'Alimento',
                formatQuantityWithUnit
                    ? formatQuantityWithUnit(food.quantity || 0, food.unit || '', food.measure)
                    : `${food.quantity || 0} ${food.unit || ''}`,
                Math.round(food.calories || 0),
                Math.round(food.protein || 0),
                Math.round(food.carbs || 0),
                Math.round(food.fat || 0)
            ]);

            autoTable(doc, {
                startY: yPosition,
                head: [['Alimento', 'Quantidade', 'Calorias', 'Proteína', 'Carboidrato', 'Gordura']],
                body: tableData,
                theme: 'striped',
                headStyles: {
                    fillColor: PRIMARY_COLOR,
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
                    0: { halign: 'left', cellWidth: 'auto' },
                    1: { halign: 'center', cellWidth: 30 },
                    2: { halign: 'center', cellWidth: 23 },
                    3: { halign: 'center', cellWidth: 23 },
                    4: { halign: 'center', cellWidth: 28 },
                    5: { halign: 'center', cellWidth: 23 }
                },
                alternateRowStyles: {
                    fillColor: LIGHT_BG
                },
                margin: { left: 14, right: 14 }
            });

            yPosition = doc.lastAutoTable.finalY + 3;
        }

        // Observação (se houver)
        if (meal.notes) {
            doc.setFontSize(8);
            doc.setTextColor(...MUTED_COLOR);
            doc.setFont('helvetica', 'italic');
            doc.text(`Obs: ${meal.notes}`, 14, yPosition);
            yPosition += 6;
        }

        // Espaço entre refeições
        if (index < sortedMeals.length - 1) {
            yPosition += 5;
        }
    }

    // Seção de Micronutrientes (apenas se includeNutrients = true)
    if (includeNutrients) {
        // Verificar se precisa de nova página
        if (yPosition + 80 > pageHeight - 30) {
            doc.addPage();
            yPosition = 20;
        } else {
            yPosition += 10;
        }

        // Título da seção
        doc.setFontSize(14);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumo de Micronutrientes', 14, yPosition);
        yPosition += 10;

        // Tabela de micronutrientes
        const micronutrientsData = [
            ['Fibras', `${Math.round(planTotals.fiber)}g`],
            ['Sódio', `${Math.round(planTotals.sodium)}mg`],
            ['Cálcio', `${Math.round(planTotals.calcium)}mg`],
            ['Ferro', `${Math.round(planTotals.iron)}mg`],
            ['Magnésio', `${Math.round(planTotals.magnesium)}mg`],
            ['Potássio', `${Math.round(planTotals.potassium)}mg`],
            ['Zinco', `${Math.round(planTotals.zinc)}mg`],
            ['Vitamina A', `${Math.round(planTotals.vitamin_a)}µg`],
            ['Vitamina C', `${Math.round(planTotals.vitamin_c)}mg`],
            ['Vitamina D', `${Math.round(planTotals.vitamin_d)}µg`]
        ];

        autoTable(doc, {
            startY: yPosition,
            head: [['Micronutriente', 'Quantidade Total']],
            body: micronutrientsData,
            theme: 'striped',
            headStyles: {
                fillColor: SECONDARY_COLOR, // Laranja para diferenciar
                textColor: [255, 255, 255],
                fontSize: 10,
                fontStyle: 'bold',
                halign: 'center',
                font: 'helvetica'
            },
            bodyStyles: {
                fontSize: 9,
                textColor: TEXT_COLOR,
                font: 'helvetica'
            },
            columnStyles: {
                0: { halign: 'left', cellWidth: 100 },
                1: { halign: 'center', cellWidth: 'auto' }
            },
            alternateRowStyles: {
                fillColor: LIGHT_BG
            },
            margin: { left: 14, right: 14 }
        });

        yPosition = doc.lastAutoTable.finalY + 10;
    }

    // Rodapé em todas as páginas
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...MUTED_COLOR);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `Página ${i} de ${pageCount}`,
            pageWidth - 14,
            pageHeight - 10,
            { align: 'right' }
        );
    }

    // Salvar PDF
    const nutrientsLabel = includeNutrients ? 'completo' : 'simples';
    const fileName = `plano-alimentar-${nutrientsLabel}-${patientName?.replace(/\s+/g, '-').toLowerCase() || 'paciente'}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};