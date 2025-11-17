import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Download, Calendar, Utensils, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { translateMealType } from '@/utils/mealTranslations';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * MealPlanViewDialog - Dialog para visualizar plano alimentar completo e exportar para PDF
 */
export default function MealPlanViewDialog({ open, onOpenChange, mealPlan, patientName }) {
  if (!mealPlan) return null;

  // Ordenar refeições por ordem do dia
  const mealOrder = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'];
  const sortedMeals = [...(mealPlan.meal_plan_meals || [])].sort(
    (a, b) => mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type)
  );

  // Calcular totais do plano
  const planTotals = sortedMeals.reduce((acc, meal) => {
    const mealFoods = meal.meal_plan_foods || [];
    const mealTotals = mealFoods.reduce((mealAcc, food) => ({
      calories: mealAcc.calories + (food.calories || 0),
      protein: mealAcc.protein + (food.protein || 0),
      carbs: mealAcc.carbs + (food.carbs || 0),
      fat: mealAcc.fat + (food.fat || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    return {
      calories: acc.calories + mealTotals.calories,
      protein: acc.protein + mealTotals.protein,
      carbs: acc.carbs + mealTotals.carbs,
      fat: acc.fat + mealTotals.fat
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  /**
   * Exportar plano alimentar para PDF
   */
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPosition = 20;

    // Configurar fonte
    doc.setFont('helvetica');

    // Título
    doc.setFontSize(18);
    doc.setTextColor(99, 111, 82); // #5f6f52
    doc.text('Plano Alimentar', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    // Nome do paciente
    if (patientName) {
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(`Paciente: ${patientName}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 7;
    }

    // Período do plano
    const startDate = format(new Date(mealPlan.start_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const endDate = mealPlan.end_date
      ? format(new Date(mealPlan.end_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      : 'Indeterminado';

    doc.setFontSize(10);
    doc.text(`Período: ${startDate} até ${endDate}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12;

    // Resumo de Macros (Box)
    doc.setFillColor(245, 245, 245);
    doc.rect(15, yPosition, pageWidth - 30, 25, 'F');

    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text('Meta Diária Total', 20, yPosition + 7);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const macroText = `${Math.round(planTotals.calories)} kcal | Proteínas: ${Math.round(planTotals.protein)}g | Carboidratos: ${Math.round(planTotals.carbs)}g | Gorduras: ${Math.round(planTotals.fat)}g`;
    doc.text(macroText, 20, yPosition + 15);

    yPosition += 35;

    // Refeições
    sortedMeals.forEach((meal, index) => {
      // Verificar se precisa de nova página
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      // Nome da refeição
      doc.setFontSize(12);
      doc.setTextColor(99, 111, 82); // #5f6f52
      const mealName = translateMealType(meal.meal_type);
      const mealTime = meal.meal_time || '';
      doc.text(`${mealName}${mealTime ? ` - ${mealTime}` : ''}`, 15, yPosition);
      yPosition += 7;

      // Descrição (se houver)
      if (meal.name) {
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(meal.name, 15, yPosition);
        yPosition += 6;
      }

      // Tabela de alimentos
      const foods = meal.meal_plan_foods || [];
      if (foods.length > 0) {
        const tableData = foods.map(food => [
          food.foods?.name || 'Alimento',
          formatQuantityWithUnit(food.quantity || 0, food.unit || ''),
          `${Math.round(food.calories || 0)} kcal`,
          `${Math.round(food.protein || 0)}g`,
          `${Math.round(food.carbs || 0)}g`,
          `${Math.round(food.fat || 0)}g`
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Alimento', 'Quantidade', 'Calorias', 'Prot.', 'Carb.', 'Gord.']],
          body: tableData,
          theme: 'grid',
          headStyles: {
            fillColor: [169, 179, 136], // #a9b388
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold'
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [60, 60, 60]
          },
          alternateRowStyles: {
            fillColor: [250, 250, 250]
          },
          margin: { left: 15, right: 15 }
        });

        yPosition = doc.lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Nenhum alimento cadastrado', 15, yPosition);
        yPosition += 10;
      }

      // Separador entre refeições
      if (index < sortedMeals.length - 1) {
        doc.setDrawColor(220, 220, 220);
        doc.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 8;
      }
    });

    // Rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - 15,
        doc.internal.pageSize.height - 10,
        { align: 'right' }
      );
    }

    // Salvar PDF
    const fileName = `plano-alimentar-${format(new Date(), 'dd-MM-yyyy')}.pdf`;
    doc.save(fileName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <DialogTitle className="text-2xl">Meu Plano Alimentar</DialogTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Baixar PDF
            </Button>
          </div>
          <DialogDescription className="flex items-center gap-2 pt-2">
            <Calendar className="w-4 h-4" />
            <span>
              Período: {format(new Date(mealPlan.start_date), "dd 'de' MMMM", { locale: ptBR })}
              {' até '}
              {mealPlan.end_date
                ? format(new Date(mealPlan.end_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                : 'indeterminado'
              }
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Resumo de Macros Total */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-primary">Meta Diária Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-white/80 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {Math.round(planTotals.calories)}
                  </p>
                  <p className="text-xs text-muted-foreground">Calorias</p>
                </div>
                <div className="text-center p-3 bg-white/80 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {Math.round(planTotals.protein)}g
                  </p>
                  <p className="text-xs text-muted-foreground">Proteínas</p>
                </div>
                <div className="text-center p-3 bg-white/80 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {Math.round(planTotals.carbs)}g
                  </p>
                  <p className="text-xs text-muted-foreground">Carboidratos</p>
                </div>
                <div className="text-center p-3 bg-white/80 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {Math.round(planTotals.fat)}g
                  </p>
                  <p className="text-xs text-muted-foreground">Gorduras</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Refeições */}
          <div className="space-y-4">
            {sortedMeals.length > 0 ? (
              sortedMeals.map((meal, index) => {
                const foods = meal.meal_plan_foods || [];

                // Calcular totais da refeição
                const mealTotals = foods.reduce((acc, food) => ({
                  calories: acc.calories + (food.calories || 0),
                  protein: acc.protein + (food.protein || 0),
                  carbs: acc.carbs + (food.carbs || 0),
                  fat: acc.fat + (food.fat || 0)
                }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

                return (
                  <Card key={index} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Utensils className="w-5 h-5 text-primary" />
                          <CardTitle className="text-lg">
                            {translateMealType(meal.meal_type)}
                          </CardTitle>
                          {meal.meal_time && (
                            <Badge variant="outline" className="text-xs">
                              {meal.meal_time}
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">
                            {Math.round(mealTotals.calories)} kcal
                          </p>
                        </div>
                      </div>
                      {meal.name && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {meal.name}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      {foods.length > 0 ? (
                        <div className="space-y-2">
                          {/* Tabela de alimentos */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="text-left p-2 font-semibold">Alimento</th>
                                  <th className="text-right p-2 font-semibold">Quantidade</th>
                                  <th className="text-right p-2 font-semibold">Calorias</th>
                                  <th className="text-right p-2 font-semibold hidden md:table-cell">Prot.</th>
                                  <th className="text-right p-2 font-semibold hidden md:table-cell">Carb.</th>
                                  <th className="text-right p-2 font-semibold hidden md:table-cell">Gord.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {foods.map((food, idx) => (
                                  <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="p-2">{food.foods?.name || 'Alimento'}</td>
                                    <td className="p-2 text-right whitespace-nowrap">
                                      {formatQuantityWithUnit(food.quantity || 0, food.unit || '')}
                                    </td>
                                    <td className="p-2 text-right font-medium whitespace-nowrap">
                                      {Math.round(food.calories || 0)} kcal
                                    </td>
                                    <td className="p-2 text-right text-muted-foreground hidden md:table-cell">
                                      {Math.round(food.protein || 0)}g
                                    </td>
                                    <td className="p-2 text-right text-muted-foreground hidden md:table-cell">
                                      {Math.round(food.carbs || 0)}g
                                    </td>
                                    <td className="p-2 text-right text-muted-foreground hidden md:table-cell">
                                      {Math.round(food.fat || 0)}g
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Totais da refeição (Mobile) */}
                          <div className="md:hidden mt-3 p-2 bg-muted/30 rounded text-xs">
                            <p className="font-semibold mb-1">Totais desta refeição:</p>
                            <p className="text-muted-foreground">
                              P: {Math.round(mealTotals.protein)}g |
                              C: {Math.round(mealTotals.carbs)}g |
                              G: {Math.round(mealTotals.fat)}g
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum alimento cadastrado nesta refeição
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <Utensils className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Nenhuma refeição cadastrada neste plano
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
