import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Exporta uma evolução clínica (conteúdo HTML do Tiptap) como PDF formatado.
 */
export async function exportEvolutionAsPdf({ record, content, sections, patientName, nutritionistName, templateName }) {
    // Cria um container temporário
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm'; // Largura A4
    container.style.backgroundColor = '#ffffff';
    container.style.padding = '20mm';
    container.style.color = '#1e293b';
    container.style.fontFamily = 'Helvetica, Arial, sans-serif';
    
    // Formata a data
    const dateStr = record?.encounter_at
        ? new Date(record.encounter_at).toLocaleString('pt-BR')
        : new Date().toLocaleString('pt-BR');

    // Constrói o HTML das seções
    let contentHtml = '';
    if (sections && sections.length > 0) {
        for (const section of sections) {
            const sectionContent = content?.[section.key];
            if (sectionContent && sectionContent.trim() !== '') {
                contentHtml += `
                    <div style="margin-bottom: 24px;">
                        <h2 style="font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
                            ${section.label}
                        </h2>
                        <div>${sectionContent}</div>
                    </div>
                `;
            }
        }
    } else {
        contentHtml = '<p>Sem conteúdo registrado.</p>';
    }
    
    if (contentHtml === '') {
        contentHtml = '<p>Evolução vazia.</p>';
    }

    // Monta o HTML do cabeçalho, conteúdo e rodapé
    container.innerHTML = `
        <div style="border-bottom: 2px solid #475569; padding-bottom: 10px; margin-bottom: 20px;">
            <h1 style="margin: 0 0 10px 0; font-size: 24px; color: #0f172a;">${templateName || 'Evolução Clínica'}</h1>
            <div style="display: flex; justify-content: space-between; font-size: 14px; color: #475569;">
                <div>
                    <strong>Paciente:</strong> ${patientName || '—'}<br/>
                    <strong>Profissional:</strong> ${nutritionistName || '—'}
                </div>
                <div style="text-align: right;">
                    <strong>Atendimento:</strong> ${dateStr}
                </div>
            </div>
        </div>
        
        <div style="font-size: 14px; line-height: 1.6; color: #334155; min-height: 150mm;" class="prose max-w-none">
            ${contentHtml}
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #cbd5e1; text-align: center;">
            <div style="width: 250px; border-bottom: 1px solid #0f172a; margin: 0 auto 10px auto;"></div>
            <div style="font-size: 14px; color: #0f172a; font-weight: bold;">${nutritionistName || 'Profissional'}</div>
            <div style="font-size: 12px; color: #64748b;">Assinatura do Profissional</div>
        </div>
    `;

    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: 794 // Largura aproximada A4 a 96dpi
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        
        const safePatient = (patientName || 'paciente').replace(/\s+/g, '_').toLowerCase();
        const safeDate = dateStr.split(' ')[0].replace(/\//g, '-');
        pdf.save(`evolucao_${safePatient}_${safeDate}.pdf`);
    } finally {
        document.body.removeChild(container);
    }
}
