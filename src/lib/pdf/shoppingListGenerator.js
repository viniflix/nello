import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Gera uma lista de compras em PDF a partir de um plano alimentar
 * @param {Object} planData - Dados completos do plano alimentar (com meals e foods)
 * @param {string} patientName - Nome do paciente
 * @returns {Promise<void>}
 */
export const generateShoppingList = async (planData, patientName = 'Paciente') => {
    if (!planData || !planData.meals || planData.meals.length === 0) {
        throw new Error('Plano alimentar inválido ou sem refeições');
    }

    // Agregar alimentos de todas as refeições
    const aggregatedItems = aggregateFoods(planData.meals);

    // Categorizar alimentos
    const categorizedItems = categorizeFoods(aggregatedItems);

    // Criar PDF
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Cores do projeto HipoZero
    const PRIMARY_COLOR = [70, 125, 70];      // Verde
    const TEXT_COLOR = [68, 64, 60];          // Stone-800
    const MUTED_COLOR = [120, 113, 108];      // Stone-500
    const LIGHT_BG = [245, 245, 244];         // Stone-100

    let yPosition = 20;

    // Configurar fonte
    doc.setFont('helvetica');

    // Logo do HipoZero (opcional)
    try {
        const logoUrl = 'https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png';
        const response = await fetch(logoUrl);
        const blob = await response.blob();

        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const logoWidth = pageWidth * 0.15;
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
    doc.text('Lista de Compras', pageWidth / 2, yPosition, { align: 'center' });

    yPosition += 8;

    // Nome do paciente
    doc.setFontSize(12);
    doc.setTextColor(...TEXT_COLOR);
    doc.setFont('helvetica', 'normal');
    doc.text(`Paciente: ${patientName}`, 14, yPosition);
    
    yPosition += 6;

    // Data de geração
    const today = new Date().toLocaleDateString('pt-BR');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(`Gerado em: ${today}`, 14, yPosition);

    yPosition += 10;

    // Linha decorativa
    doc.setDrawColor(...PRIMARY_COLOR);
    doc.setLineWidth(0.5);
    doc.line(14, yPosition, pageWidth - 14, yPosition);

    yPosition += 8;

    // Gerar tabela por categoria
    const categories = Object.keys(categorizedItems).sort();
    
    for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const items = categorizedItems[category];

        // Verificar se precisa de nova página
        if (yPosition > pageHeight - 60) {
            doc.addPage();
            yPosition = 20;
        }

        // Título da categoria
        doc.setFontSize(14);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.setFont('helvetica', 'bold');
        doc.text(category, 14, yPosition);
        yPosition += 6;

        // Preparar dados da tabela
        const tableData = items.map(item => [
            '', // Checkbox (vazio, será renderizado como espaço)
            item.name,
            item.totalQuantity
        ]);

        // Gerar tabela
        autoTable(doc, {
            startY: yPosition,
            head: [['', 'Item', 'Quantidade Total']],
            body: tableData,
            theme: 'grid',
            headStyles: {
                fillColor: PRIMARY_COLOR,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: TEXT_COLOR,
                fontSize: 10
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' }, // Coluna do checkbox
                1: { cellWidth: 'auto', halign: 'left' }, // Nome do item
                2: { cellWidth: 50, halign: 'right' } // Quantidade
            },
            margin: { left: 14, right: 14 },
            styles: {
                lineColor: [200, 200, 200],
                lineWidth: 0.1
            },
            didParseCell: function (data) {
                // Adicionar checkbox visual na primeira coluna
                if (data.column.index === 0 && data.row.index >= 0) {
                    // Desenhar um quadrado vazio para checkbox
                    const x = data.cell.x + 2;
                    const y = data.cell.y + 2;
                    const size = 4;
                    doc.setDrawColor(150, 150, 150);
                    doc.setLineWidth(0.3);
                    doc.rect(x, y, size, size);
                }
            }
        });

        // Atualizar posição Y após a tabela
        yPosition = doc.lastAutoTable.finalY + 8;

        // Espaço entre categorias
        if (i < categories.length - 1) {
            yPosition += 5;
        }
    }

    // Rodapé
    const footerY = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_COLOR);
    doc.setFont('helvetica', 'italic');
    doc.text('Gerado por HipoZero', pageWidth / 2, footerY, { align: 'center' });

    // Salvar PDF
    const fileName = `lista_compras_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};

/**
 * Agrega alimentos duplicados de todas as refeições
 * @param {Array} meals - Array de refeições
 * @returns {Array} Array de itens agregados
 */
function aggregateFoods(meals) {
    const foodMap = new Map();

    for (const meal of meals) {
        if (!meal.foods || meal.foods.length === 0) continue;

        for (const foodItem of meal.foods) {
            // Obter nome do alimento
            const foodName = foodItem.foods?.name || foodItem.food?.name || foodItem.name || 'Alimento não identificado';
            
            // Obter quantidade e unidade
            const quantity = parseFloat(foodItem.quantity) || 0;
            const unit = foodItem.unit || 'g';
            
            // Obter categoria/grupo do alimento
            const category = foodItem.foods?.group || foodItem.food?.group || 'Outros';

            // Chave única: nome + unidade
            const key = `${foodName.toLowerCase()}_${unit}`;

            if (foodMap.has(key)) {
                // Se já existe, somar quantidade
                const existing = foodMap.get(key);
                existing.totalQuantity = formatQuantity(existing.totalQuantityValue + quantity, unit);
                existing.totalQuantityValue += quantity;
            } else {
                // Criar novo item
                foodMap.set(key, {
                    name: foodName,
                    unit: unit,
                    category: category,
                    totalQuantity: formatQuantity(quantity, unit),
                    totalQuantityValue: quantity
                });
            }
        }
    }

    return Array.from(foodMap.values());
}

/**
 * Categoriza alimentos por grupo
 * @param {Array} items - Array de itens agregados
 * @returns {Object} Objeto com categorias como chaves
 */
function categorizeFoods(items) {
    const categorized = {};

    // Mapeamento de categorias para nomes mais amigáveis
    const categoryMap = {
        'Cereais e derivados': 'Cereais e Derivados',
        'Verduras, hortaliças e derivados': 'Verduras e Hortaliças',
        'Frutas e sucos': 'Frutas',
        'Carnes e derivados': 'Carnes',
        'Leite e derivados': 'Laticínios',
        'Óleos e gorduras': 'Óleos e Gorduras',
        'Pescados e frutos do mar': 'Peixes e Frutos do Mar',
        'Leguminosas': 'Leguminosas',
        'Nozes e sementes': 'Nozes e Sementes',
        'Bebidas': 'Bebidas',
        'Outros': 'Outros'
    };

    for (const item of items) {
        const category = categoryMap[item.category] || item.category || 'Outros';
        
        if (!categorized[category]) {
            categorized[category] = [];
        }
        
        categorized[category].push(item);
    }

    // Ordenar itens dentro de cada categoria alfabeticamente
    for (const category in categorized) {
        categorized[category].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    return categorized;
}

/**
 * Formata quantidade com unidade
 * @param {number} quantity - Quantidade
 * @param {string} unit - Unidade (g, ml, un, etc.)
 * @returns {string} Quantidade formatada
 */
function formatQuantity(quantity, unit) {
    // Arredondar para 2 casas decimais se necessário
    const rounded = Math.round(quantity * 100) / 100;
    
    // Se for número inteiro, não mostrar decimais
    if (rounded % 1 === 0) {
        return `${rounded} ${unit}`;
    }
    
    return `${rounded.toFixed(2)} ${unit}`;
}

