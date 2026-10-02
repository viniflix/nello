/**
 * Catálogo de atividades físicas com valores MET (Metabolic Equivalent of Task).
 * Usado para autocomplete/combobox no módulo de Gastos Energéticos.
 * Fonte: Compendium of Physical Activities e literatura padrão.
 *
 * @typedef {{ id: string, name: string, met: number }} PhysicalActivity
 */

/** @type {PhysicalActivity[]} */
export const MET_REFERENCE = 'https://pacompendium.com/';
export const MET_CATALOG_VERSION = '2024-adult';
// Every suggestion identifies one published activity, rather than assuming a
// universal intensity for a sport. Saved activities retain their stored MET.
const activity = (id,name,met,code,category) => ({id,name,met,code,reference:MET_REFERENCE+category+'/',version:MET_CATALOG_VERSION});
export const PHYSICAL_ACTIVITIES = [
  activity('sleep','Sono',1,'07030','inactivity'),
  activity('office-sedentary','Escritório sentado, tarefas leves',1.5,'11580','occupation'),
  activity('walk-light','Caminhada em terreno plano, cerca de 4 km/h',3,'17170','walking'),
  activity('walk-brisk','Caminhada em terreno plano, 5,6–6,3 km/h',4.8,'17200','walking'),
  activity('strength-light','Resistência com peso corporal, geral',3,'02056','conditioning-exercise'),
  activity('strength-moderate','Musculação, exercícios variados, 8–15 repetições',3.5,'02054','conditioning-exercise'),
  activity('strength-intense','Musculação, esforço vigoroso',6,'02050','conditioning-exercise'),
  activity('run-8kmh','Corrida, cerca de 8–8,4 km/h',8.5,'12030','running'),
  activity('run-10kmh','Corrida, cerca de 9,7–10,1 km/h',9.3,'12050','running'),
  activity('soccer-recreational','Futebol recreativo',7,'15610','sports'),
  activity('soccer-competitive','Futebol competitivo',9.5,'15605','sports'),
  activity('basketball','Basquete, partida',8,'15040','sports'),
  activity('swimming-crawl-moderate','Crawl, 27–41 m/min, esforço moderado',5.8,'18292','water-activities'),
  activity('yoga','Yoga, geral',2.3,'02175','conditioning-exercise'),
  activity('aerobics-dance','Aeróbica, geral',7.3,'02000','conditioning-exercise'),
  activity('cycling-light','Ciclismo, ritmo leve escolhido pelo praticante',4.3,'01015','bicycling'),
  activity('cycling-moderate','Ciclismo, ritmo moderado escolhido pelo praticante',7,'01016','bicycling'),
  activity('cycling-vigorous','Ciclismo, ritmo vigoroso escolhido pelo praticante',9,'01017','bicycling'),
  activity('pilates','Pilates, geral',2.8,'02105','conditioning-exercise'),
  activity('stretching','Alongamento leve',2.3,'02101','conditioning-exercise'),
  activity('elliptical','Elíptico, esforço moderado',5,'02048','conditioning-exercise'),
  activity('rowing-machine','Remo estacionário, menos de 100 W',5,'02071','conditioning-exercise'),
  activity('jump-rope','Pular corda, exercício geral',11,'02068','conditioning-exercise'),
  activity('hiking','Trilha em terreno variado',6,'17080','walking'),
  activity('running-12kmh','Corrida, cerca de 12 km/h',11.8,'12080','running'),
  activity('swimming-leisure','Natação recreativa, sem voltas',6,'18310','water-activities'),
  activity('water-aerobics','Hidroginástica, geral',5.3,'02120','conditioning-exercise'),
  activity('interval-training','Exercício intervalado intenso, esforço moderado',7,'02210','conditioning-exercise'),
  activity('functional-training','Treino em circuito, esforço moderado',5,'02035','conditioning-exercise'),
  activity('stair-climbing','Subir escadas, geral',6.8,'17131','walking'),
  activity('housework-light','Limpeza doméstica leve, geral',2.5,'05040','home-activities'),
  activity('housework-heavy','Limpeza doméstica pesada, esforço moderado',3.5,'05020','home-activities'),
  activity('gardening','Jardinagem, esforço moderado',3.8,'08245','lawn-garden'),
  activity('standing-desk','Trabalho em pé, tarefas leves',1.8,'11600','occupation'),
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
