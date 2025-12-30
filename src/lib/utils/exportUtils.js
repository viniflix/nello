import Papa from 'papaparse';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Export financial records to CSV format for accountants
 * @param {Array} records - Array of financial transaction records
 * @param {string} format - Export format ('csv' or 'xlsx' - CSV only for now)
 * @returns {void}
 */
export function exportFinancialReport(records, format = 'csv') {
    if (!records || records.length === 0) {
        throw new Error('Nenhum registro para exportar');
    }

    // Prepare data for export
    const exportData = records.map(record => {
        const transactionDate = record.transaction_date
            ? format(new Date(record.transaction_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
            : '-';

        return {
            'Data': transactionDate,
            'Tipo': record.type === 'income' ? 'Receita' : 'Despesa',
            'Categoria': record.category || '-',
            'Descrição': record.description || '-',
            'Nome do Paciente': record.patient?.name || '-',
            'CPF do Paciente': record.patient?.cpf ? formatCPF(record.patient.cpf) : '-',
            'Valor (R$)': parseFloat(record.amount || 0).toFixed(2),
            'Status': getStatusLabel(record.status),
            'Data de Vencimento': record.due_date 
                ? format(new Date(record.due_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                : '-'
        };
    });

    if (format === 'csv') {
        // Generate CSV
        const csv = Papa.unparse(exportData, {
            delimiter: ';', // Semicolon for Excel compatibility in Brazil
            encoding: 'UTF-8'
        });

        // Add BOM for UTF-8 (Excel compatibility)
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `relatorio_financeiro_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        throw new Error(`Formato ${format} não suportado. Use 'csv'.`);
    }
}

/**
 * Format CPF (XXX.XXX.XXX-XX)
 */
function formatCPF(cpf) {
    if (!cpf) return '';
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return cpf;
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Get status label in Portuguese
 */
function getStatusLabel(status) {
    const labels = {
        'paid': 'Pago',
        'pending': 'Pendente',
        'overdue': 'Vencido'
    };
    return labels[status] || status;
}

