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
  colFood: { flex: 3 },
  colQty: { flex: 1, textAlign: 'center' },
  colKcal: { flex: 1, textAlign: 'center' },
  colMacro: { flex: 0.8, textAlign: 'center' },
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
                {meal.meal_time ? <Text style={styles.mealTime}>• {meal.meal_time}</Text> : null}
              </View>

              {foods.length > 0 ? (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.colFood, styles.thText]}>Alimento</Text>
                    <Text style={[styles.colQty, styles.thText]}>Quantidade</Text>
                    <Text style={[styles.colKcal, styles.thText]}>Kcal</Text>
                    <Text style={[styles.colMacro, styles.thText]}>PTN</Text>
                    <Text style={[styles.colMacro, styles.thText]}>CHO</Text>
                    <Text style={[styles.colMacro, styles.thText]}>LIP</Text>
                  </View>

                  {foods.map((food, fIndex) => {
                    const foodName = food.patient_description || food.food?.name || 'Alimento';
                    const qty = formatQuantityWithUnit(food.quantity || 0, food.unit || '', food.measure);
                    
                    return (
                      <View key={fIndex} style={styles.foodRowBlock} wrap={false}>
                        <View style={styles.foodRow}>
                          <View style={styles.colFood}>
                            <Text style={styles.foodName}>{foodName}</Text>
                            {food.patient_description && food.food?.name ? (
                              <Text style={styles.foodOriginalName}>({food.food.name})</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.colQty, { fontSize: 9 }]}>{qty}</Text>
                          <Text style={[styles.colKcal, { fontSize: 9 }]}>{Math.round(food.calories || 0)}</Text>
                          <Text style={[styles.colMacro, { fontSize: 9 }]}>{Math.round(food.protein || 0)}g</Text>
                          <Text style={[styles.colMacro, { fontSize: 9 }]}>{Math.round(food.carbs || 0)}g</Text>
                          <Text style={[styles.colMacro, { fontSize: 9 }]}>{Math.round(food.fat || 0)}g</Text>
                        </View>
                        
                        {/* Food Notes */}
                        {food.notes ? (
                          <Text style={styles.foodNotes}>- Obs: {food.notes}</Text>
                        ) : null}

                        {/* Substitutes */}
                        {food.substitutes && food.substitutes.length > 0 ? (
                          <View style={styles.substituteBlock}>
                            <Text style={styles.substituteTitle}>Opções de Substituição:</Text>
                            {food.substitutes.map((sub, sIndex) => (
                              <View key={sIndex} style={styles.substituteItem}>
                                <View style={styles.substituteBullet} />
                                <Text style={styles.substituteText}>{sub.name}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </>
              ) : null}

              {/* Meal Notes */}
              {meal.notes ? (
                <Text style={styles.mealNotes}>Obs. da refeição: {meal.notes}</Text>
              ) : null}
            </View>
          );
        })}

        {/* Micronutrientes (opcional) */}
        {includeNutrients && planTotals && (
          <View style={styles.micronutrientsSection} wrap={false}>
            <Text style={styles.microTitle}>Resumo de Micronutrientes</Text>
            <View style={styles.microGrid}>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Fibras</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.fiber || 0)}g</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Sódio</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.sodium || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Cálcio</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.calcium || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Ferro</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.iron || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Magnésio</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.magnesium || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Potássio</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.potassium || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Zinco</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.zinc || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Vitamina A</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.vitamin_a || 0)}µg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Vitamina C</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.vitamin_c || 0)}mg</Text>
              </View>
              <View style={styles.microItem}>
                <Text style={styles.microLabel}>Vitamina D</Text>
                <Text style={styles.microValue}>{Math.round(planTotals.vitamin_d || 0)}µg</Text>
              </View>
            </View>
          </View>
        )}

        {/* Footers Fixed on all pages */}
        <Text style={styles.footer} fixed>
          Documento gerado pelo sistema HipoZero em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
          `Página ${pageNumber} de ${totalPages}`
        )} fixed />
      </Page>
    </Document>
  );
};

export default MealPlanPDF;
