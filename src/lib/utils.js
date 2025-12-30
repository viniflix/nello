import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

/**
 * Format a number as Brazilian Real currency
 * @param {number} value - The value to format
 * @returns {string} Formatted currency string (e.g., "R$ 1.234,56")
 */
export function formatCurrency(value) {
	return new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL'
	}).format(value || 0);
}