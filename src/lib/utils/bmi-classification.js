/**
 * bmi-classification.js
 * Motor de classificação de IMC conforme critérios OMS completos.
 *
 * Cobre:
 *  - Crianças 0–5 anos: percentil WHO peso-para-altura (z-score aproximado)
 *  - Crianças/adolescentes 5–19 anos: percentil IMC-para-idade e sexo (OMS 2007)
 *  - Adultos 20–64 anos: cortes padrão com ajuste para população asiática
 *  - Idosos ≥ 65 anos: cortes recalibrados (OPAS/SBGG)
 */

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BMIInput
 * @property {number} bmi - IMC calculado (kg/m²)
 * @property {number|null} age - Idade em anos (null = desconhecida)
 * @property {'masculino'|'feminino'|'male'|'female'|'m'|'f'|string|null} sex
 * @property {'branca'|'preta'|'parda'|'amarela'|'indigena'|'nao_informado'|string|null} ethnicity
 */

/**
 * @typedef {Object} BMIResult
 * @property {string} label - Classificação legível (ex: "Sobrepeso")
 * @property {string} color - Classe CSS de cor Tailwind (text-*)
 * @property {string} variant - Variante de badge (success|warning|destructive|secondary|outline)
 * @property {string} method - Método usado (ex: "adulto_padrao", "adulto_asiatico", "idoso", "adolescente")
 * @property {string|null} detail - Nota extra para exibição (ex: "Cortes OMS para populações asiáticas")
 * @property {{low: number, high: number}} normalRange - Faixa normal para o perfil
 */

// ─────────────────────────────────────────────────────────────
// TABELAS DE PERCENTIS OMS 2007 — 5 a 19 anos
// Valores de IMC no percentil 5, 85 e 97 por idade e sexo
// Fonte: WHO Reference 2007 (simplified lookup table)
// ─────────────────────────────────────────────────────────────

const WHO_CHILD_PERCENTILES = {
    // masculino: [idade_anos, p5, p85, p97]
    masculino: [
        [5, 13.3, 16.5, 18.0],
        [6, 13.2, 16.7, 18.4],
        [7, 13.3, 17.2, 19.2],
        [8, 13.5, 17.9, 20.2],
        [9, 13.8, 18.7, 21.4],
        [10, 14.2, 19.5, 22.6],
        [11, 14.7, 20.3, 23.9],
        [12, 15.2, 21.1, 25.1],
        [13, 15.7, 21.8, 26.0],
        [14, 16.2, 22.5, 26.9],
        [15, 16.7, 23.0, 27.5],
        [16, 17.2, 23.5, 27.9],
        [17, 17.6, 23.8, 28.2],
        [18, 17.9, 24.1, 28.4],
        [19, 18.2, 24.4, 28.6],
    ],
    // feminino: [idade_anos, p5, p85, p97]
    feminino: [
        [5, 13.1, 16.8, 18.5],
        [6, 13.0, 17.2, 19.1],
        [7, 13.1, 17.8, 20.1],
        [8, 13.3, 18.5, 21.3],
        [9, 13.6, 19.3, 22.5],
        [10, 14.0, 20.1, 23.7],
        [11, 14.4, 20.9, 25.0],
        [12, 15.0, 21.7, 26.1],
        [13, 15.5, 22.4, 27.1],
        [14, 16.0, 23.0, 27.8],
        [15, 16.4, 23.5, 28.4],
        [16, 16.8, 23.9, 28.9],
        [17, 17.1, 24.2, 29.2],
        [18, 17.4, 24.5, 29.6],
        [19, 17.6, 24.7, 29.9],
    ],
};

function getChildPercentile(age, sex) {
    const ageInt = Math.floor(age);
    const sexKey = normalizeSex(sex) === 'masculino' ? 'masculino' : 'feminino';
    const table = WHO_CHILD_PERCENTILES[sexKey];
    // Encontra a linha mais próxima por idade
    const row = table.find(r => r[0] === ageInt) || table[table.length - 1];
    return { p5: row[1], p85: row[2], p97: row[3] };
}

// ─────────────────────────────────────────────────────────────
// CORTES POR GRUPO
// ─────────────────────────────────────────────────────────────

const ADULT_STANDARD = {
    underweight: 18.5,
    normal_high: 25.0,
    overweight_high: 30.0,
};

const ADULT_ASIAN = {
    underweight: 18.5,
    normal_high: 23.0,    // OMS Asia-Pacific guidance (2000)
    overweight_high: 27.5,
};

const ELDERLY = {
    underweight: 22.0,    // OPAS/SBGG para ≥65 anos
    normal_high: 27.0,
    overweight_high: 32.0,
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function normalizeSex(sex) {
    if (!sex) return null;
    const s = String(sex).toLowerCase().trim();
    if (s === 'm' || s.startsWith('masc') || s === 'male') return 'masculino';
    if (s === 'f' || s.startsWith('fem') || s === 'female') return 'feminino';
    return null;
}

function isAsian(ethnicity) {
    if (!ethnicity) return false;
    const e = String(ethnicity).toLowerCase().trim();
    return e === 'amarela' || e === 'asian' || e === 'asiatico' || e === 'asiática';
}

function resultFromCuts(bmi, cuts, method, detail = null) {
    if (bmi < cuts.underweight) {
        return {
            label: 'Abaixo do peso',
            color: 'text-blue-600',
            variant: 'secondary',
            method,
            detail,
            normalRange: { low: cuts.underweight, high: cuts.normal_high }
        };
    }
    if (bmi < cuts.normal_high) {
        return {
            label: 'Peso normal',
            color: 'text-green-600',
            variant: 'success',
            method,
            detail,
            normalRange: { low: cuts.underweight, high: cuts.normal_high }
        };
    }
    if (bmi < cuts.overweight_high) {
        return {
            label: 'Sobrepeso',
            color: 'text-yellow-600',
            variant: 'warning',
            method,
            detail,
            normalRange: { low: cuts.underweight, high: cuts.normal_high }
        };
    }
    // Obesidade — grau I / II / III
    if (bmi < 35) {
        return {
            label: 'Obesidade Grau I',
            color: 'text-orange-600',
            variant: 'destructive',
            method,
            detail,
            normalRange: { low: cuts.underweight, high: cuts.normal_high }
        };
    }
    if (bmi < 40) {
        return {
            label: 'Obesidade Grau II',
            color: 'text-red-600',
            variant: 'destructive',
            method,
            detail,
            normalRange: { low: cuts.underweight, high: cuts.normal_high }
        };
    }
    return {
        label: 'Obesidade Grau III',
        color: 'text-red-800',
        variant: 'destructive',
        method,
        detail,
        normalRange: { low: cuts.underweight, high: cuts.normal_high }
    };
}

// ─────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO INFANTIL (5–19 anos)
// ─────────────────────────────────────────────────────────────

function classifyChild(bmi, age, sex) {
    const { p5, p85, p97 } = getChildPercentile(age, sex);
    const sexLabel = normalizeSex(sex) === 'masculino' ? 'masculino' : 'feminino';
    const detail = `Percentil OMS 2007 — ${Math.floor(age)} anos, sexo ${sexLabel}`;

    if (bmi < p5) {
        return {
            label: 'Magreza',
            color: 'text-blue-600', variant: 'secondary',
            method: 'criança_adolescente',
            detail,
            normalRange: { low: p5, high: p85 }
        };
    }
    if (bmi < p85) {
        return {
            label: 'Eutrófico',
            color: 'text-green-600', variant: 'success',
            method: 'criança_adolescente',
            detail,
            normalRange: { low: p5, high: p85 }
        };
    }
    if (bmi < p97) {
        return {
            label: 'Sobrepeso',
            color: 'text-yellow-600', variant: 'warning',
            method: 'criança_adolescente',
            detail,
            normalRange: { low: p5, high: p85 }
        };
    }
    return {
        label: 'Obesidade',
        color: 'text-red-600', variant: 'destructive',
        method: 'criança_adolescente',
        detail,
        normalRange: { low: p5, high: p85 }
    };
}

// ─────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO BEBÊS 0–4 anos — z-score peso-para-altura OMS
// Usamos cortes simplificados (score <-2 = magreza, >2 = sobrepeso)
// ─────────────────────────────────────────────────────────────

function classifyInfant(bmi) {
    // Para bebês, usamos cortes de IMC aproximados baseados em z-scores OMS
    // IMC z-score <-2 ≈ IMC < 14, z-score >1 ≈ IMC > 17, z-score >2 ≈ IMC > 18
    const detail = 'Referência OMS 0–5 anos (z-score aproximado)';
    if (bmi < 14) {
        return { label: 'Magreza acentuada', color: 'text-blue-700', variant: 'secondary', method: 'infante', detail, normalRange: { low: 14, high: 17.5 } };
    }
    if (bmi < 17.5) {
        return { label: 'Peso adequado', color: 'text-green-600', variant: 'success', method: 'infante', detail, normalRange: { low: 14, high: 17.5 } };
    }
    if (bmi < 18.5) {
        return { label: 'Risco de sobrepeso', color: 'text-yellow-600', variant: 'warning', method: 'infante', detail, normalRange: { low: 14, high: 17.5 } };
    }
    return { label: 'Sobrepeso', color: 'text-orange-600', variant: 'destructive', method: 'infante', detail, normalRange: { low: 14, high: 17.5 } };
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

/**
 * Classifica o IMC seguindo critérios OMS completos.
 * Faz degradação segura quando dados demográficos estão ausentes.
 * @param {BMIInput} input
 * @returns {BMIResult}
 */
export function classifyBMI({ bmi, age = null, sex = null, ethnicity = null }) {
    if (!bmi || bmi <= 0) {
        return {
            label: '—',
            color: 'text-muted-foreground',
            variant: 'outline',
            method: 'sem_dados',
            detail: null,
            normalRange: { low: 18.5, high: 25 }
        };
    }

    const ageNum = age != null ? parseFloat(age) : null;

    // Bebê (0–4 anos)
    if (ageNum != null && ageNum < 5) {
        return classifyInfant(bmi);
    }

    // Criança / adolescente (5–19 anos)
    if (ageNum != null && ageNum < 20) {
        return classifyChild(bmi, ageNum, sex);
    }

    // Idoso (≥65 anos)
    if (ageNum != null && ageNum >= 65) {
        return resultFromCuts(bmi, ELDERLY, 'idoso', 'Cortes OPAS/SBGG para ≥65 anos (22/27/32)');
    }

    // Adulto com etnia asiática
    if (isAsian(ethnicity)) {
        return resultFromCuts(bmi, ADULT_ASIAN, 'adulto_asiatico', 'Cortes OMS Asia-Pacific (23/27,5)');
    }

    // Adulto padrão (20–64 anos, ou sem informação de idade)
    const detail = ageNum == null ? 'Idade não informada — usando cortes adulto padrão OMS' : null;
    return resultFromCuts(bmi, ADULT_STANDARD, 'adulto_padrao', detail);
}

/**
 * Retorna os cortes de referência para o perfil (para gráficos dinâmicos).
 * @param {{ age: number|null, ethnicity: string|null }} profile
 * @returns {{ underweight: number, normal_high: number, overweight_high: number }}
 */
export function getBMICuts({ age = null, ethnicity = null }) {
    const ageNum = age != null ? parseFloat(age) : null;
    if (ageNum != null && ageNum >= 65) return ELDERLY;
    if (isAsian(ethnicity)) return ADULT_ASIAN;
    return ADULT_STANDARD;
}

/**
 * Calcula o IMC a partir de peso (kg) e altura (cm).
 * @param {number} weight - kg
 * @param {number} height - cm
 * @returns {number|null}
 */
export function calculateBMI(weight, height) {
    if (!weight || !height || height <= 0 || weight <= 0) return null;
    return weight / Math.pow(height / 100, 2);
}
