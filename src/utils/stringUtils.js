/**
 * String Utilities - Funções auxiliares para manipulação de strings
 */

/**
 * Verifica se uma string contém outra (case insensitive, partial match)
 * @param {string} text - Texto principal
 * @param {string} searchTerm - Termo de busca
 * @returns {boolean} True se o texto contém o termo
 */
export function containsIgnoreCase(text, searchTerm) {
    if (!text || !searchTerm) return false;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Verifica se algum termo de uma lista está contido no texto (case insensitive)
 * @param {string} text - Texto principal
 * @param {string[]} searchTerms - Array de termos para buscar
 * @returns {string|null} Retorna o primeiro termo encontrado, ou null se nenhum for encontrado
 */
export function findFirstMatch(text, searchTerms) {
    if (!text || !searchTerms || searchTerms.length === 0) return null;
    
    const normalizedText = text.toLowerCase();
    
    for (const term of searchTerms) {
        if (term && normalizedText.includes(term.toLowerCase())) {
            return term;
        }
    }
    
    return null;
}

/**
 * Normaliza string para comparação (remove acentos, lowercase, trim)
 * @param {string} str - String a normalizar
 * @returns {string} String normalizada
 */
export function normalizeString(str) {
    if (!str) return '';
    
    return str
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Remove acentos
}

