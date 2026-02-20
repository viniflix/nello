/**
 * Retorna a data atual em formato YYYY-MM-DD.
 */
export const getTodayIsoDate = () => new Date().toISOString().split('T')[0];

/**
 * Formata uma data em YYYY-MM-DD.
 */
export const formatDateToIsoDate = (date) => new Date(date).toISOString().split('T')[0];

