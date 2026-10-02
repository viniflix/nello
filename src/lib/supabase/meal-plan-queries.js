// Stable public API. Implementations are separated by responsibility.
export {calculateMacroTargets} from './meal-plan-query-model';
export {simulateMealPlanPortionAdjustment,createMealPlan,updateMealPlan,archiveMealPlan,setActiveMealPlan,deleteMealPlan,copyMealPlanToPatient,copyMealPlan,createMealPlanVersionSnapshot,updateFullMealPlan,restoreMealPlanVersion,promoteDraftToActive,saveDraftAsPlan,saveFoodSubstitutions} from './meal-plan-query-write';
export {getMealPlans,getMealPlansByIds,getMealPlanById,getActiveMealPlan,getMealsInPlan,getFoodsInMeal,calculateNutrition,getMealPlanVersions,getDraftMealPlan,getDraftMealPlans,getFoodSubstitutions,getSuggestedSubstitutes} from './meal-plan-query-read';
export {addMealToPlan,saveDraftMeal,updateMealInPlan,deleteMealFromPlan,addFoodsToMeal,addFoodToMeal,updateFoodInMeal,removeFoodFromMeal,recalculateMealNutrition,recalculatePlanNutrition,createDraftMealPlan,updateDraftMealPlan,deleteDraftMealPlan,deleteAllDraftMealPlans} from './meal-plan-query-items';
export {saveReferenceValues,getReferenceValues,deleteReferenceValues,savePlanAsTemplate,getTemplates} from './meal-plan-query-reference';
