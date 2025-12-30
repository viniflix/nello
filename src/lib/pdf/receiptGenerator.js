import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Format currency value for receipt
 */
function formatCurrencyForReceipt(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Generate a professional receipt PDF for a financial transaction
 * @param {Object} transaction - Transaction object
 * @param {Object} nutritionistProfile - Nutritionist profile with name, crn, address, etc.
 * @param {Object} patientProfile - Patient profile with name, cpf
 * @returns {Promise<void>}
 */
export async function generateReceipt(transaction, nutritionistProfile, patientProfile) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

    // Colors
    const primaryColor = [41, 128, 185]; // Blue
    const textColor = [51, 51, 51]; // Dark gray

    // Header Section
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Logo/Title Area
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Gerado por HipoZero', pageWidth / 2, 28, { align: 'center' });

    yPos = 50;

    // Nutritionist Information
    doc.setTextColor(...textColor);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PRESTADOR DE SERVIÇOS', margin, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (nutritionistProfile?.name) {
        doc.text(`Nome: ${nutritionistProfile.name}`, margin, yPos);
        yPos += 6;
    }

    if (nutritionistProfile?.crn) {
        doc.text(`CRN: ${nutritionistProfile.crn}`, margin, yPos);
        yPos += 6;
    }

    if (nutritionistProfile?.address) {
        const address = nutritionistProfile.address;
        let addressLine = '';
        if (address.street) addressLine += address.street;
        if (address.city) addressLine += addressLine ? `, ${address.city}` : address.city;
        if (address.state) addressLine += addressLine ? ` - ${address.state}` : address.state;
        if (address.zip) addressLine += addressLine ? `, CEP: ${address.zip}` : `CEP: ${address.zip}`;
        
        if (addressLine) {
            doc.text(`Endereço: ${addressLine}`, margin, yPos);
            yPos += 6;
        }
    }

    if (nutritionistProfile?.phone) {
        doc.text(`Telefone: ${nutritionistProfile.phone}`, margin, yPos);
        yPos += 6;
    }

    if (nutritionistProfile?.email) {
        doc.text(`E-mail: ${nutritionistProfile.email}`, margin, yPos);
        yPos += 6;
    }

    yPos += 5;

    // Separator Line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Receipt Body
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGAMENTO', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Receipt Text
    const patientName = patientProfile?.name || 'Paciente';
    const patientCPF = patientProfile?.cpf ? ` (CPF: ${formatCPF(patientProfile.cpf)})` : '';
    const amount = parseFloat(transaction.amount || 0);
    const amountText = formatCurrencyForReceipt(amount).replace('R$', '').trim();
    const description = transaction.description || 'Serviço de nutrição';
    const transactionDate = transaction.transaction_date 
        ? format(new Date(transaction.transaction_date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        : format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

    const receiptText = `Recebi de ${patientName}${patientCPF} a importância de ${amountText} (${numberToWords(amount)}) referente a ${description}.`;

    // Split text into lines if too long
    const maxWidth = pageWidth - (margin * 2);
    const lines = doc.splitTextToSize(receiptText, maxWidth);
    
    lines.forEach((line, index) => {
        doc.text(line, margin, yPos);
        yPos += 6;
    });

    yPos += 10;

    // Date
    doc.text(`Data: ${transactionDate}`, margin, yPos);
    yPos += 15;

    // Signature Line
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('Assinatura do Prestador de Serviços', pageWidth / 2, yPos, { align: 'center' });

    // Footer
    yPos = pageHeight - 20;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Este documento foi gerado automaticamente pelo sistema HipoZero', pageWidth / 2, yPos, { align: 'center' });
    doc.text('Para fins de comprovação fiscal e reembolso de planos de saúde', pageWidth / 2, yPos + 5, { align: 'center' });

    // Generate filename
    const fileName = `recibo_${patientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    
    // Save PDF
    doc.save(fileName);
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
 * Convert number to words in Portuguese
 */
function numberToWords(num) {
    const ones = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
        'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    if (num === 0) return 'zero reais';
    if (num >= 1000000) return 'valor muito alto'; // Simplified for large numbers

    let result = '';

    // Integer part
    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);

    if (integerPart > 0) {
        result += convertNumber(integerPart, ones, tens, hundreds);
        result += integerPart === 1 ? ' real' : ' reais';
    }

    // Decimal part (cents)
    if (decimalPart > 0) {
        if (result) result += ' e ';
        result += convertNumber(decimalPart, ones, tens, hundreds);
        result += decimalPart === 1 ? ' centavo' : ' centavos';
    }

    return result;
}

function convertNumber(num, ones, tens, hundreds) {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) {
        const ten = Math.floor(num / 10);
        const one = num % 10;
        return tens[ten] + (one > 0 ? ' e ' + ones[one] : '');
    }
    if (num < 1000) {
        const hundred = Math.floor(num / 100);
        const remainder = num % 100;
        if (hundred === 1 && remainder === 0) return 'cem';
        return hundreds[hundred] + (remainder > 0 ? ' e ' + convertNumber(remainder, ones, tens, hundreds) : '');
    }
    if (num < 1000000) {
        const thousand = Math.floor(num / 1000);
        const remainder = num % 1000;
        return convertNumber(thousand, ones, tens, hundreds) + ' mil' + (remainder > 0 ? ' e ' + convertNumber(remainder, ones, tens, hundreds) : '');
    }
    return '';
}

