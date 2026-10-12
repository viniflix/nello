const axisMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export function formatFinancialAxis(value) {
  const amount = Number(value);
  return Math.abs(amount) >= 1000 ? compactMoney.format(amount) : axisMoney.format(amount);
}
