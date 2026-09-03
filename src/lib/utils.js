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
 * @returns {number|string} The formatted value
 */
export function formatNutrient(value) {
	if (value === null || value === undefined || isNaN(value)) return value;
	const num = Number(value);
	// Return as number so React renders it nicely without extra trailing zeros, up to 2 decimal places
	return Number(num.toFixed(2));
}