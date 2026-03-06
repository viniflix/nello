# Verificação hipozero.old (afyoidxrshkmplxhcyeh)

**Data:** 2025-03-05  
**Projeto:** `afyoidxrshkmplxhcyeh` (hipozero.old)

---

## 1. reference_foods

| Item | Resultado |
|------|-----------|
| **Existe** | ✅ Sim |
| **Linhas** | **0** |

A tabela existe mas está vazia. Pronta para receber a importação via `import-reference-foods.js` ou migração SQL.

---

## 2. nutritionist_foods

| Item | Resultado |
|------|-----------|
| **Existe** | ✅ Sim |
| **Linhas** | **0** |

A tabela existe e está vazia.

---

## 3. View `foods`

| Item | Resultado |
|------|-----------|
| **Existe** | ✅ Sim (é uma **VIEW**) |
| **Tipo** | `VIEW` |
| **SELECT * FROM foods LIMIT 1** | Retorna `[]` (0 linhas) |

A view `foods` existe e funciona. Está vazia porque provavelmente agrega `reference_foods` e `nutritionist_foods`, ambas vazias.

---

## 4. Estrutura das tabelas

### meal_plan_foods

| Coluna | Tipo |
|--------|------|
| id | bigint |
| meal_plan_meal_id | bigint |
| food_id | uuid |
| quantity | numeric |
| unit | text |
| calories | numeric |
| protein | numeric |
| carbs | numeric |
| fat | numeric |
| notes | text |
| order_index | integer |
| created_at | timestamp with time zone |

---

### meal_items

| Coluna | Tipo |
|--------|------|
| id | bigint |
| meal_id | bigint |
| name | text |
| quantity | numeric |
| calories | numeric |
| protein | numeric |
| fat | numeric |
| carbs | numeric |
| unit | text |
| reference_food_id | uuid |
| nutritionist_food_id | uuid |

---

### food_measures

| Coluna | Tipo |
|--------|------|
| id | uuid |
| reference_food_id | uuid |
| nutritionist_food_id | uuid |
| label | text |
| weight_in_grams | numeric |
| created_at | timestamp with time zone |

---

### food_household_measures

| Coluna | Tipo |
|--------|------|
| id | bigint |
| measure_id | bigint |
| quantity | numeric |
| grams | numeric |
| food_id | uuid |

---

## Resumo executivo

- **reference_foods** e **nutritionist_foods** existem e estão vazias.
- A view **foods** existe e está operacional.
- As tabelas **meal_plan_foods**, **meal_items**, **food_measures** e **food_household_measures** existem com as colunas listadas acima.
- **Próximo passo sugerido:** importar dados em `reference_foods` (ex.: via `scripts/import-reference-foods.js` ou `import-reference-foods-part01.sql`).
