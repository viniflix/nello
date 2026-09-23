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

/**
 * Format a nutrient value, limiting to 2 decimal places maximum
 * @param {number|string} value - The value to format
 * @returns {string} The formatted value
 */
export function formatNutrient(value) {
	if (value === null || value === undefined || value === '') return '—';
	const num = Number(value);
	return Number.isFinite(num) ? num.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—';
}
