export type FoodRequest =
  | { action: 'search'; query: string }
  | { action: 'product'; productCode: string };

export function validateFoodRequest(value: unknown): FoodRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action === 'search' && typeof body.query === 'string') {
    const query = body.query.trim().replace(/\s+/g, ' ');
    if (query.length >= 3 && query.length <= 100 && !/[\x00-\x1f\x7f]/.test(query)) {
      return { action: 'search', query };
    }
  }
  if (body.action === 'product' && typeof body.productCode === 'string') {
    const productCode = body.productCode.trim();
    if (/^(?:fs_[0-9]{1,18}|[A-Za-z0-9_-]{3,32})$/.test(productCode)) {
      return { action: 'product', productCode };
    }
  }
  return null;
}
