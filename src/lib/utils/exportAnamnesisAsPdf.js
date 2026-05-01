/**
 * useAnamnesisExport — Sprint 7
 * Exporta a anamnese preenchida como PDF formatado.
 * Usa jsPDF + autoTable para layout profissional de duas colunas.
 */

export async function exportAnamnesisAsPdf({ record, template, patientName, nutritionistName }) {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = margin;

    // ── Header ───────────────────────────────────────────────────
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(template?.title || 'Anamnese', margin, 13);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nutricionista: ${nutritionistName || '—'}`, pageWidth - margin, 9, { align: 'right' });
    doc.text(`Paciente: ${patientName || '—'}`, pageWidth - margin, 14, { align: 'right' });

    const dateStr = record.date
        ? new Date(record.date + 'T12:00:00').toLocaleDateString('pt-BR')
        : new Date(record.created_at).toLocaleDateString('pt-BR');
    doc.text(`Data: ${dateStr}`, pageWidth - margin, 19, { align: 'right' });

    y = 30;
    doc.setTextColor(30, 41, 59);

    // ── Seções e Campos ──────────────────────────────────────────
    const content = record.content || {};
    const sections = template?.sections || [];

    for (const section of sections) {
        if (!section.fields?.length) continue;

        // Título da seção
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);

        if (y > 260) { doc.addPage(); y = margin; }

        doc.setFillColor(241, 245, 249); // slate-100
        doc.roundedRect(margin, y, pageWidth - margin * 2, 7, 1, 1, 'F');
        doc.text(section.title || 'Seção', margin + 3, y + 5);
        y += 10;

        // Montar rows da tabela
        const rows = section.fields.map(field => {
            const rawAnswer = content[field.id];
            let answer = '';

            if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') {
                answer = '—';
            } else if (Array.isArray(rawAnswer)) {
                answer = rawAnswer.join(', ') || '—';
            } else if (typeof rawAnswer === 'number') {
                answer = field.type === 'scale_1_10' ? `${rawAnswer}/10` : String(rawAnswer);
            } else {
                answer = String(rawAnswer);
            }

            return [field.label || field.id, answer];
        });

        autoTable(doc, {
            startY: y,
            head: [['Campo', 'Resposta']],
            body: rows,
            margin: { left: margin, right: margin },
            theme: 'grid',
            headStyles: {
                fillColor: [99, 102, 241], // indigo
                textColor: 255,
                fontSize: 8,
                fontStyle: 'bold',
                halign: 'left',
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [30, 41, 59],
                valign: 'middle',
            },
            columnStyles: {
                0: { cellWidth: 70, fontStyle: 'bold', fillColor: [248, 250, 252] },
                1: { cellWidth: 'auto' },
            },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            didDrawPage: (data) => {
                y = data.cursor.y + 6;
            },
        });

        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Rodapé ───────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
            `HipoZero • Gerado em ${new Date().toLocaleString('pt-BR')} • Pág ${i}/${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 6,
            { align: 'center' }
        );
    }

    const safePatient = (patientName || 'paciente').replace(/\s+/g, '_');
    const safeTitle = (template?.title || 'anamnese').replace(/\s+/g, '_');
    doc.save(`${safePatient}_${safeTitle}.pdf`);
}
