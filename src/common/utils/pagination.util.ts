export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildPageMeta(
  page: number,
  limit: number,
  total: number,
): PageMeta {
  const safeLimit = Math.max(1, limit);
  const safePage = Math.max(1, page);
  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 0,
  };
}
