export const DATA_PAGE_SIZE = 250;
export const MAX_DATA_ROWS = 10000;

export function pageBounds(limit = 50, offset = 0) {
  const size = Number.isFinite(Number(limit)) ? Math.min(250, Math.max(1, Math.floor(Number(limit)))) : 50;
  const start = Number.isFinite(Number(offset)) ? Math.min(100000, Math.max(0, Math.floor(Number(offset)))) : 0;
  return { size, start, end: start + size - 1 };
}

// Full reports retain all rows or fail visibly; never return a silent partial total.
export async function collectBoundedPages(build, {signal, pageSize = DATA_PAGE_SIZE, maxRows = MAX_DATA_ROWS} = {}) {
  const rows = [];
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    signal?.throwIfAborted();
    const { data, error } = await build(offset, pageSize);
    if (error) throw error;
    const page = data || [];
    if (page.length > pageSize || rows.length + page.length > maxRows) throw new Error('REPORT_ROW_LIMIT_REACHED');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error('REPORT_ROW_LIMIT_REACHED');
}
