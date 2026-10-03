// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderMealPlanPdf, prescriptionQuantity } from '../../../supabase/functions/_shared/clinical-document.js';
const api = { PDFDocument, StandardFonts, rgb };
describe('meal plan PDF layout', () => {
  it('renders saved portions, notes and alternatives across pages, including long names', async () => {
    const record = { name: 'Plano sintético', description: 'Descrição', daily_calories: 287.92, daily_protein: 20.6, daily_carbs: 50.1, daily_fat: 10.5, meal_plan_meals: Array.from({ length: 16 }, (_, index) => ({ name: `Refeição ${index}`, meal_time: '07:00', order_index: 16-index, include_in_totals: index !== 1, notes: 'Observação', meal_plan_foods: [{ quantity: 1, unit: 'uuid', measure_snapshot: { label: 'Colher de sopa' }, food_snapshot: { name: 'DescriçãoComMuitoComprimento'.repeat(14) }, calories: 287.92, protein: 20.6, carbs: 50.1, fat: 10.5, notes: 'Preparo', substitutes: [{ name: 'Alternativa', quantity: 50, unit: 'gram' }, {}] }] })) };
    const bytes = await renderMealPlanPdf(api, record, { patientName: 'Exemplo', professionalName: 'Nutricionista' });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getPages().every(page => page.getHeight() === 841.89)).toBe(true);
    expect(bytes.length).toBeLessThan(2_000_000);
  });
  it('renders the patient version without nutrients or optional identity', async () => {
    const bytes = await renderMealPlanPdf(api, { meal_plan_meals: [{ meal_plan_foods: [{ patient_description: 'Verduras livres', quantity: 0, unit: 'g' }, { food: { name: 'Água' }, quantity: 200, unit: 'ml' }, {}] }] }, { includeNutrients: false });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(prescriptionQuantity({ quantity: 'invalid', unit: '123' })).toContain('medida não registrada');
    expect(prescriptionQuantity({ quantity: 1, unit: 'custom_missing' })).not.toContain('custom_');
    expect(prescriptionQuantity({ quantity: 1, measure: { measure_label: 'Unidade' } })).toBe('1 Unidade');
    expect(prescriptionQuantity({ quantity: 1, unit: 'tablespoon' })).toBe('1 colher de sopa');
  });
  it('bounds excessively large documents before reaching the upload limit', async () => {
    await expect(renderMealPlanPdf(api, { meal_plan_meals: Array.from({ length: 400 }, () => ({ name: 'Refeição', meal_plan_foods: Array.from({ length: 10 }, () => ({ quantity: 100, food: { name: 'Alimento' } })) })) })).rejects.toThrow('pdf_too_large');
  });
});
