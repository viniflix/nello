export function reorderMeals(meals, from, to) {
  if (from < 0 || to < 0 || from >= meals.length || to >= meals.length) return meals;
  const next = [...meals];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next.map((meal,index) => ({...meal,order_index:index}));
}
export function ensureMealFoodIds(foods = [], newId = () => crypto.randomUUID()) {
  return foods.map(food => ({ ...food, tempId: food.tempId ?? food.id ?? newId() }));
}
export function duplicateMeal(meal, newId = () => crypto.randomUUID()) {
  const {id,dbId,tempId,...copy} = meal;
  return {...copy,name:`${meal.name} (cópia)`,tempId:newId(),foods:(meal.foods || []).map(food => {
    const {id,dbId,tempId,...copy} = food;
    return {...copy,tempId:newId(),substitutes:(food.substitutes || []).map(sub => ({...sub,measure:sub.measure ? {...sub.measure} : null}))};
  })};
}
