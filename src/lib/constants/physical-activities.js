/**
 * Catálogo de atividades físicas com valores MET (Metabolic Equivalent of Task).
 * Usado para autocomplete/combobox no módulo de Gastos Energéticos.
 * Fonte: Compendium of Physical Activities e literatura padrão.
 *
 * @typedef {{ id: string, name: string, met: number }} PhysicalActivity
 */

/** @type {PhysicalActivity[]} */
export const PHYSICAL_ACTIVITIES = [
  { id: 'sleep', name: 'Sono/Repouso', met: 0.9 },
  { id: 'office-sedentary', name: 'Trabalho de escritório sentado', met: 1.5 },
  { id: 'walk-light', name: 'Caminhada leve', met: 3.0 },
  { id: 'walk-brisk', name: 'Caminhada rápida', met: 4.3 },
  { id: 'strength-light', name: 'Musculação leve', met: 3.0 },
  { id: 'strength-moderate', name: 'Musculação média', met: 4.5 },
  { id: 'strength-intense', name: 'Musculação intensa', met: 6.0 },
  { id: 'run-8kmh', name: 'Corrida 8 km/h', met: 8.3 },
  { id: 'run-10kmh', name: 'Corrida 10 km/h', met: 9.8 },
  { id: 'soccer-recreational', name: 'Futebol recreativo', met: 7.0 },
  { id: 'soccer-competitive', name: 'Futebol competitivo', met: 10.0 },
  { id: 'basketball', name: 'Basquete', met: 8.0 },
  { id: 'swimming-crawl-moderate', name: 'Natação crawl moderada', met: 8.0 },
  { id: 'yoga', name: 'Yoga', met: 2.5 },
  { id: 'aerobics-dance', name: 'Dança aeróbica', met: 7.3 },
  { id: 'cycling-light', name: 'Ciclismo leve', met: 6.0 },
  { id: 'cycling-moderate', name: 'Ciclismo moderado', met: 8.0 },
  { id: 'cycling-vigorous', name: 'Ciclismo vigoroso', met: 12.0 },
  { id: 'pilates', name: 'Pilates', met: 3.5 },
  { id: 'stretching', name: 'Alongamento', met: 2.3 },
  { id: 'elliptical', name: 'Elíptico', met: 5.0 },
  { id: 'rowing-machine', name: 'Remo (ergômetro)', met: 7.0 },
  { id: 'jump-rope', name: 'Pular corda', met: 11.0 },
  { id: 'hiking', name: 'Caminhada em trilha', met: 6.0 },
  { id: 'running-12kmh', name: 'Corrida 12 km/h', met: 11.5 },
  { id: 'swimming-leisure', name: 'Natação lazer', met: 6.0 },
  { id: 'water-aerobics', name: 'Hidroginástica', met: 4.0 },
  { id: 'crossfit', name: 'CrossFit', met: 8.0 },
  { id: 'functional-training', name: 'Treino funcional', met: 5.5 },
  { id: 'stair-climbing', name: 'Subir escadas', met: 9.0 },
  { id: 'housework-light', name: 'Serviços domésticos leves', met: 2.5 },
  { id: 'housework-heavy', name: 'Serviços domésticos pesados', met: 3.5 },
  { id: 'gardening', name: 'Jardinagem', met: 4.0 },
  { id: 'standing-desk', name: 'Trabalho em pé (leve)', met: 1.8 },
];

/**
 * Busca atividades por nome (case-insensitive, parcial).
 * @param {string} query
 * @returns {PhysicalActivity[]}
 */
export function searchPhysicalActivities(query) {
  if (!query || typeof query !== 'string') return PHYSICAL_ACTIVITIES.slice(0, 20);
  const q = query.trim().toLowerCase();
  if (!q) return PHYSICAL_ACTIVITIES.slice(0, 20);
  return PHYSICAL_ACTIVITIES.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 25);
}

/**
 * Retorna atividade por id.
 * @param {string} id
 * @returns {PhysicalActivity|undefined}
 */
export function getPhysicalActivityById(id) {
  return PHYSICAL_ACTIVITIES.find((a) => a.id === id);
}
