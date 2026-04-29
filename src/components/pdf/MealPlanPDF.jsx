import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { HIPOZERO_LOGO_URL } from '@/lib/pdf/pdfAssets';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';

// Registrando fontes (opcional, mas garante suporte a caracteres especiais e negrito suave)
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf', fontWeight: 300 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf', fontWeight: 500 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
  ]
});

// Cores do Projeto HipoZero
const colors = {
  primary: '#467D46', // hsl(100, 31%, 38%)
  secondary: '#EE6706', // hsl(26, 95%, 48%)
  text: '#44403c', // stone-800
  muted: '#78716c', // stone-500
  light: '#f5f5f4', // stone-100
  border: '#e7e5e4', // stone-200
  bgAlt: '#fafaf9', // stone-50
  greenLight: '#f0fdf4',
  greenDark: '#166534',
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Roboto',
    fontSize: 10,
    color: colors.text,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingBottom: 10,
  },
  logo: {
    width: 120,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  infoSection: {
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    width: 80,
    fontWeight: 700,
    color: colors.muted,
  },
  infoValue: {
    flex: 1,
    fontWeight: 500,
  },
  generalNotes: {
    backgroundColor: colors.bgAlt,
    padding: 10,
    borderRadius: 4,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  notesTitle: {
    fontWeight: 700,
    marginBottom: 4,
    color: colors.secondary,
  },
  macrosCard: {
    flexDirection: 'row',
    backgroundColor: colors.light,
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.primary,
  },
  macroLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 2,
  },
  mealSection: {
    marginBottom: 15,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 8,
    borderRadius: 4,
    marginBottom: 5,
  },
  mealTitle: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 12,
  },
  mealTime: {
    color: '#ffffff',
    fontSize: 10,
    marginLeft: 5,
    fontWeight: 300,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
    marginBottom: 4,
    marginTop: 5,
  },
  colFood: { flex: 2.5 },
  colQty: { flex: 1.2, textAlign: 'center' },
  colKcal: { flex: 0.9, textAlign: 'center' },
  colMacro: { flex: 1.1, textAlign: 'center' },
  thText: {
    fontWeight: 700,
    fontSize: 8,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  foodRowBlock: {
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgAlt,
    paddingBottom: 4,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  foodName: {
    fontWeight: 500,
    fontSize: 10,
  },
  foodOriginalName: {
    fontSize: 8,
    color: colors.muted,
  },
  foodNotes: {
    fontSize: 8,
    color: colors.muted,
    marginTop: 2,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  substituteBlock: {
    marginTop: 4,
    paddingLeft: 10,
  },
  substituteTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: colors.secondary,
    marginBottom: 2,
  },
  substituteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  substituteBullet: {
    width: 3,
    height: 3,
    backgroundColor: colors.muted,
    borderRadius: 2,
    marginRight: 4,
  },
  substituteText: {
    fontSize: 8,
    color: colors.text,
  },
  mealNotes: {
    marginTop: 5,
    padding: 8,
    backgroundColor: colors.greenLight,
    borderRadius: 4,
    fontSize: 9,
    color: colors.greenDark,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    fontSize: 8,
    color: colors.muted,
  },
  micronutrientsSection: {
    marginTop: 20,
  },
  microTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.primary,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 5,
  },
  microGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  microItem: {
    width: '33%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 15,
    marginBottom: 6,
  },
  microLabel: {
    color: colors.muted,
  },
  microValue: {
    fontWeight: 700,
  },
  // Food Block Patient-Focused
  foodBlock: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  foodPrimaryText: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  foodBullet: {
    width: 4,
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginTop: 4,
    marginRight: 6,
  },
  foodQtyHighlight: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.primary,
  },
  foodNameHighlight: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.text,
  },
  foodNameNormal: {
    fontSize: 10,
    color: colors.text,
  },
  foodMacrosRow: {
    fontSize: 7,
    color: colors.muted,
    marginTop: 2,
    marginLeft: 10,
  },
  foodNotesPatient: {
    fontSize: 8,
    color: colors.text,
    backgroundColor: '#f8fafc',
    padding: 4,
    paddingLeft: 6,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    marginTop: 4,
    marginLeft: 10,
  },
  // --- Novos estilos para a página de Relatório Nutricional ---
  reportTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: colors.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.secondary,
    marginTop: 15,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    width: 60,
    fontSize: 9,
    fontWeight: 700,
    color: colors.text,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.bgAlt,
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  progressText: {
    width: 80,
    fontSize: 8,
    color: colors.muted,
    textAlign: 'right',
  },
  distributionContainer: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 5,
  },
  distributionLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 9,
    color: colors.text,
  },
  bentoContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  bentoCard: {
    width: '48%',
    backgroundColor: colors.bgAlt,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  bentoCardTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.primary,
    marginBottom: 8,
  },
  bentoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff',
    paddingVertical: 3,
  },
  bentoLabel: {
    fontSize: 8,
    color: colors.text,
  },
  bentoValue: {
    fontSize: 8,
    fontWeight: 700,
    color: colors.secondary,
  }
});

const MealPlanPDF = ({ 
  mealPlan, 
  patientName, 
  nutritionistName, 
  includeNutrients, 
  translateMealType, 
  planTotals 
}) => {
  const getProgress = (current, target) => {
    if (!target || target <= 0) return 0;
    const pct = (current / target) * 100;
    return Math.min(Math.round(pct), 100);
  };

  // Cálculos para o relatório
  const totalMacros = (planTotals?.protein || 0) + (planTotals?.carbs || 0) + (planTotals?.fat || 0);
  const ptnDist = totalMacros > 0 ? ((planTotals?.protein || 0) / totalMacros) * 100 : 0;
  const choDist = totalMacros > 0 ? ((planTotals?.carbs || 0) / totalMacros) * 100 : 0;
  const lipDist = totalMacros > 0 ? ((planTotals?.fat || 0) / totalMacros) * 100 : 0;

  const calPct = getProgress(planTotals?.calories, mealPlan?.daily_calories);
  const ptnPct = getProgress(planTotals?.protein, mealPlan?.daily_protein);
  const choPct = getProgress(planTotals?.carbs, mealPlan?.daily_carbs);
  const lipPct = getProgress(planTotals?.fat, mealPlan?.daily_fat);
  const mealOrder = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'];
  const sortedMeals = [...(mealPlan.meals || [])].sort(
    (a, b) => mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type)
  );

  const startDate = mealPlan.start_date ? new Date(mealPlan.start_date).toLocaleDateString('pt-BR') : '';
  const endDate = mealPlan.end_date ? new Date(mealPlan.end_date).toLocaleDateString('pt-BR') : 'Indeterminado';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <Image style={styles.logo} src={HIPOZERO_LOGO_URL} />
          <Text style={styles.headerTitle}>Plano Alimentar</Text>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Paciente:</Text>
            <Text style={styles.infoValue}>{patientName || 'Não informado'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nutricionista:</Text>
            <Text style={styles.infoValue}>{nutritionistName || 'Não informado'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Período:</Text>
            <Text style={styles.infoValue}>{startDate} até {endDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Data:</Text>
            <Text style={styles.infoValue}>{new Date().toLocaleDateString('pt-BR')}</Text>
          </View>
        </View>

        {/* Observações Gerais */}
        {mealPlan.description ? (
          <View style={styles.generalNotes}>
            <Text style={styles.notesTitle}>Observações Gerais</Text>
            <Text>{mealPlan.description}</Text>
          </View>
        ) : null}

        {/* Macros Totais */}
        <View style={styles.macrosCard}>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{Math.round(planTotals?.calories || 0)} kcal</Text>
            <Text style={styles.macroLabel}>Calorias Totais</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{Math.round(planTotals?.protein || 0)}g</Text>
            <Text style={styles.macroLabel}>Proteínas</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{Math.round(planTotals?.carbs || 0)}g</Text>
            <Text style={styles.macroLabel}>Carboidratos</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{Math.round(planTotals?.fat || 0)}g</Text>
            <Text style={styles.macroLabel}>Gorduras</Text>
          </View>
        </View>

        {/* Refeições */}
        {sortedMeals.map((meal, index) => {
          const mealName = translateMealType ? translateMealType(meal.meal_type) : (meal.name || meal.meal_type);
          const foods = meal.foods || [];

          return (
            <View key={index} style={styles.mealSection} wrap={false}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealTitle}>{mealName}</Text>
                {meal.meal_time ? <Text style={styles.mealTime}>• {meal.meal_time.substring(0, 5)}</Text> : null}
                <Text style={styles.mealTime}>• {Math.round(meal.calories || meal.total_calories || 0)} kcal</Text>
              </View>

              {foods.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {foods.map((food, fIndex) => {
                    const foodName = food.patient_description || food.food?.name || 'Alimento';
                    const qty = formatQuantityWithUnit(food.quantity || 0, food.unit || '', food.measure);
                    const isFree = String(food.quantity) === '0' || String(food.quantity).toLowerCase() === 'à vontade';
                    const qtyDisplay = isFree ? 'À vontade' : qty;
                    
                    return (
                      <View key={fIndex} style={styles.foodBlock} wrap={false}>
                        {/* Linha Primária: Quantidade e Nome */}
                        <View style={styles.foodPrimaryText}>
                          <View style={styles.foodBullet} />
                          <Text style={styles.foodNameNormal}>
                            <Text style={styles.foodQtyHighlight}>{qtyDisplay}</Text>
                            {isFree ? ' ' : ' de '}
                            <Text style={styles.foodNameHighlight}>{foodName}</Text>
                            {food.patient_description && food.food?.name ? ` (${food.food.name})` : ''}
                          </Text>
                        </View>
                        
                        {/* Linha Secundária: Macros Discretos */}
                        <Text style={styles.foodMacrosRow}>
                          {Math.round(food.calories || 0)} kcal • Prot: {Math.round(food.protein || 0)}g • Carb: {Math.round(food.carbs || 0)}g • Gord: {Math.round(food.fat || 0)}g
                        </Text>
                        
                        {/* Observações da Nutri para o Alimento */}
                        {food.notes ? (
                          <Text style={styles.foodNotesPatient}>Obs: {food.notes}</Text>
                        ) : null}

                        {/* Opções de Substituição */}
                        {food.substitutes && food.substitutes.length > 0 ? (
                          <View style={[styles.substituteBlock, { marginLeft: 10 }]}>
                            <Text style={[styles.substituteTitle, { fontSize: 8 }]}>Ou substitua por:</Text>
                            {food.substitutes.map((sub, sIndex) => (
                              <View key={sIndex} style={[styles.substituteItem, { marginBottom: 2 }]}>
                                <Text style={styles.substituteText}>• {sub.name}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Meal Notes */}
              {meal.notes ? (
                <Text style={styles.mealNotes}>Obs. da refeição: {meal.notes}</Text>
              ) : null}
            </View>
          );
        })}

        {/* Micronutrientes (agora removido daqui para a próxima página) */}

        {/* Footers Fixed on all pages */}
        <Text style={styles.footer} fixed>
          Documento gerado pelo sistema HipoZero em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
          `Página ${pageNumber} de ${totalPages}`
        )} fixed />
      </Page>

      {/* --- Página de Relatório Nutricional Completo --- */}
      {includeNutrients && planTotals && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.reportTitle}>Análise e Relatório Nutricional</Text>

          {/* Comparativo de Metas */}
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Atingimento da Meta (Planejado vs Alvo)</Text>
            
            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>Calorias</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${calPct}%`, backgroundColor: calPct > 100 ? colors.redLight : colors.primary }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(planTotals.calories || 0)} / {mealPlan.daily_calories || 0} kcal</Text>
            </View>

            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>Proteínas</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${ptnPct}%`, backgroundColor: '#10b981' }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(planTotals.protein || 0)} / {mealPlan.daily_protein || 0} g</Text>
            </View>

            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>Carbos</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${choPct}%`, backgroundColor: '#f59e0b' }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(planTotals.carbs || 0)} / {mealPlan.daily_carbs || 0} g</Text>
            </View>

            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>Gorduras</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${lipPct}%`, backgroundColor: '#eab308' }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(planTotals.fat || 0)} / {mealPlan.daily_fat || 0} g</Text>
            </View>
          </View>

          {/* Distribuição de Macronutrientes */}
          <View style={{ marginTop: 20 }} wrap={false}>
            <Text style={styles.sectionTitle}>Distribuição da Dieta (Macros)</Text>
            
            <View style={styles.distributionContainer}>
              <View style={{ height: '100%', width: `${ptnDist}%`, backgroundColor: '#10b981' }} />
              <View style={{ height: '100%', width: `${choDist}%`, backgroundColor: '#f59e0b' }} />
              <View style={{ height: '100%', width: `${lipDist}%`, backgroundColor: '#eab308' }} />
            </View>
            
            <View style={styles.distributionLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.legendText}>Proteína ({Math.round(ptnDist)}%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.legendText}>Carboidrato ({Math.round(choDist)}%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
                <Text style={styles.legendText}>Gordura ({Math.round(lipDist)}%)</Text>
              </View>
            </View>
          </View>

          {/* Bento-Grid de Micronutrientes */}
          <View style={{ marginTop: 10 }} wrap={false}>
            <Text style={styles.sectionTitle}>Detalhamento de Micronutrientes</Text>
            
            <View style={styles.bentoContainer}>
              {/* Minerais */}
              <View style={styles.bentoCard}>
                <Text style={styles.bentoCardTitle}>Sais Minerais Essenciais</Text>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Cálcio</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.calcium || 0)} mg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Ferro</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.iron || 0)} mg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Sódio</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.sodium || 0)} mg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Magnésio</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.magnesium || 0)} mg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Potássio</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.potassium || 0)} mg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Zinco</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.zinc || 0)} mg</Text>
                </View>
              </View>

              {/* Vitaminas e Fibras */}
              <View style={styles.bentoCard}>
                <Text style={styles.bentoCardTitle}>Vitaminas e Fibras</Text>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Fibras</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.fiber || 0)} g</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Vitamina A</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.vitamin_a || 0)} µg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Vitamina C</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.vitamin_c || 0)} mg</Text>
                </View>
                <View style={styles.bentoItem}>
                  <Text style={styles.bentoLabel}>Vitamina D</Text>
                  <Text style={styles.bentoValue}>{Math.round(planTotals.vitamin_d || 0)} µg</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Footers Fixed */}
          <Text style={styles.footer} fixed>
            Documento gerado pelo sistema HipoZero em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
            `Página ${pageNumber} de ${totalPages}`
          )} fixed />
        </Page>
      )}
    </Document>
  );
};

export default MealPlanPDF;
